import { supabase } from '@/src/lib/supabase';
import { fetchBlockedUserIds } from '@/src/services/blocks';
import type { AppUser } from '@/src/services/users';
import { mapUserRowToAppUser } from '@/src/services/users';

type FriendRequestRow = {
  requester_id: string;
  addressee_id: string;
};

type ProfileRow = {
  id: string;
  name: string;
  tag: string;
  profile_image_url: string | null;
  description: string | null;
  installed_at: string;
  intimacy_level: number;
  whale_id: number | null;
};

export async function fetchAcceptedFriendIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('friend_requests')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .returns<FriendRequestRow[]>();

  if (error || !data) {
    console.warn('[friends] Failed to load friend ids', {
      code: error?.code,
      message: error?.message,
    });
    return [];
  }

  return data.map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id));
}

export async function fetchAcceptedFriendsForUser(userId: string): Promise<AppUser[]> {
  const friendIds = await fetchAcceptedFriendIds(userId);

  if (friendIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, tag, profile_image_url, description, installed_at, intimacy_level, whale_id')
    .in('id', friendIds)
    .returns<ProfileRow[]>();

  if (error || !data) {
    console.warn('[friends] Failed to load friend profiles', {
      code: error?.code,
      message: error?.message,
    });
    return [];
  }

  return data.map(mapUserRowToAppUser);
}

export function buildFeedUserIds(userId: string, friendIds: string[]): string[] {
  return [...new Set([userId, ...friendIds])];
}

/**
 * 나와 상대방 사이의 친구 관계 상태.
 * - none: 아무 관계 없음 (친구 추가 가능)
 * - requested: 내가 보낸 요청이 대기중
 * - incoming: 상대가 나에게 보낸 요청이 대기중
 * - friend: 이미 친구
 */
export type FriendRelationStatus = 'none' | 'requested' | 'incoming' | 'friend';

export async function searchUsersByKeyword(
  keyword: string,
  currentUserId: string,
): Promise<AppUser[]> {
  const trimmed = keyword.trim();

  if (!trimmed) {
    return [];
  }

  // PostgREST의 `.or` 필터는 `,` 와 `()` 를 구분자로 사용하므로 제거해 필터가 깨지지 않게 한다.
  const safe = trimmed.replace(/[,()]/g, '').replace(/^@/, '');

  if (!safe) {
    return [];
  }

  const pattern = `%${safe}%`;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, tag, profile_image_url, description, installed_at, intimacy_level, whale_id')
    .neq('id', currentUserId)
    .or(`name.ilike.${pattern},tag.ilike.${pattern}`)
    .limit(20)
    .returns<ProfileRow[]>();

  if (error || !data) {
    console.warn('[friends] Failed to search users', {
      code: error?.code,
      message: error?.message,
    });
    return [];
  }

  // 나를 차단한 사람은 RLS 가 이미 걸러 준다. 내가 차단한 사람은 (차단 해제를 위해)
  // 프로필이 계속 보이므로 검색 결과에서는 직접 제외한다.
  const blockedIds = await fetchBlockedUserIds();

  return data.filter((row) => !blockedIds.has(row.id)).map(mapUserRowToAppUser);
}

type FriendRequestStatusRow = {
  requester_id: string;
  addressee_id: string;
  status: string;
};

export async function fetchRelationStatuses(
  currentUserId: string,
  otherIds: string[],
): Promise<Record<string, FriendRelationStatus>> {
  const result: Record<string, FriendRelationStatus> = {};
  otherIds.forEach((id) => {
    result[id] = 'none';
  });

  if (otherIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from('friend_requests')
    .select('requester_id, addressee_id, status')
    .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
    .returns<FriendRequestStatusRow[]>();

  if (error || !data) {
    console.warn('[friends] Failed to load relation statuses', {
      code: error?.code,
      message: error?.message,
    });
    return result;
  }

  const otherSet = new Set(otherIds);

  data.forEach((row) => {
    const other = row.requester_id === currentUserId ? row.addressee_id : row.requester_id;

    if (!otherSet.has(other)) {
      return;
    }

    if (row.status === 'accepted') {
      result[other] = 'friend';
      return;
    }

    if (row.status === 'pending' && result[other] !== 'friend') {
      result[other] = row.requester_id === currentUserId ? 'requested' : 'incoming';
    }
  });

  return result;
}

export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string,
): Promise<void> {
  const { error } = await supabase.from('friend_requests').insert({
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: 'pending',
  });

  if (error) {
    throw new Error(error.message ?? '친구 요청 중 문제가 발생했습니다.');
  }
}

/** 내가 보낸 대기중(pending) 친구 요청을 취소(요청 행 삭제)한다. */
export async function cancelFriendRequest(
  requesterId: string,
  addresseeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('friend_requests')
    .delete()
    .eq('requester_id', requesterId)
    .eq('addressee_id', addresseeId)
    .eq('status', 'pending');

  if (error) {
    throw new Error(error.message ?? '친구 요청 취소에 실패했습니다.');
  }
}

/** 나에게 온 대기중(pending) 친구 요청을 보낸 사람들의 프로필 목록을 반환한다. */
export async function fetchIncomingFriendRequests(userId: string): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('friend_requests')
    .select('requester_id, created_at')
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .returns<{ requester_id: string; created_at: string }[]>();

  if (error || !data) {
    console.warn('[friends] Failed to load incoming requests', {
      code: error?.code,
      message: error?.message,
    });
    return [];
  }

  const requesterIds = data.map((row) => row.requester_id);

  if (requesterIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, tag, profile_image_url, description, installed_at, intimacy_level, whale_id')
    .in('id', requesterIds)
    .returns<ProfileRow[]>();

  if (profilesError || !profiles) {
    console.warn('[friends] Failed to load requester profiles', {
      code: profilesError?.code,
      message: profilesError?.message,
    });
    return [];
  }

  // 요청 최신순 정렬을 유지한다.
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  return requesterIds
    .map((id) => profilesById.get(id))
    .filter((profile): profile is ProfileRow => Boolean(profile))
    .map(mapUserRowToAppUser);
}

/** 친구 요청을 수락(accepted)하거나 거절(요청 행 삭제)한다. */
export async function respondToFriendRequest(
  requesterId: string,
  addresseeId: string,
  accept: boolean,
): Promise<void> {
  if (accept) {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('requester_id', requesterId)
      .eq('addressee_id', addresseeId);

    if (error) {
      throw new Error(error.message ?? '친구 요청 수락에 실패했습니다.');
    }

    return;
  }

  const { error } = await supabase
    .from('friend_requests')
    .delete()
    .eq('requester_id', requesterId)
    .eq('addressee_id', addresseeId);

  if (error) {
    throw new Error(error.message ?? '친구 요청 거절에 실패했습니다.');
  }
}
