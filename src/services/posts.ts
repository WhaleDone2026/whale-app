import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/src/lib/supabase';
import type { FeedComment, FeedPost, PostVisibility } from '@/src/types/api/feed-post';

type ProfileRow = {
  id: string;
  name: string;
  profile_image_url: string | null;
};

type PostImageRow = {
  image_url: string;
  sort_order: number;
};

type LikeCountRow = {
  count: number;
};

type CommentRow = {
  id: string;
  user_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  profiles: ProfileRow | null;
};

type CommentLikeStats = {
  count: number;
  isLiked: boolean;
};

type PostRow = {
  id: string;
  user_id: string;
  contents: string;
  visibility: PostVisibility;
  created_at: string;
  profiles: ProfileRow | null;
  post_images: PostImageRow[];
  post_likes: LikeCountRow[];
  comments: CommentRow[];
};

function getPublicStorageUrl(bucket: 'profiles' | 'posts', path: string | null) {
  if (!path) {
    return null;
  }

  if (path.startsWith('http')) {
    return path;
  }

  const storagePath = path.startsWith(`${bucket}/`) ? path.replace(`${bucket}/`, '') : path;

  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}.${month}.${day}`;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (Number.isNaN(date.getTime()) || diffMs < 0) {
    return '';
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return '방금 전';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분전`;
  }

  if (diffHours < 24) {
    return `${diffHours}시간전`;
  }

  if (diffDays === 1) {
    return '어제';
  }

  return `${diffDays}일전`;
}

function mapCommentRow(
  row: CommentRow,
  postAuthorId: string,
  likeStats?: CommentLikeStats,
): FeedComment {
  return {
    id: row.id,
    user_id: row.user_id,
    profile_image_url: getPublicStorageUrl('profiles', row.profiles?.profile_image_url ?? null),
    username: row.profiles?.name ?? '알 수 없음',
    content: row.content,
    is_author: row.user_id === postAuthorId,
    like_count: likeStats?.count ?? 0,
    is_liked: likeStats?.isLiked ?? false,
  };
}

function mapComment(
  row: CommentRow,
  replies: CommentRow[],
  postAuthorId: string,
  likeStatsByCommentId: Map<string, CommentLikeStats>,
): FeedComment {
  return {
    ...mapCommentRow(row, postAuthorId, likeStatsByCommentId.get(row.id)),
    replies: replies.map((reply) => mapCommentRow(reply, postAuthorId, likeStatsByCommentId.get(reply.id))),
  };
}

async function fetchCommentLikeStats(
  commentIds: string[],
  currentUserId: string | null,
): Promise<Map<string, CommentLikeStats>> {
  const stats = new Map<string, CommentLikeStats>();

  commentIds.forEach((commentId) => {
    stats.set(commentId, { count: 0, isLiked: false });
  });

  if (commentIds.length === 0) {
    return stats;
  }

  const { data, error } = await supabase
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', commentIds);

  if (error) {
    console.warn('[posts] Failed to load comment likes', {
      code: error.code,
      message: error.message,
    });
    return stats;
  }

  (data ?? []).forEach((row) => {
    const entry = stats.get(row.comment_id);
    if (!entry) {
      return;
    }

    entry.count += 1;
    if (currentUserId && row.user_id === currentUserId) {
      entry.isLiked = true;
    }
  });

  return stats;
}

async function fetchLikedPostIds(postIds: string[], currentUserId: string | null): Promise<Set<string>> {
  if (!currentUserId || postIds.length === 0) {
    return new Set();
  }

  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', currentUserId)
    .in('post_id', postIds);

  if (error) {
    console.warn('[posts] Failed to load post likes', {
      code: error.code,
      message: error.message,
    });
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.post_id));
}

