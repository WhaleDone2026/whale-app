import { supabase } from '@/src/lib/supabase';

/**
 * 문의하기.
 *
 * 접수하면 행이 남고, 트리거가 운영 메일로 보낸다(send-inquiry-mail).
 * 앱에는 문의 내역 화면이 없다 — 답변은 메일로 받는다.
 */

export type SubmitInquiryParams = {
  content: string;
  /** 답장 받을 주소. 비우면 계정 이메일로 보낸다. */
  replyEmail?: string | null;
};

export async function submitInquiry({
  content,
  replyEmail = null,
}: SubmitInquiryParams): Promise<void> {
  const { error } = await supabase.rpc('submit_inquiry', {
    p_content: content,
    p_reply_email: replyEmail,
  });

  if (error) {
    console.warn('[inquiries] Failed to submit inquiry', error);
    // 글자 수·발송 제한 같은 안내는 RPC 가 그대로 문구로 던진다. 그건 살려서 보여 준다.
    throw new Error(error.message || '문의를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

/** 문의 폼의 이메일 칸 기본값. 소셜 로그인이라 없을 수 있다. */
export async function fetchAccountEmail(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.email ?? null;
}
