import { File } from 'expo-file-system';
import type { ImageSourcePropType } from 'react-native';

import { DEFAULT_WHALE_ID } from '@/constants/whales';
import { supabase } from '@/src/lib/supabase';

const DEFAULT_PROFILE_IMAGE = require('../../assets/icons/test.png') as ImageSourcePropType;

type UserRow = {
  id: string;
  name: string;
  tag: string;
  profile_image_url: string | null;
  cover_image_url?: string | null;
  description: string | null;
  installed_at: string;
  intimacy_level: number;
  whale_id: number | null;
};

type UserStats = {
  postCount: number;
  likeCount: number;
};

export type AppUser = {
  id: string;
  name: string;
  tag: string;
  profile_image: ImageSourcePropType;
  /** 커버(배경) 이미지 공개 URL. 없으면 null (연한 회색 표시) */
  cover_image_url: string | null;
  description: string;
  installed_at: string;
  intimacy_level: number;
  /** 고른 고래 종류. 친구 화면에서 이 사람을 나타내는 캐릭터로 쓴다 */
  whale_id: number;
  friends_count: number;
  like_count: number;
  post_count: number;
};

function getProfileImageSource(path: string | null): ImageSourcePropType {
  if (!path) {
    return DEFAULT_PROFILE_IMAGE;
  }

  if (path.startsWith('http')) {
    const uri = path.startsWith('http://') ? path.replace('http://', 'https://') : path;
    return { uri };
  }

  const storagePath = path.startsWith('profiles/') ? path.replace('profiles/', '') : path;
  const { data } = supabase.storage.from('profiles').getPublicUrl(storagePath);

  return { uri: data.publicUrl };
}

/** 스토리지 경로/URL 을 공개 URL(string) 로 변환한다. 값이 없으면 null. (커버 이미지용) */
function getPublicCoverUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  if (path.startsWith('http')) {
    return path.startsWith('http://') ? path.replace('http://', 'https://') : path;
  }

  const storagePath = path.startsWith('profiles/') ? path.replace('profiles/', '') : path;

  return supabase.storage.from('profiles').getPublicUrl(storagePath).data.publicUrl;
}

function toAppUser(row: UserRow, stats?: UserStats): AppUser {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    profile_image: getProfileImageSource(row.profile_image_url),
    cover_image_url: getPublicCoverUrl(row.cover_image_url),
    description: row.description ?? '',
    installed_at: row.installed_at,
    intimacy_level: row.intimacy_level,
    whale_id: row.whale_id ?? DEFAULT_WHALE_ID,
    friends_count: 0,
    like_count: stats?.likeCount ?? 0,
    post_count: stats?.postCount ?? 0,
  };
}

export function mapUserRowToAppUser(row: UserRow): AppUser {
  return toAppUser(row);
}

async function fetchUserStats(userId: string): Promise<UserStats | null> {
  const [{ count: postCount, error: postCountError }, { data: posts, error: postsError }] = await Promise.all([
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('posts')
      .select('id')
      .eq('user_id', userId),
  ]);

  if (postCountError || postsError) {
    console.warn('[users] Failed to load user post stats', {
      postCountError,
      postsError,
    });
    return null;
  }

  const postIds = posts?.map((post) => post.id) ?? [];

  if (postIds.length === 0) {
    return {
      postCount: postCount ?? 0,
      likeCount: 0,
    };
  }

  const { count: likeCount, error: likeCountError } = await supabase
    .from('post_likes')
    .select('post_id', { count: 'exact', head: true })
    .in('post_id', postIds);

  if (likeCountError) {
    console.warn('[users] Failed to load user like stats', likeCountError);
    return {
      postCount: postCount ?? 0,
      likeCount: 0,
    };
  }

  return {
    postCount: postCount ?? 0,
    likeCount: likeCount ?? 0,
  };
}

export async function fetchUserById(userId: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, tag, profile_image_url, cover_image_url, description, installed_at, intimacy_level, whale_id')
    .eq('id', userId)
    .maybeSingle<UserRow>();

  if (error || !data) {
    console.warn('[users] Failed to load user by id', {
      code: error?.code,
      message: error?.message,
    });
    return null;
  }

  const stats = await fetchUserStats(data.id);

  return toAppUser(data, stats ?? undefined);
}

export async function fetchCurrentUser(): Promise<AppUser | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    console.warn('[users] No authenticated user', error);
    return null;
  }

  return fetchUserById(user.id);
}