function mapPost(row: PostRow, likedPostIds: Set<string>, likeStatsByCommentId: Map<string, CommentLikeStats>): FeedPost {
  const rootComments = row.comments.filter((comment) => comment.parent_comment_id === null);
  const repliesByParentId = new Map<string, CommentRow[]>();

  row.comments
    .filter((comment) => comment.parent_comment_id !== null)
    .forEach((reply) => {
      const parentId = reply.parent_comment_id!;
      const replies = repliesByParentId.get(parentId) ?? [];
      replies.push(reply);
      repliesByParentId.set(parentId, replies);
    });

  return {
    id: row.id,
    user_id: row.user_id,
    visibility: row.visibility,
    profile_image_url: getPublicStorageUrl('profiles', row.profiles?.profile_image_url ?? null),
    username: row.profiles?.name ?? '알 수 없음',
    created_at: formatDate(row.created_at),
    relative_time: formatRelativeTime(row.created_at),
    image_url: [...row.post_images]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) => getPublicStorageUrl('posts', image.image_url))
      .filter((url): url is string => Boolean(url)),
    contents: row.contents,
    like_count: row.post_likes[0]?.count ?? 0,
    is_liked: likedPostIds.has(row.id),
    comments: rootComments.map((comment) =>
      mapComment(comment, repliesByParentId.get(comment.id) ?? [], row.user_id, likeStatsByCommentId),
    ),
  };
}

const POST_DETAIL_SELECT = `
  id,
  user_id,
  contents,
  visibility,
  created_at,
  profiles!posts_user_id_fkey (
    id,
    name,
    profile_image_url
  ),
  post_images (
    image_url,
    sort_order
  ),
  post_likes (
    count
  ),
  comments (
    id,
    user_id,
    parent_comment_id,
    content,
    created_at,
    profiles!comments_user_id_fkey (
      id,
      name,
      profile_image_url
    )
  )
`;

async function mapPostsFromRows(data: PostRow[]): Promise<FeedPost[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;
  const likedPostIds = await fetchLikedPostIds(
    data.map((row) => row.id),
    currentUserId,
  );
  const commentIds = data.flatMap((row) => row.comments.map((comment) => comment.id));
  const likeStatsByCommentId = await fetchCommentLikeStats(commentIds, currentUserId);

  return data.map((row) => mapPost(row, likedPostIds, likeStatsByCommentId));
}

export type PostSortOrder = 'latest' | 'oldest';

export async function fetchUserPostCategories(userId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select(
      `
      id,
      category,
      post_images (
        image_url,
        sort_order
      )
    `,
    )
    .eq('user_id', userId)
    .returns<
      Array<{
        id: string;
        category: string | null;
        post_images: PostImageRow[];
      }>
    >();

  if (error || !data) {
    console.warn('[posts] Failed to load user post categories', error);
    return [];
  }

  const categoriesByTitle = new Map<
    string,
    {
      id: string;
      title: string;
      postCount: number;
      image?: string;
    }
  >();

  let uncategorizedImage: string | undefined;

  data.forEach((post) => {
    const title = post.category?.trim();
    const sortedImages = [...post.post_images].sort((a, b) => a.sort_order - b.sort_order);
    const imageUrl = getPublicStorageUrl('posts', sortedImages[0]?.image_url ?? null) ?? undefined;

    // 카테고리를 고르지 않은 글은 별도 '미분류'로 묶지 않고 '전체'에만 넣는다.
    // '전체'는 이미 모든 글을 포함하므로 따로 셀 필요 없이 대표 이미지만 챙긴다.
    if (!title) {
      uncategorizedImage = uncategorizedImage ?? imageUrl;
      return;
    }

    const current = categoriesByTitle.get(title);

    categoriesByTitle.set(title, {
      id: current?.id ?? title.toLowerCase().replace(/\s+/g, '-'),
      title,
      postCount: (current?.postCount ?? 0) + 1,
      image: current?.image ?? imageUrl,
    });
  });

  const firstImage = data
    .flatMap((post) => [...post.post_images].sort((a, b) => a.sort_order - b.sort_order))
    .map((image) => getPublicStorageUrl('posts', image.image_url) ?? undefined)
    .find(Boolean);

  return [
    {
      id: 'all',
      title: '전체',
      postCount: data.length,
      image: firstImage ?? uncategorizedImage,
    },
    ...categoriesByTitle.values(),
  ];
}

export async function fetchUserPostsByCategory(
  userId: string,
  categoryId: string,
  categoryTitle: string,
  sort: PostSortOrder,
): Promise<FeedPost[]> {
  let query = supabase.from('posts').select(POST_DETAIL_SELECT).eq('user_id', userId);

  // '전체'(all)는 카테고리를 고르지 않은 글까지 모두 포함한다.
  if (categoryId !== 'all') {
    query = query.eq('category', categoryTitle);
  }

  const { data, error } = await query
    .order('created_at', { ascending: sort === 'oldest' })
    .returns<PostRow[]>();

  if (error || !data) {
    console.warn('[posts] Failed to load category posts', {
      code: error?.code,
      message: error?.message,
    });
    return [];
  }

  return mapPostsFromRows(data);
}

