import type { User } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';
import { unregisterPushToken } from '@/src/services/push';

type ProfileOnboardingRow = {
  id: string;
  name: string | null;
  tag: string | null;
  profile_image_url: string | null;
  onboarding_completed_at: string | null;
};

type TermsAgreementRow = {
  user_id: string;
  service_terms_agreed: boolean;
  privacy_policy_agreed: boolean;
};

export type TermsAgreementInput = {
  service: boolean;
  privacy: boolean;
  marketing: boolean;
  aiTraining: boolean;
};

export type OnboardingProfileInput = {
  name: string;
  tag: string;
  description: string;
  profileImageUrl?: string;
  email?: string;
};

export function normalizeTag(value: string) {
  return value.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function mapOnboardingError(error: { code?: string; message?: string }) {
  if (error.code === '23505') {
    if (error.message?.includes('profiles_name_unique')) {
      return new Error('이미 사용 중인 닉네임입니다.');
    }

    if (error.message?.includes('profiles_tag_unique')) {
      return new Error('이미 사용 중인 아이디입니다.');
    }

    return new Error('중복된 값이 있습니다.');
  }

  if (error.code === '23514') {
    return new Error('입력값 형식이 올바르지 않습니다.');
  }

  return new Error(error.message ?? '요청 처리 중 문제가 발생했습니다.');
}

export async function isProfileFieldTaken(
  field: 'name' | 'tag',
  value: string,
  excludeUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq(field, value)
    .neq('id', excludeUserId)
    .maybeSingle();

  if (error) {
    throw mapOnboardingError(error);
  }

  return Boolean(data);
}

function createPendingTag(userId: string) {
  return `tmp${userId.replace(/-/g, '').slice(0, 7)}`;
}

// name 컬럼은 NOT NULL + UNIQUE 이므로, 이름을 아직 받지 못한 소셜 로그인(예: Apple)에서도
// 유저별로 유일한 임시 이름을 넣어 stub row 를 만들 수 있게 한다. 프로필 단계에서 실제 닉네임으로 교체된다.
function createPendingName(userId: string) {
  return `user${userId.replace(/-/g, '').slice(0, 6)}`;
}

function isPlaceholderTag(tag: string | null | undefined) {
  if (!tag?.trim()) {
    return true;
  }

  return tag.startsWith('tmp') || tag.startsWith('user_');
}

async function upsertProfileStub(
  userId: string,
  seed: {
    email?: string;
    name?: string;
    profileImageUrl?: string;
  },
): Promise<void> {
  // 이미 있는 row 를 갱신할 때는 값이 있는 필드만 반영해, 기존 이름/이미지를 null 로 덮어쓰지 않는다.
  const updateFields: Record<string, string> = {};
  const email = seed.email?.trim();
  const name = seed.name?.trim();
  const profileImageUrl = seed.profileImageUrl?.trim();

  if (email) {
    updateFields.email = email;
  }
  if (name) {
    updateFields.name = name;
  }
  if (profileImageUrl) {
    updateFields.profile_image_url = profileImageUrl;
  }

  const updateProfile = async () => {
    if (Object.keys(updateFields).length === 0) {
      return;
    }

    const { error } = await supabase.from('profiles').update(updateFields).eq('id', userId);

    if (!error) {
      return;
    }

    // 소셜 계정 이름이 남이 이미 쓰는 닉네임과 겹치면 여기서 23505 가 난다. 이름은
    // 프로필 단계에서 중복 검사를 거쳐 다시 받는 값이라, 그 프리필 하나 때문에 약관
    // 동의가 막히면 안 된다. 이름만 빼고 나머지(이메일·프로필 사진)는 반영한다.
    if (error.code === '23505' && updateFields.name) {
      const { name: _droppedName, ...rest } = updateFields;

      if (Object.keys(rest).length === 0) {
        return;
      }

      const { error: retryError } = await supabase.from('profiles').update(rest).eq('id', userId);

      if (retryError) {
        throw mapOnboardingError(retryError);
      }
      return;
    }

    throw mapOnboardingError(error);
  };

  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    throw mapOnboardingError(existingError);
  }

  if (existing) {
    await updateProfile();
    return;
  }

  // 신규 row 는 NOT NULL 컬럼(name, tag)에 임시값을 채워 넣는다. 프로필 단계에서 실제 값으로 교체된다.
  const insertStub = (stubName: string) =>
    supabase.from('profiles').insert({
      id: userId,
      email: email || null,
      name: stubName,
      profile_image_url: profileImageUrl || null,
      tag: createPendingTag(userId),
    });

  let { error: insertError } = await insertStub(name || createPendingName(userId));

  // 23505 를 "이미 내 행이 있다"로만 해석하면 안 된다. name 은 UNIQUE 인데 소셜
  // 로그인은 남이 쓰는 이름을 그대로 들고 올 수 있어서, 이름 충돌도 같은 코드로 온다.
  // 그걸 id 충돌로 오인하면 행을 못 만든 채 성공한 셈 치고 넘어가고, 다음 단계인
  // user_terms_agreements 가 FK 위반으로 터진다 (구글 로그인에서 실제로 발생).
  if (insertError?.code === '23505' && name) {
    const { data: created } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle<{ id: string }>();

    if (!created) {
      // 이름이 겹친 것이므로 유저별로 유일한 임시 이름으로 다시 만든다.
      // 실제 닉네임은 다음 단계에서 중복 검사를 거쳐 받는다.
      ({ error: insertError } = await insertStub(createPendingName(userId)));
    }
  }

  if (insertError?.code === '23505') {
    await updateProfile();
    return;
  }

  if (insertError) {
    throw mapOnboardingError(insertError);
  }
}

