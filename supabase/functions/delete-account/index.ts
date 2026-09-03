/**
 * 회원탈퇴 전용 함수.
 *
 * 클라이언트가 현재 로그인 JWT와 소셜 재인증 증명을 보낸다. 서비스 역할 키는 이 함수
 * 안에서만 사용하며, 재인증한 소셜 계정의 provider id가 현재 Supabase 사용자와 같을 때만
 * 외부 연결 해제 → Storage/DB 데이터 파기 → auth.users 삭제 순서로 진행한다.
 *
 * 배포 전 secrets
 *   GOOGLE_OAUTH_CLIENT_ID             Google web client ID
 *   APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY
 *                                     Apple .p8 private key (개행 포함 PEM)
 *
 * 배포
 *   supabase functions deploy delete-account
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

type Provider = 'google' | 'kakao' | 'apple';
type RequestBody =
  | { provider: 'google'; idToken: string; accessToken: string }
  | { provider: 'kakao'; accessToken: string }
  | { provider: 'apple'; identityToken: string; authorizationCode: string };

const encoder = new TextEncoder();

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlJson(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as Record<string, unknown>;
}

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getProviderId(user: { identities?: Array<{ provider?: string; id?: string; identity_data?: Record<string, unknown> }> }, provider: Provider): string | null {
  const identity = user.identities?.find((item) => item.provider === provider);
  if (!identity) return null;

  const subject = identity.identity_data?.sub;
  return typeof subject === 'string' ? subject : identity.id ?? null;
}

async function verifyGoogle(idToken: string, expectedAudience: string): Promise<string> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new Error('Google 재인증을 검증하지 못했습니다.');
  const claims = (await response.json()) as { sub?: string; aud?: string; exp?: string };
  if (!claims.sub || claims.aud !== expectedAudience || Number(claims.exp) <= Date.now() / 1000) {
    throw new Error('Google 재인증 정보가 유효하지 않습니다.');
  }
  return claims.sub;
}

async function verifyKakao(accessToken: string): Promise<string> {
  const response = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('카카오 재인증을 검증하지 못했습니다.');
  const data = (await response.json()) as { id?: number | string };
  if (data.id === undefined) throw new Error('카카오 계정 정보를 확인하지 못했습니다.');
  return String(data.id);
}

async function verifyApple(identityToken: string, expectedAudience: string): Promise<string> {
  const [encodedHeader, encodedClaims, encodedSignature] = identityToken.split('.');
  if (!encodedHeader || !encodedClaims || !encodedSignature) throw new Error('Apple 재인증 정보가 올바르지 않습니다.');

  const header = base64UrlJson(encodedHeader);
  const claims = base64UrlJson(encodedClaims);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Apple 재인증 서명이 올바르지 않습니다.');

  const keysResponse = await fetch('https://appleid.apple.com/auth/keys');
  if (!keysResponse.ok) throw new Error('Apple 서명 키를 확인하지 못했습니다.');
  const keys = (await keysResponse.json()) as { keys?: JsonWebKey[] };
  const key = keys.keys?.find((candidate) => candidate.kid === header.kid);
  if (!key) throw new Error('Apple 서명 키를 찾지 못했습니다.');

  const publicKey = await crypto.subtle.importKey(
    'jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', publicKey, base64UrlToBytes(encodedSignature), encoder.encode(`${encodedHeader}.${encodedClaims}`),
  );
  const audience = claims.aud;
  const audienceMatches = audience === expectedAudience || (Array.isArray(audience) && audience.includes(expectedAudience));
  if (!valid || claims.iss !== 'https://appleid.apple.com' || !audienceMatches || typeof claims.sub !== 'string' || Number(claims.exp) <= Date.now() / 1000) {
    throw new Error('Apple 재인증 정보가 유효하지 않습니다.');
  }
  return claims.sub;
}

function pemToPkcs8(pem: string): Uint8Array {
  return base64UrlToBytes(
    pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '').replace(/\+/g, '-').replace(/\//g, '_'),
  );
}

async function createAppleClientSecret(): Promise<string> {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
  if (!teamId || !keyId || !clientId || !privateKey) throw new Error('Apple 탈퇴 서버 설정이 완료되지 않았습니다.');

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64Url(JSON.stringify({ iss: teamId, iat: now, exp: now + 60 * 60 * 24 * 30, aud: 'https://appleid.apple.com', sub: clientId }));
  const signingKey = await crypto.subtle.importKey('pkcs8', pemToPkcs8(privateKey.replace(/\\n/g, '\n')), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, encoder.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${base64Url(signature)}`;
}

async function revokeApple(authorizationCode: string): Promise<void> {
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  if (!clientId) throw new Error('Apple 탈퇴 서버 설정이 완료되지 않았습니다.');
  const clientSecret = await createAppleClientSecret();
  const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: authorizationCode, grant_type: 'authorization_code' }),
  });
  const tokens = (await tokenResponse.json()) as { refresh_token?: string; access_token?: string };
  const token = tokens.refresh_token ?? tokens.access_token;
  if (!tokenResponse.ok || !token) throw new Error('Apple 연결 해제 토큰을 발급하지 못했습니다.');
  const revokeResponse = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token, token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token' }),
  });
  if (!revokeResponse.ok) throw new Error('Apple 연결 해제에 실패했습니다.');
}

async function removeStorageFolder(supabase: ReturnType<typeof createClient>, bucket: string, folder: string): Promise<void> {
  const paths: string[] = [];
  const queue = [folder];
  while (queue.length) {
    const prefix = queue.pop()!;
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw new Error(`${bucket} 저장소 목록을 읽지 못했습니다.`);
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      if (item.id) paths.push(path); else queue.push(path);
    }
  }
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) throw new Error(`${bucket} 저장소 삭제에 실패했습니다.`);
  }
}

async function deleteRows(supabase: ReturnType<typeof createClient>, table: string, column: string, userId: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq(column, userId);
  // 프로젝트마다 선택 기능(그룹 등)의 테이블이 아직 만들어지지 않은 경우가 있다.
  // Postgres(42P01)와 PostgREST schema cache(PGRST205) 모두 "테이블 없음"이므로 건너뛴다.
  if (error && !['42P01', 'PGRST205'].includes(error.code)) {
    console.error('[delete-account] row deletion failed', {
      table,
      column,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`${table} 데이터 삭제에 실패했습니다. (${error.code ?? 'unknown'})`);
  }
}

async function deleteAppData(supabase: ReturnType<typeof createClient>, userId: string): Promise<void> {
  await Promise.all([removeStorageFolder(supabase, 'posts', userId), removeStorageFolder(supabase, 'profiles', userId)]);
  // 내 글에 다른 사용자가 남긴 댓글/좋아요도 글과 함께 없애야 FK가 남지 않는다.
  const { data: posts, error: postsError } = await supabase.from('posts').select('id').eq('user_id', userId);
  if (postsError && postsError.code !== '42P01') throw new Error('게시글 목록을 읽지 못했습니다.');
  const postIds = (posts ?? []).map((post: { id: string }) => post.id);
  if (postIds.length) {
    const { data: comments, error: commentsError } = await supabase.from('comments').select('id').in('post_id', postIds);
    if (commentsError && commentsError.code !== '42P01') throw new Error('댓글 목록을 읽지 못했습니다.');
    const commentIds = (comments ?? []).map((comment: { id: string }) => comment.id);
    if (commentIds.length) {
      const { error } = await supabase.from('comment_likes').delete().in('comment_id', commentIds);
      if (error && error.code !== '42P01') throw new Error('댓글 좋아요 삭제에 실패했습니다.');
    }
    for (const table of ['comments', 'post_likes', 'post_images']) {
      const { error } = await supabase.from(table).delete().in('post_id', postIds);
      if (error && error.code !== '42P01') throw new Error(`${table} 데이터 삭제에 실패했습니다.`);
    }
  }
  // 참조하는 행부터 지운다. 새 개인 데이터 테이블을 만들면 이 목록에도 반드시 추가한다.
  for (const [table, column] of [
    ['notifications', 'actor_user_id'], ['notifications', 'recipient_user_id'],
    ['reports', 'reporter_id'], ['blocks', 'blocker_id'], ['blocks', 'blocked_id'],
    ['friend_requests', 'requester_id'], ['friend_requests', 'addressee_id'],
    ['comment_likes', 'user_id'], ['post_likes', 'user_id'], ['comments', 'user_id'],
    ['posts', 'user_id'], ['diary_categories', 'user_id'], ['user_terms_agreements', 'user_id'],
    ['user_notification_settings', 'user_id'], ['user_push_tokens', 'user_id'],
    ['ai_feedback', 'user_id'], ['inquiries', 'user_id'], ['group_members', 'user_id'],
  ]) await deleteRows(supabase, table, column, userId);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const accessToken = authorization.slice('Bearer '.length);
  const { data: auth, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !auth.user) return json(401, { error: 'unauthorized' });

  try {
    const body = (await req.json()) as RequestBody;
    const provider = body?.provider;
    if (provider !== 'google' && provider !== 'kakao' && provider !== 'apple') return json(400, { error: 'invalid_provider' });

    const { data: accountResult, error: accountError } = await supabase.auth.admin.getUserById(auth.user.id);
    if (accountError || !accountResult.user) throw new Error('계정을 확인하지 못했습니다.');
    const expectedProviderId = getProviderId(accountResult.user, provider);
    if (!expectedProviderId) throw new Error('현재 계정의 로그인 방식을 확인하지 못했습니다.');

    let verifiedProviderId: string;
    if (provider === 'google') {
      const audience = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      if (!audience) throw new Error('Google 탈퇴 서버 설정이 완료되지 않았습니다.');
      verifiedProviderId = await verifyGoogle(body.idToken, audience);
      if (verifiedProviderId !== expectedProviderId) throw new Error('현재 계정과 다른 Google 계정입니다.');
      const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: body.accessToken }) });
      if (!response.ok) throw new Error('Google 연결 해제에 실패했습니다.');
    } else if (provider === 'kakao') {
      verifiedProviderId = await verifyKakao(body.accessToken);
      if (verifiedProviderId !== expectedProviderId) throw new Error('현재 계정과 다른 카카오 계정입니다.');
      const response = await fetch('https://kapi.kakao.com/v1/user/unlink', { method: 'POST', headers: { Authorization: `Bearer ${body.accessToken}` } });
      if (!response.ok) throw new Error('카카오 연결 해제에 실패했습니다.');
    } else {
      const audience = Deno.env.get('APPLE_CLIENT_ID');
      if (!audience) throw new Error('Apple 탈퇴 서버 설정이 완료되지 않았습니다.');
      verifiedProviderId = await verifyApple(body.identityToken, audience);
      if (verifiedProviderId !== expectedProviderId) throw new Error('현재 계정과 다른 Apple 계정입니다.');
      await revokeApple(body.authorizationCode);
    }

    await deleteAppData(supabase, auth.user.id);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(auth.user.id, true);
    if (deleteError) throw new Error('계정 삭제에 실패했습니다.');
    return json(200, { deleted: true });
  } catch (error) {
    console.error('[delete-account]', error);
    return json(400, { error: error instanceof Error ? error.message : 'deletion_failed' });
  }
});
