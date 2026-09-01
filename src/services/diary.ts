import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ImageSourcePropType } from 'react-native';

import { supabase } from '@/src/lib/supabase';

type PostImageRow = {
  image_url: string;
  sort_order: number;
};

type DiaryPostRow = {
  id: string;
  category: string | null;
  created_at: string;
  post_images: PostImageRow[];
};

export type DiaryEntry = {
  day: number;
  hasPhoto?: boolean;
  image?: ImageSourcePropType;
  /** 이 칸을 눌렀을 때 피드에서 찾아갈 글. 하루에 여러 개면 대표로 고른 하나다. */
  postId: string;
};

export type DiaryCategory = {
  id: string;
  title: string;
  postCount: number;
  image?: ImageSourcePropType;
};

/** 사용자가 직접 만든 카테고리 행. (diary_categories) */
export type DiaryCategoryRow = {
  title: string;
  /** 등록할 때 고른 대표 이미지. null 이면 최신 게시글 사진을 쓴다 */
  imageUrl: string | null;
};

export type DiaryArchive = {
  entries: DiaryEntry[];
  categories: DiaryCategory[];
};

const EMPTY_ARCHIVE: DiaryArchive = {
  entries: [],
  categories: [],
};

function getPostImageSource(path: string | null): ImageSourcePropType | undefined {
  if (!path) {
    return undefined;
  }

  if (path.startsWith('http')) {
    return { uri: path };
  }

  const storagePath = path.startsWith('posts/') ? path.replace('posts/', '') : path;
  const { data } = supabase.storage.from('posts').getPublicUrl(storagePath);

  return { uri: data.publicUrl };
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/** 다이어리에 필요한 글 목록. range 를 주면 그 기간만, 없으면 전체 기간을 가져온다. */
async function fetchDiaryPosts(
  userId: string,
  range?: { start: string; end: string },
): Promise<DiaryPostRow[] | null> {
  let query = supabase
    .from('posts')
    .select(
      `
      id,
      category,
      created_at,
      post_images (
        image_url,
        sort_order
      )
    `,
    )
    .eq('user_id', userId);

  if (range) {
    query = query.gte('created_at', range.start).lt('created_at', range.end);
  }

  const { data, error } = await query.order('created_at', { ascending: true }).returns<DiaryPostRow[]>();

  if (error || !data) {
    console.warn('[diary] Failed to load archive', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return null;
  }

  return data;
}

/**
 * 캘린더는 선택한 달만, 카테고리(폴더)는 전체 기간을 기준으로 만든다.
 * 8월 캘린더를 보고 있어도 카테고리는 여태 쓴 글 전부를 세고 대표 사진도 그중에서 고른다.
 */
export async function fetchDiaryArchiveByUserId(userId: string, year: number, month: number): Promise<DiaryArchive> {
  const [monthPosts, allPosts] = await Promise.all([
    fetchDiaryPosts(userId, getMonthRange(year, month)),
    fetchDiaryPosts(userId),
  ]);

  if (!monthPosts || !allPosts) {
    return EMPTY_ARCHIVE;
  }

  const entriesByDay = new Map<number, DiaryEntry>();

  monthPosts.forEach((post) => {
    const day = new Date(post.created_at).getDate();
    const sortedImages = [...post.post_images].sort((a, b) => a.sort_order - b.sort_order);
    const image = getPostImageSource(sortedImages[0]?.image_url ?? null);
    const existing = entriesByDay.get(day);

    if (!existing || image) {
      entriesByDay.set(day, {
        day,
        hasPhoto: Boolean(image),
        image,
        postId: post.id,
      });
    }
  });

  const entries = [...entriesByDay.values()];
  const categoriesByName = new Map<string, DiaryCategory>();

  // 전체 폴더가 쓸 대표 이미지 — 가장 최근에 올린 사진.
  let latestPostImage: DiaryCategory['image'];

  // allPosts 는 오래된 글부터 온다. 사진이 있는 글을 만날 때마다 덮어쓰면
  // 마지막에 남는 건 '가장 최신 사진'이 된다.
  allPosts.forEach((post) => {
    const title = post.category?.trim();
    const sortedImages = [...post.post_images].sort((a, b) => a.sort_order - b.sort_order);
    const image = getPostImageSource(sortedImages[0]?.image_url ?? null);

    latestPostImage = image ?? latestPostImage;

    // 카테고리가 없는 글은 '미분류'로 따로 묶지 않고 '전체'에만 포함한다.
    if (!title) {
      return;
    }

    const current = categoriesByName.get(title);

    categoriesByName.set(title, {
      id: current?.id ?? title.toLowerCase().replace(/\s+/g, '-'),
      title,
      postCount: (current?.postCount ?? 0) + 1,
      image: image ?? current?.image,
    });
  });

  // 사용자가 직접 만든 카테고리를 얹는다.
  //   - 등록할 때 고른 썸네일이 있으면 그걸로 고정한다(최신 글 사진보다 우선).
  //   - 아직 글이 없는 카테고리도 빈 폴더로 보여 준다.
  const savedCategories = await fetchDiaryCategoryRows(userId);
  savedCategories.forEach((row) => {
    const title = row.title.trim();
    if (!title) {
      return;
    }

    const current = categoriesByName.get(title);
    const pinnedImage = row.imageUrl ? { uri: row.imageUrl } : undefined;

    categoriesByName.set(title, {
      id: current?.id ?? title.toLowerCase().replace(/\s+/g, '-'),
      title,
      postCount: current?.postCount ?? 0,
      image: pinnedImage ?? current?.image,
    });
  });

  return {
    entries,
    categories: [
      {
        id: 'all',
        title: '전체',
        postCount: allPosts.length,
        image: latestPostImage,
      },
      ...categoriesByName.values(),
    ],
  };
}

/**
 * 사용자가 직접 만든 다이어리 카테고리. (diary_categories 테이블)
 * 테이블이 없거나 RLS 로 막히면 빈 배열을 반환해 다이어리 로딩을 깨지 않는다.
 */
export async function fetchDiaryCategoryRows(userId: string): Promise<DiaryCategoryRow[]> {
  const { data, error } = await supabase
    .from('diary_categories')
    .select('title, image_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .returns<{ title: string; image_url: string | null }[]>();

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({ title: row.title, imageUrl: row.image_url ?? null }));
}

/** 카테고리 제목만 필요한 화면(글쓰기 시트 등)을 위한 얇은 래퍼. */
export async function fetchDiaryCategories(userId: string): Promise<string[]> {
  const rows = await fetchDiaryCategoryRows(userId);

  return rows.map((row) => row.title);
}

/**
 * 카테고리 썸네일 업로드 기준(긴 변).
 * 폴더 안에서 55×52pt 로만 보이므로 800px 이면 고해상도 기기에서도 넘친다.
 */
const CATEGORY_IMAGE_MAX_DIMENSION = 800;
const CATEGORY_IMAGE_QUALITY = 0.8;

/**
 * 카테고리 썸네일을 'profiles' 버킷의 {userId}/diary-categories/ 로 올리고 공개 URL 을 반환한다.
 *
 * 새 버킷을 만들지 않은 이유: 첫 폴더가 본인 userId 라서 프로필·커버 이미지에 걸린
 * 스토리지 정책이 그대로 적용된다.
 * React Native 에서는 Blob/FormData 업로드가 정상 동작하지 않아 바이트로 올린다.
 */
export async function uploadDiaryCategoryImage(userId: string, localUri: string): Promise<string> {
  let uploadUri = localUri;

  // 사진첩 원본은 수 MB 를 넘기도 한다. 썸네일에는 과분하므로 줄여서 올린다.
  // 변환에 실패하면 원본을 그대로 올린다 — 조금 큰 게 등록 실패보다 낫다.
  try {
    const context = ImageManipulator.manipulate(localUri);
    const rendered = await context.renderAsync();
    const longestSide = Math.max(rendered.width, rendered.height);

    if (longestSide > CATEGORY_IMAGE_MAX_DIMENSION) {
      const scale = CATEGORY_IMAGE_MAX_DIMENSION / longestSide;
      context.resize({
        width: Math.round(rendered.width * scale),
        height: Math.round(rendered.height * scale),
      });
    }

    const result = await (await context.renderAsync()).saveAsync({
      format: SaveFormat.JPEG,
      compress: CATEGORY_IMAGE_QUALITY,
    });

    uploadUri = result.uri;
  } catch (error) {
    console.warn('[diary] Failed to compress category image, uploading original', error);
  }

  const bytes = await new File(uploadUri).bytes();
  const path = `${userId}/diary-categories/${Date.now()}.jpg`;

  const { error } = await supabase.storage.from('profiles').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (error) {
    throw new Error(error.message ?? '카테고리 이미지 업로드에 실패했습니다.');
  }

  return supabase.storage.from('profiles').getPublicUrl(path).data.publicUrl;
}

/** 새 다이어리 카테고리를 생성한다. 썸네일(localImageUri)은 선택이다. */
export async function createDiaryCategory(
  userId: string,
  title: string,
  localImageUri?: string | null,
): Promise<void> {
  const trimmed = title.trim();

  if (!trimmed) {
    throw new Error('카테고리명을 입력해 주세요.');
  }

  const imageUrl = localImageUri ? await uploadDiaryCategoryImage(userId, localImageUri) : null;

  const { error } = await supabase.from('diary_categories').insert({
    user_id: userId,
    title: trimmed,
    image_url: imageUrl,
  });

  if (error) {
    if (error.code === '23505') {
      throw new Error('이미 있는 카테고리예요.');
    }
    throw new Error(error.message ?? '카테고리 추가에 실패했습니다.');
  }
}

/**
 * 카테고리 이름·썸네일 수정.
 *
 * 이름은 diary_categories 행과 posts.category 두 곳에 있어서 한 트랜잭션으로 묶어야
 * 한다(update_diary_category RPC). localImageUri 를 주면 새로 올린 사진으로 바꾸고,
 * 주지 않으면 기존 썸네일을 그대로 둔다.
 */
export async function updateDiaryCategory(
  userId: string,
  title: string,
  newTitle: string,
  localImageUri?: string | null,
): Promise<void> {
  const trimmed = newTitle.trim();

  if (!trimmed) {
    throw new Error('카테고리명을 입력해 주세요.');
  }

  const imageUrl = localImageUri ? await uploadDiaryCategoryImage(userId, localImageUri) : null;

  const { error } = await supabase.rpc('update_diary_category', {
    p_title: title,
    p_new_title: trimmed,
    p_image_url: imageUrl,
  });

  if (error) {
    console.warn('[diary] Failed to update category', error);
    throw new Error(error.message || '카테고리를 수정하지 못했어요.');
  }
}

/** 카테고리 삭제. 안에 있던 글은 지우지 않고 '전체'로 남는다. */
export async function deleteDiaryCategory(title: string): Promise<void> {
  const { error } = await supabase.rpc('delete_diary_category', { p_title: title });

  if (error) {
    console.warn('[diary] Failed to delete category', error);
    throw new Error(error.message || '카테고리를 삭제하지 못했어요.');
  }
}

export async function fetchDiaryArchiveByUserTag(tag: string, year: number, month: number): Promise<DiaryArchive> {
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id')
    .eq('tag', tag)
    .maybeSingle<{ id: string }>();

  if (userError || !user?.id) {
    console.warn('[diary] Profile lookup failed', userError);
    return EMPTY_ARCHIVE;
  }

  return fetchDiaryArchiveByUserId(user.id, year, month);
}
