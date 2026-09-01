-- 사용자 차단(blocks) 및 신고(reports) 추가
--
-- 차단 정의
--   - 차단하면 친구 관계가 끊긴다. (friend_requests 행 삭제)
--   - 서로 보이지 않는다. 차단은 단방향으로 저장하지만 판정은 양방향이다 —
--     내가 차단당한 쪽이어도 상대가 보이지 않아야 한다.
--   - 차단 상태에서는 친구 요청을 다시 보낼 수 없다.
--
-- 왜 restrictive 정책인가
--   posts/profiles/comments 에는 이미 정책이 있고, 일반(permissive) 정책을 추가하면
--   기존 정책과 OR 로 합쳐져 오히려 더 많이 보이게 된다. restrictive 는 AND 로 걸리므로
--   기존 정책 이름을 몰라도 "차단한 사람은 제외" 조건만 덧붙일 수 있다.
--
-- 신고
--   사유(reason) 선택 UI 는 디자인 확정 전이라 nullable 로 둔다. 확정되면 코드값을 넣고
--   필요하면 not null 로 조인다.

-- 1) blocks -------------------------------------------------------------------

create table if not exists public.blocks (
    blocker_id uuid not null references public.profiles (id) on delete cascade,
    blocked_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    constraint blocks_no_self check (blocker_id <> blocked_id)
);

-- 역방향 조회용 — is_blocked 가 양방향을 확인하므로 반대 순서 인덱스도 필요하다.
create index if not exists blocks_blocked_idx on public.blocks (blocked_id, blocker_id);

alter table public.blocks enable row level security;

-- 내 차단 목록만 보고 관리할 수 있다. (설정 페이지의 '차단한 계정')
drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own
  on public.blocks for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own
  on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own
  on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- 2) 차단 판정 헬퍼 -----------------------------------------------------------
--
-- security definer 인 이유: 상대가 나를 차단한 행은 blocks_select_own 때문에 내가 직접
-- 읽을 수 없다. 그래도 "안 보여야" 하므로, 존재 여부만 알려주는 함수로 우회한다.

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.blocks
        where (blocker_id = a and blocked_id = b)
           or (blocker_id = b and blocked_id = a)
    );
$$;

grant execute on function public.is_blocked(uuid, uuid) to authenticated;

-- 나를 차단한 사람인지(단방향). 프로필 노출에만 쓴다 — 아래 3) 참고.
create or replace function public.has_blocked_me(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.blocks
        where blocker_id = p_other and blocked_id = auth.uid()
    );
$$;

grant execute on function public.has_blocked_me(uuid) to authenticated;

-- 3) 차단하면 서로 안 보이게 (restrictive = 기존 정책과 AND) --------------------
--
-- 프로필만 단방향으로 가린다. 양방향으로 막으면 내가 차단한 사람의 프로필도 안 보여서
-- 설정 페이지의 '차단한 계정' 목록과 차단 해제가 불가능해진다.
-- 내가 차단한 사람은 앱에서 검색·친구목록에서 걸러내고(차단 목록은 내가 읽을 수 있다),
-- DB 는 "차단당한 쪽은 볼 수 없다"는 쪽만 강제한다.
drop policy if exists profiles_hide_blocked on public.profiles;
create policy profiles_hide_blocked
  on public.profiles as restrictive for select to authenticated
  using (id = auth.uid() or not public.has_blocked_me(id));

drop policy if exists posts_hide_blocked on public.posts;
create policy posts_hide_blocked
  on public.posts as restrictive for select to authenticated
  using (user_id = auth.uid() or not public.is_blocked(auth.uid(), user_id));

-- 서로의 친구 글에 달린 댓글도 가려야 한다.
drop policy if exists comments_hide_blocked on public.comments;
create policy comments_hide_blocked
  on public.comments as restrictive for select to authenticated
  using (user_id = auth.uid() or not public.is_blocked(auth.uid(), user_id));

-- 4) 차단 = 친구 관계 해제 ----------------------------------------------------
--
-- 차단 행 추가와 친구 관계 삭제가 한 트랜잭션에서 일어나야 해서 RPC 로 묶는다.

create or replace function public.block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_target is null or p_target = auth.uid() then
        raise exception '자기 자신은 차단할 수 없습니다.';
    end if;

    insert into public.blocks (blocker_id, blocked_id)
    values (auth.uid(), p_target)
    on conflict do nothing;

    -- 친구 관계와 주고받은 요청을 모두 지운다.
    delete from public.friend_requests
    where (requester_id = auth.uid() and addressee_id = p_target)
       or (requester_id = p_target and addressee_id = auth.uid());
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;

-- 5) 차단 상태에서는 친구 요청 금지 -------------------------------------------
--
-- 기존 friend_requests 정책 이름을 모르므로 정책을 고치는 대신 트리거로 막는다.

create or replace function public.prevent_blocked_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.is_blocked(new.requester_id, new.addressee_id) then
        raise exception '차단된 사용자와는 친구 요청을 주고받을 수 없습니다.';
    end if;
    return new;
end;
$$;

drop trigger if exists friend_requests_block_guard on public.friend_requests;
create trigger friend_requests_block_guard
    before insert on public.friend_requests
    for each row execute function public.prevent_blocked_friend_request();

-- 6) reports ------------------------------------------------------------------

create table if not exists public.reports (
    id          uuid primary key default gen_random_uuid(),
    reporter_id uuid not null references public.profiles (id) on delete cascade,
    target_type text not null check (target_type in ('post', 'comment', 'user')),
    target_id   uuid not null,
    -- 사유 선택 UI 디자인 확정 전이라 비워둘 수 있다.
    reason      text,
    detail      text,
    status      text not null default 'pending'
                check (status in ('pending', 'reviewing', 'resolved', 'rejected')),
    created_at  timestamptz not null default now()
);

-- 설정 페이지의 '신고 내역' — 최신순 조회용
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);

-- 같은 대상을 중복 신고하지 않도록. (한 번 더 신고하면 조용히 무시)
create unique index if not exists reports_unique_target
    on public.reports (reporter_id, target_type, target_id);

alter table public.reports enable row level security;

-- 신고자는 자기 신고만 보고 만들 수 있다. 처리 상태 변경은 운영(service_role)이 한다.
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own
  on public.reports for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
