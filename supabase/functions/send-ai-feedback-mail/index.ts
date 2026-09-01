/**
 * 고래 한마디 평가(따봉/붐따)가 들어오면 운영 메일로 보낸다.
 *
 * 호출 경로
 *   ai_feedback INSERT → trigger(notify_ai_feedback_mail) → pg_net → 이 함수 → Resend
 *
 * 따봉·붐따 모두 온다.
 *
 * 배포
 *   supabase secrets set AI_FEEDBACK_HOOK_SECRET=... RESEND_API_KEY=...
 *   supabase functions deploy send-ai-feedback-mail --no-verify-jwt
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_URL = 'https://api.resend.com/emails';

const DEFAULT_FROM = '칭찬고래 AI 평가 <onboarding@resend.dev>';
const DEFAULT_TO = 'whaledonekr@gmail.com';

type FeedbackRecord = {
  id: string;
  user_id: string;
  draft_id: string | null;
  feedback_type: 'positive' | 'negative';
  reasons: string[] | null;
  comment: string | null;
  whale_message: string | null;
  retry_count: number | null;
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
  const secret = Deno.env.get('AI_FEEDBACK_HOOK_SECRET');
  if (!secret || req.headers.get('x-ai-feedback-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('[ai-feedback-mail] RESEND_API_KEY 가 없습니다');
    return new Response('missing api key', { status: 500 });
  }

  let payload: { record?: FeedbackRecord } & Partial<FeedbackRecord>;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const record = (payload.record ?? payload) as FeedbackRecord;
  if (!record?.id || !record?.feedback_type) {
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

  const verdict = record.feedback_type === 'negative' ? '붐따 👎' : '따봉 👍';
  const reasons = record.reasons?.length ? record.reasons.join(', ') : '(선택 안 함)';

  const text = [
    `접수 시각 : ${toKst(record.created_at)} (KST)`,
    `평가 번호 : ${record.id}`,
    '',
    `평가      : ${verdict}`,
    `사유      : ${reasons}`,
    `코멘트    : ${record.comment ?? '(없음)'}`,
    '',
    `보낸 사람 : ${profile?.name ?? '(알 수 없음)'}${profile?.tag ? ` (@${profile.tag})` : ''}`,
    `사용자 ID : ${record.user_id}`,
    `draft_id  : ${record.draft_id ?? '(없음)'}`,
    `재생성    : ${record.retry_count ?? 0}회째 한마디`,
    '',
    '--- 평가받은 한마디 ---',
    record.whale_message ?? '(기록 없음)',
  ].join('\n');

  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('REPORT_FROM') ?? DEFAULT_FROM,
      to: [Deno.env.get('REPORT_TO_EMAIL') ?? DEFAULT_TO],
      subject: `[칭찬고래 AI 평가] ${verdict} · ${reasons}`,
      text,
      html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('[ai-feedback-mail] Resend 응답 오류', response.status, body);
    return new Response('send failed', { status: 502 });
  }

  return Response.json({ sent: true, feedbackId: record.id });
});
