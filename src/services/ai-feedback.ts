import { supabase } from '@/src/lib/supabase';

/**
 * 고래 한마디 평가(따봉/붐따).
 *
 * 한마디 생성·장기기억은 whale-AI 서버(src/services/ai.ts)가 맡지만, 평가는
 * Supabase 에 남긴다. draft_id 를 같이 저장하므로 나중에 서버 기록과 맞춰볼 수 있다.
 * 붐따와 코멘트가 달린 따봉은 트리거가 운영 메일로 보낸다.
 */

export type AIFeedbackType = 'positive' | 'negative';

export type SubmitAIFeedbackParams = {
  type: AIFeedbackType;
  /** 시트에서 고른 사유들(한글 라벨) */
  reasons: string[];
  comment: string;
  /** 평가 대상이 된 한마디 */
  whaleMessage: string;
  draftId?: string | null;
  retryCount?: number | null;
};

export async function submitAIFeedback({
  type,
  reasons,
  comment,
  whaleMessage,
  draftId = null,
  retryCount = null,
}: SubmitAIFeedbackParams): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('로그인이 필요합니다.');
  }

  const trimmedComment = comment.trim();

  const { error } = await supabase.from('ai_feedback').insert({
    user_id: user.id,
    draft_id: draftId,
    feedback_type: type,
    reasons,
    // 빈 문자열을 넣으면 '코멘트 있음'으로 잘못 판정돼 메일이 나간다.
    comment: trimmedComment || null,
    // 오류 문구를 보고 누른 경우 한마디가 비어 있을 수 있다.
    whale_message: whaleMessage.trim() || null,
    retry_count: retryCount,
  });

  if (error) {
    console.warn('[ai-feedback] Failed to submit feedback', error);
    throw new Error('평가를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
