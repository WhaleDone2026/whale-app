/**
 * inquiries 에 문의가 들어오면 운영 메일로 보낸다.
 *
 * 호출 경로
 *   inquiries INSERT → trigger(notify_inquiry_mail) → pg_net → 이 함수 → Resend
 *
 * 인증
 *   pg_net 은 JWT를 붙이지 못하므로 --no-verify-jwt 로 배포하고, 대신 트리거가 실어
 *   보내는 x-inquiry-secret 헤더를 확인한다.
 *
 * 신고 메일(send-report-mail)과 다른 점은 reply_to 를 붙인다는 것이다.
 * 문의는 답장을 해 줘야 하므로 메일함에서 바로 회신할 수 있어야 한다.
 *
 * 배포
 *   supabase secrets set INQUIRY_HOOK_SECRET=... RESEND_API_KEY=...
 *   supabase functions deploy send-inquiry-mail --no-verify-jwt
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_URL = 'https://api.resend.com/emails';

const DEFAULT_FROM = '칭찬고래 문의 <onboarding@resend.dev>';
const DEFAULT_TO = 'whaledonekr@gmail.com';

type InquiryRecord = {
  id: string;
  user_id: string;
  reply_email: string | null;
  content: string;
  status: string;
  created_at: string;
};

function toKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('INQUIRY_HOOK_SECRET');
  if (!secret || req.headers.get('x-inquiry-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('[inquiry-mail] RESEND_API_KEY 가 없습니다');
    return new Response('missing api key', { status: 500 });
  }

  let payload: { record?: InquiryRecord } & Partial<InquiryRecord>;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const record = (payload.record ?? payload) as InquiryRecord;
  if (!record?.id || !record?.user_id || !record?.content) {
    return new Response('missing fields', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, tag')
    .eq('id', record.user_id)
    .maybeSingle<{ name: string; tag: string | null }>();

  // 계정 이메일. 소셜 로그인이라 없을 수도 있어서 답장 주소로는 문의 폼 값을 먼저 쓴다.
  const { data: account } = await supabase.auth.admin.getUserById(record.user_id);
  const accountEmail = account?.user?.email ?? null;
  const replyTo = record.reply_email ?? accountEmail;

  const lines = [
    `접수 시각 : ${toKst(record.created_at)} (KST)`,
    `문의 번호 : ${record.id}`,
    '',
    `보낸 사람 : ${profile?.name ?? '(알 수 없음)'}${profile?.tag ? ` (@${profile.tag})` : ''}`,
    `사용자 ID : ${record.user_id}`,
    `계정 메일 : ${accountEmail ?? '(없음)'}`,
    `회신 주소 : ${replyTo ?? '(없음 — 앱 안에서 따로 연락해야 함)'}`,
    '',
    '--- 문의 내용 ---',
    record.content,
  ];

  const text = lines.join('\n');
  const preview = record.content.replace(/\s+/g, ' ').trim().slice(0, 30);

  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('REPORT_FROM') ?? DEFAULT_FROM,
      to: [Deno.env.get('REPORT_TO_EMAIL') ?? DEFAULT_TO],
      // 메일함에서 바로 '답장'을 누르면 문의한 사람에게 가도록.
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: `[칭찬고래 문의] ${profile?.name ?? '알 수 없음'} · ${preview}`,
      text,
      html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('[inquiry-mail] Resend 응답 오류', response.status, body);
    return new Response('send failed', { status: 502 });
  }

  return Response.json({ sent: true, inquiryId: record.id });
});
