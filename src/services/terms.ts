import { supabase } from '@/src/lib/supabase';

/**
 * 약관 마스터(terms). 본문을 DB 에 두면 앱을 다시 배포하지 않고 문구를 고칠 수 있다.
 * 등록·수정은 Supabase 대시보드에서 한다. (RLS 는 읽기만 열려 있다)
 */

export type TermType = 'service' | 'privacy' | 'marketing' | 'ai_training' | 'open_source';

export type Term = {
  type: TermType;
  version: string;
  title: string;
  content: string;
  effectiveAt: string;
};

type TermRow = {
  type: string;
  version: string;
  title: string;
  content: string;
  effective_at: string;
};

/** 지금 보여 줄 버전(is_current)을 가져온다. 등록 전이면 null. */
export async function fetchCurrentTerm(type: TermType): Promise<Term | null> {
  const { data, error } = await supabase
    .from('terms')
    .select('type, version, title, content, effective_at')
    .eq('type', type)
    .eq('is_current', true)
    .maybeSingle<TermRow>();

  if (error || !data) {
    if (error) {
      console.warn('[terms] Failed to load term', error);
    }
    return null;
  }

  return {
    type: data.type as TermType,
    version: data.version,
    title: data.title,
    content: data.content,
    effectiveAt: data.effective_at,
  };
}