export async function createComment(
  postId: string,
  content: string,
  postAuthorId: string,
  parentCommentId?: string | null,
): Promise<FeedComment> {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error('댓글 내용을 입력해 주세요.');
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('로그인이 필요합니다.');
  }

  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      user_id: user.id,
      content: trimmedContent,
      parent_comment_id: parentCommentId ?? null,
    })
    .select(
      `
      id,
      user_id,
      parent_comment_id,
      content,
      created_at,
      profiles!comments_user_id_fkey (
        id,
        name,
        profile_image_url
      )
    `,
    )
    .single<CommentRow>();

  if (error || !data) {
    console.warn('[posts] Failed to create comment', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    throw new Error('댓글 등록에 실패했습니다.');
  }

  return {
    ...mapCommentRow(data, postAuthorId, { count: 0, isLiked: false }),
    replies: [],
  };
}

export async function toggleCommentLike(commentId: string): Promise<boolean> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('로그인이 필요합니다.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('comment_likes')
    .select('comment_id')
    .eq('comment_id', commentId)
    .eq('user_id', user.id)
    .maybeSingle<{ comment_id: string }>();

  if (existingError) {
    console.warn('[posts] Failed to read comment like', existingError);
    throw new Error('댓글 좋아요 상태를 확인하지 못했습니다.');
  }

  if (existing) {
    const { error } = await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', user.id);

    if (error) {
      console.warn('[posts] Failed to unlike comment', error);
      throw new Error('댓글 좋아요를 취소하지 못했습니다.');
    }

    return false;
  }

  const { error } = await supabase.from('comment_likes').insert({
    comment_id: commentId,
    user_id: user.id,
  });

  if (error) {
    console.warn('[posts] Failed to like comment', error);
    throw new Error('댓글 좋아요에 실패했습니다.');
  }

  return true;
}

export async function togglePostLike(postId: string): Promise<boolean> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('로그인이 필요합니다.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle<{ post_id: string }>();

  if (existingError) {
    console.warn('[posts] Failed to read post like', existingError);
    throw new Error('좋아요 상태를 확인하지 못했습니다.');
  }

  if (existing) {
    const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);

    if (error) {
      console.warn('[posts] Failed to unlike post', error);
      throw new Error('좋아요를 취소하지 못했습니다.');
    }

    return false;
  }

  const { error } = await supabase.from('post_likes').insert({
    post_id: postId,
    user_id: user.id,
  });

  if (error) {
    console.warn('[posts] Failed to like post', error);
    throw new Error('좋아요에 실패했습니다.');
  }

  return true;
}

