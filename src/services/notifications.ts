import type { ImageSourcePropType } from 'react-native';

import { supabase } from '@/src/lib/supabase';
import {
  fetchNotificationSettings,
  type NotificationSettingKey,
  type NotificationSettings,
} from '@/src/services/user-settings';

export type NotificationType = 'like' | 'comment' | 'reply' | 'new_post';
export type NotificationSection = 'today' | 'last_week';

type ProfileRow = {
  id: string;
  name: string;
  profile_image_url: string | null;
};

type NotificationRow = {
  id: string;
  type: NotificationType;
  actor_user_id: string;
  post_id: string | null;
  post_image_url: string | null;
  comment_content: string | null;
  is_read: boolean;
  created_at: string;
};

export type AppNotification = {
  id: string;
  type: NotificationType;
  actorUserId: string;
  actorName?: string;
  actorProfileImage?: ImageSourcePropType;
  targetPostId?: string;
  postImage?: ImageSourcePropType;
  commentContent?: string;
  occurredAt: string;
  relativeTime: string;
  section: NotificationSection;
  isNew?: boolean;
};

/**
 * 알림 종류별로 볼 설정 토글. 푸시(send-push Edge Function)와 같은 규칙이다 —
 * 답글은 따로 토글이 없어서 댓글 스위치를 같이 쓴다.
 */
const SETTING_KEY_BY_TYPE: Record<NotificationType, NotificationSettingKey> = {
  like: 'likeEnabled',
  comment: 'commentEnabled',
  reply: 'commentEnabled',
  new_post: 'friendPostEnabled',
};

/**
 * 지금 받기로 한 알림 종류.
 *
 * 알림 행 자체는 설정과 무관하게 쌓인다(트리거가 만든다). 껐던 기간의 기록을 지우지
 * 않고 화면에서만 걸러야, 다시 켰을 때 그동안의 알림을 볼 수 있다.
 */
function getEnabledTypes(settings: NotificationSettings): NotificationType[] {
  if (!settings.allEnabled) {
    return [];
  }

  return (Object.keys(SETTING_KEY_BY_TYPE) as NotificationType[]).filter(
    (type) => settings[SETTING_KEY_BY_TYPE[type]],
  );
}

function getPublicStorageUrl(bucket: 'profiles' | 'posts', path: string | null) {
  if (!path) {
    return undefined;
  }

  if (path.startsWith('http')) {
    return path;
  }

  const storagePath = path.startsWith(`${bucket}/`) ? path.replace(`${bucket}/`, '') : path;

  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

function getRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (Number.isNaN(date.getTime()) || diffMs < 0) {
    return '';
  }

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) {
    return '방금 전';
  }

  if (minutes < 60) {
    return `${minutes}분`;
  }

  if (hours < 24) {
    return `${hours}시간`;
  }

  if (days < 7) {
    return `${days}일`;
  }

  return `${Math.floor(days / 7)}주`;
}

function getSection(value: string): NotificationSection {
  const date = new Date(value);
  const today = new Date();

  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return 'today';
  }

  return 'last_week';
}

export async function fetchNotificationsForUserId(recipientId: string): Promise<AppNotification[]> {
  const settings = await fetchNotificationSettings();
  const enabledTypes = getEnabledTypes(settings);

  // 전부 껐으면 조회할 것도 없다. .in('type', []) 는 쿼리가 깨지므로 여기서 끊는다.
  if (enabledTypes.length === 0) {
    return [];
  }

  const { data: notifications, error: notificationsError } = await supabase
    .from('notifications')
    .select('id, type, actor_user_id, post_id, post_image_url, comment_content, is_read, created_at')
    .eq('recipient_user_id', recipientId)
    .in('type', enabledTypes)
    .order('created_at', { ascending: false })
    .returns<NotificationRow[]>();

  if (notificationsError || !notifications) {
    console.warn('[notifications] Failed to load notifications', {
      code: notificationsError?.code,
      message: notificationsError?.message,
      details: notificationsError?.details,
      hint: notificationsError?.hint,
    });
    return [];
  }

  const actorIds = [...new Set(notifications.map((notification) => notification.actor_user_id))];
  const { data: actors, error: actorsError } = await supabase
    .from('profiles')
    .select('id, name, profile_image_url')
    .in('id', actorIds)
    .returns<ProfileRow[]>();

  if (actorsError) {
    console.warn('[notifications] Failed to load notification actors', actorsError);
  }

  const actorsById = new Map((actors ?? []).map((actor) => [actor.id, actor]));

  return notifications.map((notification) => {
    const actor = actorsById.get(notification.actor_user_id);
    const actorProfileImageUrl = getPublicStorageUrl('profiles', actor?.profile_image_url ?? null);
    const postImageUrl = getPublicStorageUrl('posts', notification.post_image_url);

    return {
      id: notification.id,
      type: notification.type,
      actorUserId: notification.actor_user_id,
      actorName: actor?.name,
      actorProfileImage: actorProfileImageUrl ? { uri: actorProfileImageUrl } : undefined,
      targetPostId: notification.post_id ?? undefined,
      postImage: postImageUrl ? { uri: postImageUrl } : undefined,
      commentContent: notification.comment_content ?? undefined,
      occurredAt: notification.created_at,
      relativeTime: getRelativeTime(notification.created_at),
      section: getSection(notification.created_at),
      isNew: !notification.is_read,
    };
  });
}

