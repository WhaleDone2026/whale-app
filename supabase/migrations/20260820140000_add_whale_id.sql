-- 고래 종류 (whale_id)
--
-- 지금까지 마이페이지에서 고른 고래를 intimacy_level 에 저장하고 있었다. 친밀도(함께한
-- 날수로 오르는 값)와 고래 종류가 한 컬럼에 섞여 있어서, 둘 중 하나를 손대면 다른 하나가
-- 같이 망가진다. 종류를 따로 뗀다.
--
--   whale_id       고른 고래. 마이페이지에서 바꾸고, 친구 화면에서 이 값으로 그린다.
--   intimacy_level 친밀도 단계. 계속 남겨 둔다(마이페이지 'N단계' 표시).
--
-- 종류 목록은 앱의 constants/whales.ts 에 있다. id 를 늘릴 때 아래 check 도 같이 늘려야 한다.

alter table public.profiles
    add column if not exists whale_id smallint not null default 1;

alter table public.profiles drop constraint if exists profiles_whale_id_valid;
alter table public.profiles add constraint profiles_whale_id_valid
    check (whale_id between 1 and 3);

comment on column public.profiles.whale_id is
    '사용자가 고른 고래 종류. 친구 화면에서 이 사람을 나타내는 캐릭터로 쓴다.';

-- 이미 고래를 골라 둔 사람이 1번으로 초기화되면 안 된다. 예전 값(intimacy_level)을 옮긴다.
-- default 로 들어간 1 만 덮어써서, 이 마이그레이션을 다시 돌려도 사용자가 그 뒤에 바꾼
-- 선택을 되돌리지 않는다.
update public.profiles
set whale_id = least(greatest(intimacy_level, 1), 3)
where whale_id = 1
  and intimacy_level between 1 and 3;