export async function saveUserTermsAgreement(
  userId: string,
  terms: TermsAgreementInput,
  profileSeed: {
    email?: string;
    name?: string;
    profileImageUrl?: string;
  },
): Promise<void> {
  if (!terms.service || !terms.privacy) {
    throw new Error('필수 약관에 동의해 주세요.');
  }

  await upsertProfileStub(userId, profileSeed);

  const { error } = await supabase.from('user_terms_agreements').upsert(
    {
      user_id: userId,
      service_terms_agreed: terms.service,
      privacy_policy_agreed: terms.privacy,
      marketing_agreed: terms.marketing,
      ai_training_agreed: terms.aiTraining,
      agreed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    throw mapOnboardingError(error);
  }
}

export async function completeOnboardingProfile(
  userId: string,
  values: OnboardingProfileInput,
): Promise<void> {
  const name = values.name.trim();
  const tag = normalizeTag(values.tag);
  const description = values.description.trim();

  if (!name) {
    throw new Error('닉네임을 입력해 주세요.');
  }

  if (!tag) {
    throw new Error('아이디를 입력해 주세요.');
  }

  const [isNameTaken, isTagTaken] = await Promise.all([
    isProfileFieldTaken('name', name, userId),
    isProfileFieldTaken('tag', tag, userId),
  ]);

  if (isNameTaken) {
    throw new Error('이미 사용 중인 닉네임입니다.');
  }

  if (isTagTaken) {
    throw new Error('이미 사용 중인 아이디입니다.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      email: values.email?.trim() || null,
      name,
      tag,
      description,
      profile_image_url: values.profileImageUrl?.trim() || null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw mapOnboardingError(error);
  }
}

export type AuthUserMetadata = {
  nickname: string;
  profileImage: string;
  email: string;
};

export type OnboardingStatus = {
  isComplete: boolean;
  hasProfile: boolean;
  hasTermsAgreement: boolean;
  profileName: string | null;
  profileImageUrl: string | null;
};

export type PostLoginDestination = 'home' | 'onboarding';

export type OnboardingStep = 'terms' | 'profile';

export type PostLoginRoute =
  | { destination: 'home' }
  | {
      destination: 'onboarding';
      step: OnboardingStep;
      params: {
        nickname: string;
        profileImage: string;
      };
    };

export function resolveProfileImageUrl(url: string | null | undefined): string {
  if (!url?.trim()) {
    return '';
  }

  let normalized = url.trim();

  try {
    if (normalized.includes('%')) {
      normalized = decodeURIComponent(normalized);
    }
  } catch {
    // Keep the original URL when decoding fails.
  }

  if (normalized.startsWith('http://')) {
    normalized = normalized.replace('http://', 'https://');
  }

  return normalized;
}

export async function fetchOnboardingProfileSeed(user: User): Promise<{
  nickname: string;
  profileImage: string;
  email: string;
}> {
  const metadata = getAuthUserMetadata(user);

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, profile_image_url, email')
    .eq('id', user.id)
    .maybeSingle<{
      name: string | null;
      profile_image_url: string | null;
      email: string | null;
    }>();

  const profileName = profile?.name?.trim();
  const realName = profileName && profileName !== createPendingName(user.id) ? profileName : '';

  return {
    nickname: realName || metadata.nickname,
    profileImage: resolveProfileImageUrl(profile?.profile_image_url || metadata.profileImage),
    email: profile?.email?.trim() || metadata.email,
  };
}

export function getAuthUserMetadata(user: User): AuthUserMetadata {
  return {
    nickname:
      (user.user_metadata?.profile_nickname as string | undefined) ??
      (user.user_metadata?.nickname as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      '',
    profileImage: resolveProfileImageUrl(
      (user.user_metadata?.profile_image as string | undefined) ??
        (user.user_metadata?.avatar_url as string | undefined) ??
        (user.user_metadata?.picture as string | undefined) ??
        '',
    ),
    email:
      user.email ??
      (user.user_metadata?.account_email as string | undefined) ??
      (user.user_metadata?.email as string | undefined) ??
      '',
  };
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const [profileResult, termsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, tag, profile_image_url, onboarding_completed_at')
      .eq('id', userId)
      .maybeSingle<ProfileOnboardingRow>(),
    supabase
      .from('user_terms_agreements')
      .select('user_id, service_terms_agreed, privacy_policy_agreed')
      .eq('user_id', userId)
      .maybeSingle<TermsAgreementRow>(),
  ]);

  if (profileResult.error) {
    console.warn('[onboarding] Failed to load profile status', profileResult.error);
  }

  if (termsResult.error) {
    console.warn('[onboarding] Failed to load terms status', termsResult.error);
  }

  const profile = profileResult.data;
  const terms = termsResult.data;
  const profileNameValue = profile?.name?.trim();
  const realProfileName =
    profileNameValue && profileNameValue !== createPendingName(userId) ? profileNameValue : null;
  const hasProfile = Boolean(profile);
  const hasTermsAgreement = Boolean(terms?.service_terms_agreed && terms?.privacy_policy_agreed);
  const isComplete = Boolean(
    profile?.onboarding_completed_at &&
      profile.name?.trim() &&
      profile.tag?.trim() &&
      !isPlaceholderTag(profile.tag) &&
      hasTermsAgreement,
  );

  return {
    isComplete,
    hasProfile,
    hasTermsAgreement,
    profileName: realProfileName,
    profileImageUrl: profile?.profile_image_url?.trim() || null,
  };
}

export async function resolvePostLoginDestination(userId: string): Promise<PostLoginDestination> {
  const status = await getOnboardingStatus(userId);
  return status.isComplete ? 'home' : 'onboarding';
}

export async function getPostLoginRoute(user: User): Promise<PostLoginRoute> {
  const metadata = getAuthUserMetadata(user);
  const status = await getOnboardingStatus(user.id);

  if (status.isComplete) {
    return { destination: 'home' };
  }

  if (status.hasTermsAgreement) {
    return {
      destination: 'onboarding',
      step: 'profile',
      params: {
        nickname: status.profileName ?? metadata.nickname,
        profileImage: resolveProfileImageUrl(status.profileImageUrl ?? metadata.profileImage),
      },
    };
  }

  return {
    destination: 'onboarding',
    step: 'terms',
    params: {
      nickname: metadata.nickname,
      profileImage: metadata.profileImage,
    },
  };
}

export async function confirmAuthenticatedUser(): Promise<User> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw error ?? new Error('로그인 세션을 확인할 수 없습니다.');
  }

  return user;
}

export async function signInAsTestUser(): Promise<User> {
  const email = process.env.EXPO_PUBLIC_TEST_USER_EMAIL;
  const password = process.env.EXPO_PUBLIC_TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error('테스트 유저 로그인 정보가 .env에 설정되지 않았습니다.');
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    throw signInError;
  }

  return confirmAuthenticatedUser();
}

export async function signOutUser(): Promise<void> {
  // 세션이 살아 있을 때 지워야 한다. signOut 이후에는 RLS가 auth.uid() 를 못 찾아
  // 삭제가 조용히 실패하고, 로그아웃한 계정의 알림이 이 기기로 계속 온다.
  await unregisterPushToken();

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
