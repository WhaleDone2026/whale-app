import { supabase } from '@/src/lib/supabase';

/**
 * 신고.
 *
 * 접수는 submit_report RPC 를 쓴다. 같은 대상을 다시 신고하면 행을 새로 만들지 않고
 * 사유만 갱신한다(reports_unique_target). 접수되면 트리거가 운영 메일을 보낸다.
 */

export type ReportTargetType = 'post' | 'comment' | 'user';

export type ReportReasonCode =
  | 'spam'
  | 'sexual'
  | 'violence'
  | 'harassment'
  | 'false_info'
  | 'etc';

/**
 * 신고 사유. 코드값은 DB(reports_reason_valid)와 신고 메일 Edge Function 에도 같은
 * 목록이 있다. 늘리거나 줄일 때 세 곳을 같이 고쳐야 한다.
 */
export const REPORT_REASONS: { code: ReportReasonCode; label: string; description: string }[] = [
  { code: 'spam', label: '스팸 또는 광고', description: '반복되는 홍보, 도배, 사기성 링크' },
  { code: 'sexual', label: '성적인 콘텐츠', description: '노출 사진, 성적인 표현' },
  { code: 'violence', label: '폭력 또는 혐오', description: '폭력적인 내용, 차별·혐오 표현' },
  { code: 'harassment', label: '괴롭힘 또는 따돌림', description: '욕설, 위협, 특정인을 겨냥한 비방' },
  { code: 'false_info', label: '거짓 정보', description: '사칭, 허위 사실' },
  { code: 'etc', label: '기타', description: '위에 없는 문제는 아래에 적어 주세요' },
];

const REASON_LABEL = new Map(REPORT_REASONS.map(({ code, label }) => [code as string, label]));

export function reportReasonLabel(reason: string | null): string {
  return (reason && REASON_LABEL.get(reason)) ?? '기타';
}

export const REPORT_TARGET_LABEL: Record<ReportTargetType, string> = {
  post: '게시글',
  comment: '댓글',
  user: '사용자',
};

export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'rejected';

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  pending: '접수됨',
  reviewing: '확인 중',
  resolved: '처리 완료',
  rejected: '반려',
};

export type MyReport = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  /** 게시글·댓글이면 본문 앞부분. 사용자 신고면 없다. */
  targetLabel: string | null;
  /** 신고 대상 글의 작성자, 사용자 신고면 그 사용자. 탈퇴했으면 없다. */
  targetOwnerName: string | null;
  reason: string | null;
  detail: string | null;
  status: ReportStatus;
  createdAt: string;
};

export type CreateReportParams = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReasonCode;
  detail?: string | null;
};

/** 신고를 접수한다. 이미 신고한 대상이면 사유만 바뀐다. */
export async function createReport({
  targetType,
  targetId,
  reason,
  detail = null,
}: CreateReportParams): Promise<void> {
  const { error } = await supabase.rpc('submit_report', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_detail: detail,
  });

  if (error) {
    console.warn('[reports] Failed to create report', error);
    throw new Error('신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

type MyReportRow = {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  target_label: string | null;
  target_owner_name: string | null;
  reason: string | null;
  detail: string | null;
  status: ReportStatus;
  created_at: string;
};

/**
 * 설정 페이지의 '신고 내역'.
 *
 * 대상 이름은 RPC 가 붙여 준다 — 신고 후 차단하면 RLS 때문에 상대 프로필·글을 직접
 * 읽을 수 없어서, 목록에서 조인하면 전부 '알 수 없음'이 된다.
 */
export async function fetchMyReports(): Promise<MyReport[]> {
  const { data, error } = await supabase.rpc('get_my_reports');

  if (error || !data) {
    console.warn('[reports] Failed to load reports', error);
    return [];
  }

  // rpc 는 DB 타입 생성물이 없어서 unknown 으로 온다. 행 모양은 get_my_reports 가 보장한다.
  return (data as MyReportRow[]).map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    targetOwnerName: row.target_owner_name,
    reason: row.reason,
    detail: row.detail,
    status: row.status,
    createdAt: row.created_at,
  }));
}