/**
 * 확인하지 않은 알림이 하나라도 있는지 본다. 아이콘의 레드닷 판단에만 쓴다.
 *
 * 개수가 아니라 존재 여부만 필요해서 head 요청으로 count 만 받아 온다 — 목록을
 * 통째로 내려받으면 탭을 옮길 때마다 쓸데없이 트래픽이 든다.
 *
 * 친구 요청을 같이 세는 이유: 알림 화면이 친구 요청을 목록과 별개로 보여주고 있어서,
 * notifications 만 세면 요청이 와 있는데도 점이 안 찍힌다. 요청은 읽음 상태가 없고
 * 수락·거절해야 사라지므로, 응답할 때까지 점이 남는다(할 일이 남아 있다는 뜻).
 *
 * 끈 종류는 목록에 안 보이므로 점도 찍지 않는다. 다만 친구 요청은 알림이 아니라
 * 처리해야 할 일이라서, 설정과 무관하게 항상 센다 — 감추면 수락할 방법이 없다.
 */
export async function hasUnseenNotifications(userId: string): Promise<boolean> {
  const settings = await fetchNotificationSettings();
  const enabledTypes = getEnabledTypes(settings);

  const [unread, requests] = await Promise.all([
    enabledTypes.length === 0
      ? Promise.resolve({ count: 0, error: null })
      : supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_user_id', userId)
          .in('type', enabledTypes)
          .eq('is_read', false),
    supabase
      .from('friend_requests')
      .select('requester_id', { count: 'exact', head: true })
      .eq('addressee_id', userId)
      .eq('status', 'pending'),
  ]);

  if (unread.error) {
    console.warn('[notifications] Failed to count unread', unread.error);
  }
  if (requests.error) {
    console.warn('[notifications] Failed to count friend requests', requests.error);
  }

  return (unread.count ?? 0) > 0 || (requests.count ?? 0) > 0;
}

/**
 * 안 읽은 알림을 전부 읽음으로 바꾼다. 알림 화면을 열었을 때 호출한다.
 *
 * 화면에 이미 그려진 NEW 뱃지는 그대로 둔다 — 보고 있는 도중에 뱃지가 사라지면
 * 무엇이 새 알림이었는지 알 수 없다. 다음에 들어오면 깨끗해진다.
 */
export async function markNotificationsRead(userId: string): Promise<void> {
  const settings = await fetchNotificationSettings();
  const enabledTypes = getEnabledTypes(settings);

  // 화면에 안 보이는 종류까지 읽음으로 바꾸지 않는다. 나중에 다시 켰을 때
  // 그동안 온 알림이 NEW 로 보여야 한다.
  if (enabledTypes.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_user_id', userId)
    .in('type', enabledTypes)
    .eq('is_read', false);

  if (error) {
    console.warn('[notifications] Failed to mark notifications read', error);
  }
}

export async function fetchNotificationsForUserTag(tag: string): Promise<AppNotification[]> {
  const { data: recipient, error: recipientError } = await supabase
    .from('profiles')
    .select('id')
    .eq('tag', tag)
    .maybeSingle<{ id: string }>();

  if (recipientError || !recipient?.id) {
    console.warn('[notifications] Failed to load recipient profile', recipientError);
    return [];
  }

  return fetchNotificationsForUserId(recipient.id);
}
