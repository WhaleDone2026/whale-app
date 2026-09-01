import { supabase } from '@/src/lib/supabase';

/**
 * 설정 화면의 토글들.
 *
 *   - 앱 활동 알림  → user_notification_settings
 *   - 마케팅 정보 수신 / AI 모델 개선 데이터 활용 → user_terms_agreements
 *     (온보딩에서 이미 동의 여부를 저장하는 테이블이라 별도 테이블을 만들지 않았다)
 */

export type NotificationSettings = {
  allEnabled: boolean;
  commentEnabled: boolean;
  friendRequestEnabled: boolean;
  likeEnabled: boolean;
  friendPostEnabled: boolean;
};

export type NotificationSettingKey = keyof NotificationSettings;

/** 아직 행이 없는 사용자는 전부 켜진 상태로 본다. */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  allEnabled: true,
  commentEnabled: true,
  friendRequestEnabled: true,
  likeEnabled: true,
  friendPostEnabled: true,
};

type NotificationSettingsRow = {
  all_enabled: boolean;
  comment_enabled: boolean;
  friend_request_enabled: boolean;
  like_enabled: boolean;
  friend_post_enabled: boolean;
};

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('로그인이 필요합니다.');
  }

  return user.id;
}

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from('user_notification_settings')
    .select('all_enabled, comment_enabled, friend_request_enabled, like_enabled, friend_post_enabled')
    .maybeSingle<NotificationSettingsRow>();

  if (error || !data) {
    if (error) {
      console.warn('[user-settings] Failed to load notification settings', error);
    }
    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  return {
    allEnabled: data.all_enabled,
    commentEnabled: data.comment_enabled,
    friendRequestEnabled: data.friend_request_enabled,
    likeEnabled: data.like_enabled,
    friendPostEnabled: data.friend_post_enabled,
  };
}

/**
 * 토글 하나를 저장한다.
 * 행이 없을 수 있으므로 update 가 아니라 upsert 로, 나머지 값도 같이 실어 보낸다.
 */
export async function saveNotificationSetting(
  current: NotificationSettings,
  key: NotificationSettingKey,
  value: boolean,
): Promise<void> {
  const userId = await requireUserId();
  const next = { ...current, [key]: value };

  const { error } = await supabase.from('user_notification_settings').upsert(
    {
      user_id: userId,
      all_enabled: next.allEnabled,
      comment_enabled: next.commentEnabled,
      friend_request_enabled: next.friendRequestEnabled,
      like_enabled: next.likeEnabled,
      friend_post_enabled: next.friendPostEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.warn('[user-settings] Failed to save notification setting', { key, error });
    throw new Error('알림 설정을 저장하지 못했습니다.');
  }
}

export type TermsPreferences = {
  /** 마케팅 정보 수신 (알림 설정 화면) */
  marketingAgreed: boolean;
  /** AI 모델 개선을 위한 데이터 활용 (개인정보 설정 화면) */
  aiTrainingAgreed: boolean;
};

type TermsPreferencesRow = {
  marketing_agreed: boolean | null;
  ai_training_agreed: boolean | null;
};

export async function fetchTermsPreferences(): Promise<TermsPreferences> {
  const { data, error } = await supabase
    .from('user_terms_agreements')
    .select('marketing_agreed, ai_training_agreed')
    .maybeSingle<TermsPreferencesRow>();

  if (error || !data) {
    if (error) {
      console.warn('[user-settings] Failed to load terms preferences', error);
    }
    return { marketingAgreed: false, aiTrainingAgreed: false };
  }

  return {
    marketingAgreed: Boolean(data.marketing_agreed),
    aiTrainingAgreed: Boolean(data.ai_training_agreed),
  };
}

/**
 * 선택 동의 항목을 켜고 끈다.
 * 온보딩을 마친 사용자는 행이 이미 있으므로 update 로 충분하다.
 * (필수 약관 컬럼을 건드리지 않으려면 upsert 보다 update 가 안전하다)
 */
export async function saveTermsPreference(
  key: keyof TermsPreferences,
  value: boolean,
): Promise<void> {
  const userId = await requireUserId();
  const column = key === 'marketingAgreed' ? 'marketing_agreed' : 'ai_training_agreed';

  const { error } = await supabase
    .from('user_terms_agreements')
    .update({ [column]: value })
    .eq('user_id', userId);

  if (error) {
    console.warn('[user-settings] Failed to save terms preference', { key, error });
    throw new Error('설정을 저장하지 못했습니다.');
  }
}
