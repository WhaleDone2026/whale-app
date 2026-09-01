/**
 * notifications 테이블에 행이 쌓이면 해당 사용자의 기기로 푸시를 보낸다.
 *
 * 호출 경로
 *   notifications INSERT → trigger(notify_push_on_notification) → pg_net → 이 함수
 *
 * 인증
 *   pg_net 은 JWT를 붙이지 못하므로 --no-verify-jwt 로 배포하고, 대신 트리거가 실어
 *   보내는 x-push-secret 헤더를 확인한다. 이게 없으면 알림 문구를 아무나 밀어 넣을 수 있다.
 *
 * 배포
 *   supabase secrets set PUSH_HOOK_SECRET=...
 *   supabase functions deploy send-push --no-verify-jwt
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Expo는 한 요청에 100건까지 받는다.
const EXPO_BATCH_SIZE = 100;

type NotificationType = 'like' | 'comment' | 'reply' | 'new_post' | 'friend_request';

type NotificationRecord = {
  // friend_request 는 notifications 테이블을 거치지 않고 트리거가 직접 만들어 보내서
  // 행 id 가 없다. 알림 탭 이후 화면 이동에만 쓰는 값이라 없어도 동작한다.
  id?: string;
  type: NotificationType;
  actor_user_id: string;
  recipient_user_id: string;
  post_id: string | null;
  comment_content: string | null;
};

/** 알림 종류별로 확인할 user_notification_settings 컬럼. */
const SETTING_COLUMN: Record<NotificationType, string> = {
  like: 'like_enabled',
  comment: 'comment_enabled',
  // 답글도 사용자에겐 댓글이다. 토글을 따로 두지 않았으므로 같은 스위치를 본다.
  reply: 'comment_enabled',
  new_post: 'friend_post_enabled',
  friend_request: 'friend_request_enabled',
};

// 알림 배너는 두어 줄만 보인다. 긴 댓글을 통째로 실으면 뒷부분은 어차피 잘리고
// 페이로드만 커진다. 줄바꿈도 한 줄로 눌러야 배너가 이상하게 벌어지지 않는다.
const COMMENT_PREVIEW_LIMIT = 50;

function preview(comment: string): string {
  const flat = comment.replace(/\s+/g, ' ').trim();
  return flat.length <= COMMENT_PREVIEW_LIMIT ? flat : `${flat.slice(0, COMMENT_PREVIEW_LIMIT)}…`;
}

function buildBody(type: NotificationType, actorName: string, comment: string | null): string {
  switch (type) {
    case 'like':
      return `${actorName}님이 회원님의 글을 좋아해요.`;
    case 'comment':
      return comment ? `${actorName}님의 댓글: ${preview(comment)}` : `${actorName}님이 댓글을 남겼어요.`;
    case 'reply':
      return comment ? `${actorName}님의 답글: ${preview(comment)}` : `${actorName}님이 답글을 남겼어요.`;
    case 'new_post':
      return `${actorName}님이 새 글을 올렸어요.`;
    case 'friend_request':
      return `${actorName}님이 친구 요청을 보냈어요.`;
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_HOOK_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  let payload: { record?: NotificationRecord } & Partial<NotificationRecord>;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  // 커스텀 트리거는 {record}로 감싸서 보내고, 대시보드 Database Webhook도 같은 모양이다.
  // 혹시 행만 그대로 오는 경우까지 받아 준다.
  const record = (payload.record ?? payload) as NotificationRecord;
  if (!record?.recipient_user_id || !record?.type) {
    return new Response('missing fields', { status: 400 });
  }

  // 자기 글에 자기가 남긴 반응까지 알릴 필요는 없다.
  if (record.actor_user_id === record.recipient_user_id) {
    return Response.json({ skipped: 'self' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1) 수신 거부 확인. 행이 없으면 '전부 켜짐'이 기본값이다(테이블 주석과 같은 규칙).
  const settingColumn = SETTING_COLUMN[record.type];
  const { data: settings, error: settingsError } = await supabase
    .from('user_notification_settings')
    .select(`all_enabled, ${settingColumn}`)
    .eq('user_id', record.recipient_user_id)
    .maybeSingle();

  if (settingsError) {
    // 조회가 깨졌는데 그냥 보내면 알림을 끈 사용자에게 푸시가 간다. 끄는 쪽으로 판단한다.
    console.error('[push] 알림 설정 조회 실패, 발송을 건너뜁니다', settingsError);
    return Response.json({ skipped: 'settings-error' }, { status: 200 });
  }

  if (settings) {
    const row = settings as Record<string, boolean>;
    if (!row.all_enabled || row[settingColumn] === false) {
      return Response.json({ skipped: 'disabled' });
    }
  }

  // 2) 기기 토큰
  const { data: tokens } = await supabase
    .from('user_push_tokens')
    .select('token')
    .eq('user_id', record.recipient_user_id);

  if (!tokens?.length) {
    return Response.json({ skipped: 'no-token' });
  }

  // 3) 보낸 사람 이름. 못 찾아도 알림 자체는 나가야 하므로 기본값을 둔다.
  const { data: actor } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', record.actor_user_id)
    .maybeSingle<{ name: string | null }>();

  const body = buildBody(record.type, actor?.name ?? '친구', record.comment_content);

  const messages = tokens.map(({ token }) => ({
    to: token,
    title: '칭찬고래',
    body,
    sound: 'default',
    channelId: 'default',
    // 앱이 알림을 탭했을 때 어디로 갈지 판단하는 데 쓴다.
    data: {
      notificationId: record.id,
      type: record.type,
      postId: record.post_id,
    },
  }));

  const invalidTokens: string[] = [];
  let sent = 0;

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      console.error('[push] Expo 응답 오류', response.status, await response.text());
      continue;
    }

    const result = (await response.json()) as {
      data?: { status: string; message?: string; details?: { error?: string } }[];
    };

    result.data?.forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        sent += 1;
        return;
      }
      // 앱을 지웠거나 토큰이 갈린 기기. 안 지우면 매번 실패하면서 계속 쌓인다.
      if (ticket.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(batch[index].to);
      } else {
        console.error('[push] 전송 실패', ticket.status, ticket.message);
      }
    });
  }

  if (invalidTokens.length) {
    await supabase.from('user_push_tokens').delete().in('token', invalidTokens);
  }

  return Response.json({ sent, removed: invalidTokens.length });
});