export async function fetchFeedPostsByUserIds(userIds: string[]): Promise<FeedPost[]> {
  if (userIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('posts')
    .select(POST_DETAIL_SELECT)
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .returns<PostRow[]>();

  if (error || !data) {
    console.warn('[posts] Failed to load posts', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return [];
  }

  return mapPostsFromRows(data);
}

/**
 * 업로드 전 리사이즈 기준(긴 변). 피드는 화면 폭, 상세는 정사각형 한 장이 최대라
 * 1600px 이면 고해상도 기기에서도 충분하다.
 */
const MAX_UPLOAD_DIMENSION = 1600;
const UPLOAD_JPEG_QUALITY = 0.8;

/**
 * 업로드용으로 이미지를 줄이고 JPEG 로 바꾼다.
 *
 * 사진첩 원본은 5MB 를 넘는 경우가 흔한데, 그대로 올리면 업로드가 느리고 스토리지·
 * 트래픽을 크게 먹는다. 긴 변이 기준보다 작으면 리사이즈 없이 JPEG 변환만 한다.
 *
 * 변환에 실패하면 원본 경로를 그대로 돌려준다 — 사진이 조금 큰 것보다 글이 안 올라가는 게 나쁘다.
 */
async function compressForUpload(localUri: string): Promise<{ uri: string; contentType: string; ext: string }> {
  try {
    const context = ImageManipulator.manipulate(localUri);
    const rendered = await context.renderAsync();

    const longestSide = Math.max(rendered.width, rendered.height);
    if (longestSide > MAX_UPLOAD_DIMENSION) {
      const scale = MAX_UPLOAD_DIMENSION / longestSide;
      context.resize({
        width: Math.round(rendered.width * scale),
        height: Math.round(rendered.height * scale),
      });
    }

    const result = await (await context.renderAsync()).saveAsync({
      format: SaveFormat.JPEG,
      compress: UPLOAD_JPEG_QUALITY,
    });

    return { uri: result.uri, contentType: 'image/jpeg', ext: 'jpg' };
  } catch (error) {
    console.warn('[posts] Failed to compress image, uploading original', error);

    const rawExt = localUri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    const ext = POST_IMAGE_CONTENT_TYPES[rawExt] ? rawExt : 'jpg';

    return { uri: localUri, contentType: POST_IMAGE_CONTENT_TYPES[ext], ext };
  }
}

const POST_IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * 로컬 파일(file://) 이미지를 'posts' 버킷에 올리고 저장 경로를 반환한다.
 * 공개 URL 이 아니라 경로를 반환하는 이유: post_images.image_url 에는 경로가 들어가고,
 * 읽을 때 getPublicStorageUrl 이 URL 로 바꾼다.
 *
 * React Native 에서는 Blob/File/FormData 업로드가 정상 동작하지 않아 바이트로 올린다.
 * (CustomImagePicker 가 ph:// 를 file:// 로 변환해 넘겨준다)
 */
async function uploadPostImage(userId: string, localUri: string, index: number): Promise<string> {
  // iOS 라이브러리 에셋(ph://)은 파일로 읽을 수 없다. 여기까지 넘어왔다면 피커에서
  // resolveLocalUri 로 변환하지 않은 것이므로, 네이티브에서 터지기 전에 잡아 준다.
  // (그 외 스킴은 막지 않는다 — 기기별로 다를 수 있어 네이티브 판단에 맡긴다)
  if (!localUri || localUri.startsWith('ph://') || localUri.startsWith('assets-library://')) {
    throw new Error('사진을 읽지 못했습니다. 다시 선택해 주세요.');
  }

  const { uri, contentType, ext } = await compressForUpload(localUri);
  const bytes = await new File(uri).bytes();
  const path = `${userId}/${Date.now()}-${index}.${ext}`;

  const { error } = await supabase.storage.from('posts').upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(error.message ?? '이미지 업로드에 실패했습니다.');
  }

  return path;
}

export type CreatePostParams = {
  contents: string;
  /** 카테고리 제목. 지정하지 않으면 null(미분류)로 저장한다 */
  category: string | null;
  visibility: PostVisibility;
  /** 로컬 이미지 URI 목록. 배열 순서가 그대로 sort_order 가 된다 */
  imageUris?: string[];
};

/**
 * 게시글을 등록한다. 이미지가 있으면 먼저 업로드한 뒤 posts → post_images 순으로 넣는다.
 *
 * 업로드를 먼저 하는 이유: 이미지 업로드가 실패하면 게시글이 아예 생기지 않아
 * 사용자가 그대로 다시 시도할 수 있다. post_images 삽입이 실패하는 경우에만
 * 이미 만든 posts 행을 되돌린다(이미지 없는 게시글이 남지 않게).
 */
export async function createPost({
  contents,
  category,
  visibility,
  imageUris = [],
}: CreatePostParams): Promise<string> {
  const trimmedContents = contents.trim();
  if (!trimmedContents) {
    throw new Error('내용을 입력해 주세요.');
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('로그인이 필요합니다.');
  }

  const imagePaths = await Promise.all(
    imageUris.map((uri, index) => uploadPostImage(user.id, uri, index)),
  );

  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      contents: trimmedContents,
      category,
      visibility,
    })
    .select('id')
    .single();

  if (error || !post) {
    console.warn('[posts] Failed to create post', error);
    throw new Error('게시글 등록에 실패했습니다.');
  }

  if (imagePaths.length > 0) {
    const { error: imageError } = await supabase.from('post_images').insert(
      imagePaths.map((path, index) => ({
        post_id: post.id,
        image_url: path,
        sort_order: index,
      })),
    );

    if (imageError) {
      await supabase.from('posts').delete().eq('id', post.id);
      console.warn('[posts] Failed to attach images', imageError);
      throw new Error('사진을 등록하지 못했습니다. 다시 시도해 주세요.');
    }
  }

  return post.id;
}

/** 수정 화면에서 쓰는 게시글 원본 */
export type EditablePost = {
  id: string;
  contents: string;
  category: string | null;
  visibility: PostVisibility;
  /** 이미 업로드된 이미지. path 는 스토리지 경로, url 은 표시용 공개 URL */
  images: { path: string; url: string }[];
};

export async function fetchPostForEdit(postId: string): Promise<EditablePost> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, contents, category, visibility, post_images (image_url, sort_order)')
    .eq('id', postId)
    .single<{
      id: string;
      contents: string;
      category: string | null;
      visibility: PostVisibility;
      post_images: PostImageRow[];
    }>();

  if (error || !data) {
    console.warn('[posts] Failed to load post for edit', error);
    throw new Error('게시글을 불러오지 못했습니다.');
  }

  return {
    id: data.id,
    contents: data.contents,
    category: data.category,
    visibility: data.visibility,
    images: [...data.post_images]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) => ({
        path: image.image_url,
        url: getPublicStorageUrl('posts', image.image_url) ?? '',
      }))
      .filter((image) => Boolean(image.url)),
  };
}

