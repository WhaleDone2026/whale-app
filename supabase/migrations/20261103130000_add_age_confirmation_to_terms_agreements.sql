-- 가입 화면의 [필수] 만 14세 이상 확인을 저장한다(약관 1.3 제4조, 개인정보 처리방침 2조).
-- 스토어에 나가 있는 구버전 앱은 이 값을 보내지 않으므로 기본값을 둬서 가입이 깨지지 않게 한다.
-- 확인 절차가 없던 시기에 가입한 기존 회원은 false 로 남는다.
alter table public.user_terms_agreements
    add column if not exists age_over_14_confirmed boolean not null default false;