const PROFILE_IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * 로컬 파일(file://) 이미지를 Supabase 'profiles' 버킷에 업로드하고 공개 URL 을 반환한다.
 * React Native 에서는 Blob/File/FormData 업로드가 정상 동작하지 않으므로 바이트(Uint8Array)로 업로드한다.
 * (localUri 는 반드시 읽기 가능한 file:// 여야 한다 — iOS 라이브러리의 ph:// 는 미리 변환 필요)
 */
export async function uploadProfileImage(userId: string, localUri: string): Promise<string> {
  const bytes = await new File(localUri).bytes();

  const rawExt = localUri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const ext = PROFILE_IMAGE_CONTENT_TYPES[rawExt] ? rawExt : 'jpg';
  const contentType = PROFILE_IMAGE_CONTENT_TYPES[ext];
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('profiles').upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(error.message ?? '프로필 이미지 업로드에 실패했습니다.');
  }

  return supabase.storage.from('profiles').getPublicUrl(path).data.publicUrl;
}

/**
 * 로컬 파일(file://) 커버 이미지를 'profiles' 버킷의 `{userId}/cover/` 경로에 업로드하고 공개 URL 을 반환한다.
 * (프로필 이미지와 동일한 버킷/RLS 정책 — 첫 폴더가 본인 userId 이므로 그대로 적용된다.)
 */
export async function uploadCoverImage(userId: string, localUri: string): Promise<string> {
  const bytes = await new File(localUri).bytes();

  const rawExt = localUri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const ext = PROFILE_IMAGE_CONTENT_TYPES[rawExt] ? rawExt : 'jpg';
  const contentType = PROFILE_IMAGE_CONTENT_TYPES[ext];
  const path = `${userId}/cover/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('profiles').upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(error.message ?? '커버 이미지 업로드에 실패했습니다.');
  }

  return supabase.storage.from('profiles').getPublicUrl(path).data.publicUrl;
}

/** 프로필 이미지를 업로드 후 profiles.profile_image_url 에 저장하고, 저장된 공개 URL 을 반환한다. */
export async function saveProfileImage(userId: string, localUri: string): Promise<string> {
  const url = await uploadProfileImage(userId, localUri);

  const { error } = await supabase
    .from('profiles')
    .update({
      profile_image_url: url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message ?? '프로필 이미지 저장에 실패했습니다.');
  }

  return url;
}

/**
 * 고른 고래를 profiles.whale_id 에 저장한다.
 *
 * 예전에는 intimacy_level 에 넣었다. 친밀도는 함께한 날수로 오르는 값이라 고래를 바꿀
 * 때마다 단계가 같이 흔들렸다.
 */
export async function updateSelectedWhaleId(userId: string, whaleId: number): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      whale_id: whaleId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message ?? '캐릭터 저장에 실패했습니다.');
  }
}

/** 커버 이미지를 갤러리에서 골라 업로드 후 내 프로필(profiles.cover_image_url)에 저장하고, 저장된 공개 URL 을 반환한다. */
export async function saveCoverImage(userId: string, localUri: string): Promise<string> {
  const coverImageUrl = await uploadCoverImage(userId, localUri);

  const { error } = await supabase
    .from('profiles')
    .update({
      cover_image_url: coverImageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message ?? '커버 이미지 저장에 실패했습니다.');
  }

  return coverImageUrl;
}

export async function fetchUserByTag(tag: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, tag, profile_image_url, cover_image_url, description, installed_at, intimacy_level, whale_id')
    .eq('tag', tag)
    .maybeSingle<UserRow>();

  if (error || !data) {
    console.warn('[users] Failed to load user by tag', {
      code: error?.code,
      message: error?.message,
    });
    return null;
  }

  const stats = await fetchUserStats(data.id);

  return toAppUser(data, stats ?? undefined);
}

function normalizeTag(value: string) {
  return value.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function mapProfileUpdateError(error: { code?: string; message?: string }) {
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

  return new Error(error.message ?? '프로필 저장 중 문제가 발생했습니다.');
}

async function isProfileFieldTaken(
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
    throw mapProfileUpdateError(error);
  }

  return Boolean(data);
}

export async function updateUserProfile(
  userId: string,
  values: {
    name: string;
    tag: string;
    description: string;
  },
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
      name,
      tag,
      description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw mapProfileUpdateError(error);
  }
}
