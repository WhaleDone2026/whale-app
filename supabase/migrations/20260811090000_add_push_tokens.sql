-- 푸시 알림용 기기 토큰
--
-- 전송은 Expo Push Service를 거친다. 앱이 받는 값은 FCM/APNs 원본 토큰이 아니라
-- ExpoPushToken[...] 형태의 문자열 하나이고, Expo가 Android는 FCM으로 iOS는 APNs로
-- 갈라서 보낸다. 그래서 플랫폼별 컬럼을 나눌 필요가 없다(platform은 통계·디버깅용).

create table if not exists public.user_push_tokens (
    -- 토큰을 기본키로 둔다. 같은 기기가 두 행으로 갈라지면 푸시가 두 번 가고,
    -- 계정이 바뀌었을 때 이전 소유자 행이 남아 남의 알림이 이 기기로 온다.
    token       text primary key,
    user_id     uuid not null references auth.users (id) on delete cascade,
    platform    text not null check (platform in ('ios', 'android')),
    -- "김태란의 iPhone" 같은 값. 설정 화면에서 기기 목록을 보여줄 때 쓰려고 남긴다.
    device_name text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- 발송 시 수신자의 토큰을 전부 긁어오는 게 유일한 조회 패턴이다.
create index if not exists user_push_tokens_user_idx
    on public.user_push_tokens (user_id);

alter table public.user_push_tokens enable row level security;

-- 읽기·삭제는 본인 것만. 쓰기는 아래 register_push_token 으로만 한다.
drop policy if exists user_push_tokens_select_own on public.user_push_tokens;
create policy user_push_tokens_select_own
    on public.user_push_tokens for select to authenticated
    using (user_id = auth.uid());

drop policy if exists user_push_tokens_delete_own on public.user_push_tokens;
create policy user_push_tokens_delete_own
    on public.user_push_tokens for delete to authenticated
    using (user_id = auth.uid());

-- 토큰 등록을 함수로 감싸는 이유
--
-- 한 기기에서 A가 로그아웃하고 B가 로그인하면 Expo 토큰은 그대로다. 이때 B가 그냥
-- upsert 하려면 "남의 행을 업데이트"해야 해서 update 정책을 열어야 하는데, 그러면
-- 남의 토큰 문자열을 아는 사람이 그 토큰을 자기 것으로 가로채 남의 알림을 받을 수
-- 있다. security definer 함수로 좁히면 정책을 열지 않고도 기기 인계를 처리할 수 있다.
create or replace function public.register_push_token(
    p_token       text,
    p_platform    text,
    p_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception '로그인이 필요합니다.';
    end if;

    if p_platform not in ('ios', 'android') then
        raise exception 'platform은 ios 또는 android여야 합니다: %', p_platform;
    end if;

    insert into public.user_push_tokens (token, user_id, platform, device_name)
    values (p_token, auth.uid(), p_platform, p_device_name)
    on conflict (token) do update
        set user_id     = excluded.user_id,
            platform    = excluded.platform,
            device_name = excluded.device_name,
            updated_at  = now();
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public;
grant execute on function public.register_push_token(text, text, text) to authenticated;
