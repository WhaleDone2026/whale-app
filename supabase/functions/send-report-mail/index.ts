/**
 * reports 에 신고가 접수되면 운영 메일로 보낸다.
 *
 * 호출 경로
 *   reports INSERT → trigger(notify_report_mail) → pg_net → 이 함수 → Resend
 *
 * 인증
 *   pg_net 은 JWT를 붙이지 못하므로 --no-verify-jwt 로 배포하고, 대신 트리거가 실어
 *   보내는 x-report-secret 헤더를 확인한다. 없으면 아무나 운영 메일함에 글을 쏠 수 있다.
 *
 * 왜 앱에서 직접 부르지 않나
 *   API 키를 클라이언트에 둘 수 없고, 앱이 중간에 죽으면 신고 행만 남고 메일이 빠진다.
 *   트리거를 태우면 접수된 신고는 반드시 메일이 나간다.
 *
 * 배포
 *   supabase secrets set REPORT_HOOK_SECRET=... RESEND_API_KEY=...
 *   supabase functions deploy send-report-mail --no-verify-jwt
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_URL = 'https://api.resend.com/emails';

// 도메인 인증 전에는 Resend 계정 소유 주소로만 나간다. 받는 곳이 운영 메일함 하나뿐이라
// onboarding@resend.dev 로도 충분하다. 도메인을 붙이면 REPORT_FROM 만 갈아 끼우면 된다.
const DEFAULT_FROM = '칭찬고래 신고 <onboarding@resend.dev>';
const DEFAULT_TO = 'whaledonekr@gmail.com';

type TargetType = 'post' | 'comment' | 'user';

type ReportRecord = {
  id: string;
  reporter_id: string;
  target_type: TargetType;
  target_id: string;
  reason: string | null;
  detail: string | null;
  status: string;
  created_at: string;
};

/** 앱의 REPORT_REASONS 와 같은 목록. 코드가 늘면 양쪽을 같이 고쳐야 한다. */
const REASON_LABEL: Record<string, string> = {
  spam: '스팸 또는 광고',
  sexual: '성적인 콘텐츠',
  violence: '폭력 또는 혐오',
  harassment: '괴롭힘 또는 따돌림',
  false_info: '거짓 정보',
  etc: '기타',
};

const TARGET_LABEL: Record<TargetType, string> = {
  post: '게시글',
  comment: '댓글',
  user: '사용자',
};

type Person = { id: string; name: string; tag: string | null };

/** 메일 본문에 쓰는 사람 표기 — 이름(@태그, id) */
function person(p: Person | null, fallbackId: string): string {
  if (!p) {
    return `(알 수 없음, ${fallbackId})`;
  }
  return `${p.name}${p.tag ? ` (@${p.tag})` : ''} · ${p.id}`;
}

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
  const secret = Deno.env.get('REPORT_HOOK_SECRET');
  if (!secret || req.headers.get('x-report-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('[report-mail] RESEND_API_KEY 가 없습니다');
    return new Response('missing api key', { status: 500 });
  }

  let payload: { record?: ReportRecord } & Partial<ReportRecord>;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const record = (payload.record ?? payload) as ReportRecord;
  if (!record?.id || !record?.target_type || !record?.target_id) {
    return new Response('missing fields', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // service_role 로 읽으므로 RLS·차단과 무관하게 대상 정보가 다 실린다.
  const { data: reporter } = await supabase
    .from('profiles')
    .select('id, name, tag')
    .eq('id', record.reporter_id)
    .maybeSingle<Person>();

  let owner: Person | null = null;
  let content: string | null = null;
  let imageUrls: string[] = [];

  if (record.target_type === 'user') {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, tag')
      .eq('id', record.target_id)
      .maybeSingle<Person>();
    owner = data ?? null;
  } else if (record.target_type === 'post') {
    const { data } = await supabase
      .from('posts')
      .select('contents, profiles!posts_user_id_fkey (id, name, tag), post_images (image_url, sort_order)')
      .eq('id', record.target_id)
      .maybeSingle<{
        contents: string | null;
        profiles: Person | null;
        post_images: { image_url: string; sort_order: number }[];
      }>();

    owner = data?.profiles ?? null;
    content = data?.contents ?? null;
    imageUrls = (data?.post_images ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ image_url }) => supabase.storage.from('posts').getPublicUrl(image_url).data.publicUrl);
  } else {
    const { data } = await supabase
      .from('comments')
      .select('content, post_id, profiles!comments_user_id_fkey (id, name, tag)')
      .eq('id', record.target_id)
      .maybeSingle<{ content: string | null; post_id: string; profiles: Person | null }>();

    owner = data?.profiles ?? null;
    content = data?.content ?? null;
  }

  const reasonLabel = REASON_LABEL[record.reason ?? ''] ?? record.reason ?? '(사유 없음)';
  const targetLabel = TARGET_LABEL[record.target_type];

  const lines = [
    `접수 시각 : ${toKst(record.created_at)} (KST)`,
    `신고 번호 : ${record.id}`,
    `상태      : ${record.status}`,
    '',
    `신고자    : ${person(reporter ?? null, record.reporter_id)}`,
    `대상 종류 : ${targetLabel}`,
    `대상 ID   : ${record.target_id}`,
    `대상 작성자: ${person(owner, '-')}`,
    '',
    `사유      : ${reasonLabel} (${record.reason ?? '-'})`,
    `상세 내용 : ${record.detail ?? '(없음)'}`,
  ];

  if (record.target_type !== 'user') {
    lines.push('', '--- 신고된 내용 ---', content?.trim() || '(본문 없음)');
  }

  if (imageUrls.length) {
    lines.push('', '--- 첨부 이미지 ---', ...imageUrls);
  }

  const text = lines.join('\n');
  const html = `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</pre>${
    imageUrls.map((url) => `<p><img src="${escapeHtml(url)}" alt="" style="max-width:420px"></p>`).join('')
  }`;

  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('REPORT_FROM') ?? DEFAULT_FROM,
      to: [Deno.env.get('REPORT_TO_EMAIL') ?? DEFAULT_TO],
      // 답장하면 신고자가 아니라 운영에게 가야 하므로 reply_to 는 두지 않는다.
      subject: `[칭찬고래 신고] ${targetLabel} · ${reasonLabel}`,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('[report-mail] Resend 응답 오류', response.status, body);
    return new Response('send failed', { status: 502 });
  }

  return Response.json({ sent: true, reportId: record.id });
});
