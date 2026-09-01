import { supabase } from '@/src/lib/supabase';

/**
 * 공지사항. 등록·수정은 앱에서 하지 않고 Supabase 대시보드에서 한다.
 * (RLS 도 authenticated 읽기만 열려 있다)
 */

export type Notice = {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  publishedAt: string;
  /** 목록의 'N' 배지 — 최근에 올라온 공지인지 */
  isNew: boolean;
};

type NoticeRow = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  published_at: string;
};

/** 며칠 안에 올라온 공지까지 'N' 배지를 붙일지 */
const NEW_NOTICE_DAYS = 7;

function toNotice(row: NoticeRow): Notice {
  const publishedAt = new Date(row.published_at);
  const elapsedDays = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    isPinned: row.is_pinned,
    publishedAt: row.published_at,
    isNew: elapsedDays <= NEW_NOTICE_DAYS,
  };
}

/** 고정 공지가 먼저, 그다음 최신순. */
export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase
    .from('notices')
    .select('id, title, content, is_pinned, published_at')
    .lte('published_at', new Date().toISOString())
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .returns<NoticeRow[]>();

  if (error || !data) {
    console.warn('[notices] Failed to load notices', error);
    return [];
  }

  return data.map(toNotice);
}

export async function fetchNoticeById(id: string): Promise<Notice | null> {
  const { data, error } = await supabase
    .from('notices')
    .select('id, title, content, is_pinned, published_at')
    .eq('id', id)
    .maybeSingle<NoticeRow>();

  if (error || !data) {
    console.warn('[notices] Failed to load notice', error);
    return null;
  }

  return toNotice(data);
}

/** 목록·상세에 쓰는 날짜 표기 (2026.08.04) */
export function formatNoticeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}.${month}.${day}`;
}
