/** 피드 댓글 */
export type FeedComment = {
  id: string;
  user_id: string;
  profile_image_url: string | null;
  username: string;
  content: string;
  is_author?: boolean;
  is_liked?: boolean;
  like_count?: number;
  replies?: FeedComment[];
};

/**
 * 게시글 공개범위
 * - public: 전체 공개 (본인 + 친구)
 * - private: 비공개 (본인만)
 */
export type PostVisibility = 'public' | 'private';

/** 피드 게시글 */
export type FeedPost = {
  id: string;
  user_id: string;
  visibility: PostVisibility;
  profile_image_url: string | null;
  username: string;
  /** 표시용 날짜 (예: 2026.04.26) — username 오른쪽 */
  created_at: string;
  /** 상대 시간 (예: 30분전) — 메뉴 아이콘 바로 왼쪽 */
  relative_time: string;
  image_url: string[];
  contents: string;
  like_count: number;
  is_liked?: boolean;
  comments: FeedComment[];
};
