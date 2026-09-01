import { supabase } from '@/src/lib/supabase';

/**
 * 사용자 차단.
 *
 * 차단하면 친구 관계가 끊기고, 상대는 내 프로필·게시글·댓글을 볼 수 없다.
 * 내가 차단한 사람의 프로필은 (차단 해제를 위해) 계속 조회할 수 있으므로,
 * 검색·친구 목록 같은 화면에서는 fetchBlockedUserIds 로 직접 걸러야 한다.
 */

export type BlockedUser = {
  id: string;
  name: string;
  tag: string | null;
  profileImageUrl: string | null;
  blockedAt: string;
};

type BlockRow = {
  blocked_id: string;
  created_at: string;
  profiles: {
    id: string;
    name: string;
    tag: string | null;
    profile_image_url: string | null;
  } | null;
};

/** 차단 + 친구 관계 해제를 한 트랜잭션에서 처리한다(block_user RPC). */
export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_target: userId });

  if (error) {
    console.warn('[blocks] Failed to block user', error);
    throw new Error('차단하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

export async function unblockUser(userId: string): Promise<void> {
  // blocker_id = auth.uid() 조건은 RLS 가 강제하므로 blocked_id 만 지정하면 된다.
  const { error } = await supabase.from('blocks').delete().eq('blocked_id', userId);

  if (error) {
    console.warn('[blocks] Failed to unblock user', error);
    throw new Error('차단을 해제하지 못했습니다.');
  }
}

/** 설정 페이지의 '차단한 계정' 목록. */
export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, created_at, profiles!blocks_blocked_id_fkey (id, name, tag, profile_image_url)')
    .order('created_at', { ascending: false })
    .returns<BlockRow[]>();

  if (error || !data) {
    console.warn('[blocks] Failed to load blocked users', error);
    return [];
  }

  return data.map((row) => ({
    id: row.blocked_id,
    name: row.profiles?.name ?? '알 수 없음',
    tag: row.profiles?.tag ?? null,
    profileImageUrl: row.profiles?.profile_image_url
      ? supabase.storage.from('profiles').getPublicUrl(row.profiles.profile_image_url).data.publicUrl
      : null,
    blockedAt: row.created_at,
  }));
}

/** 검색·목록에서 내가 차단한 사용자를 걸러낼 때 쓴다. */
export async function fetchBlockedUserIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('blocks').select('blocked_id');

  if (error || !data) {
    console.warn('[blocks] Failed to load blocked ids', error);
    return new Set();
  }

  return new Set(data.map((row) => row.blocked_id));
}