/**
 * 수정 화면이 넘기는 이미지 한 장.
 * - path 가 있으면 이미 올라간 이미지 → 그대로 재사용한다.
 * - path 가 없으면 새로 고른 로컬 이미지 → 업로드한다.
 */
export type PostImageInput = { uri: string; path?: string };

export type UpdatePostParams = {
  postId: string;
  contents: string;
  category: string | null;
  visibility: PostVisibility;
  images?: PostImageInput[];
};

/**
 * 게시글을 수정한다. 이미지는 순서·구성이 바뀔 수 있으므로 post_images 를 지우고 다시 넣는다.
 * (기존 이미지는 재업로드하지 않고 경로만 재사용한다)
 */
export async function updatePost({
  postId,
  contents,
  category,
  visibility,
  images = [],
}: UpdatePostParams): Promise<void> {
  const trimmedContents = contents.trim();
  if (!trimmedContents) {
    throw new Error('내용을 입력해 주세요.');
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('로그인이 필요합니다.');
  }

  const paths = await Promise.all(
    images.map((image, index) => image.path ?? uploadPostImage(user.id, image.uri, index)),
  );

  const { error } = await supabase
    .from('posts')
    .update({ contents: trimmedContents, category, visibility, updated_at: new Date().toISOString() })
    .eq('id', postId);

  if (error) {
    console.warn('[posts] Failed to update post', error);
    throw new Error('게시글 수정에 실패했습니다.');
  }

  const { error: clearError } = await supabase.from('post_images').delete().eq('post_id', postId);

  if (clearError) {
    console.warn('[posts] Failed to clear post images', clearError);
    throw new Error('사진을 수정하지 못했습니다.');
  }

  if (paths.length > 0) {
    const { error: imageError } = await supabase.from('post_images').insert(
      paths.map((path, index) => ({ post_id: postId, image_url: path, sort_order: index })),
    );

    if (imageError) {
      console.warn('[posts] Failed to attach images', imageError);
      throw new Error('사진을 수정하지 못했습니다.');
    }
  }
}

/**
 * 게시글을 삭제한다. 스토리지 파일은 게시글이 지워진 뒤 정리하며,
 * 실패해도 삭제 자체는 성공으로 둔다(고아 파일은 사용자에게 보이지 않는다).
 */
export async function deletePost(postId: string): Promise<void> {
  const { data: images } = await supabase
    .from('post_images')
    .select('image_url')
    .eq('post_id', postId);

  const { error } = await supabase.from('posts').delete().eq('id', postId);

  if (error) {
    console.warn('[posts] Failed to delete post', error);
    throw new Error('게시글 삭제에 실패했습니다.');
  }

  const paths = (images ?? []).map((image) => image.image_url).filter(Boolean);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from('posts').remove(paths);
    if (storageError) {
      console.warn('[posts] Failed to remove post images from storage', storageError);
    }
  }
}
