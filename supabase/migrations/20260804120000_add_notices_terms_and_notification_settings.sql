-- 설정 페이지 상세 화면들이 쓰는 테이블
--
--   1) notices                    공지사항 목록/상세
--   2) terms                      약관 마스터 (서비스 이용약관·개인정보처리방침·오픈소스 라이선스 …)
--   3) user_notification_settings 알림 설정 토글
--   4) user_terms_agreements      마케팅 수신 / AI 학습 활용 토글을 위한 update 정책 추가
--
-- 마케팅 정보 수신과 AI 데이터 활용은 별도 테이블을 만들지 않는다. 온보딩에서 이미
-- user_terms_agreements 에 동의 여부를 저장하고 있어서, 설정 화면은 그 값을 켜고 끄기만 한다.

-- 1) 공지사항 ---------------------------------------------------------------
--
-- 목록의 'N' 배지는 컬럼으로 두지 않는다. 앱이 published_at 이 최근인지로 판단한다.

create table if not exists public.notices (
    id           uuid primary key default gen_random_uuid(),
    title        text not null,
    content      text not null,
    -- 상단 고정 공지
    is_pinned    boolean not null default false,
    -- 이 시각이 지나야 앱에 보인다. 미래로 두면 예약 발행이 된다.
    published_at timestamptz not null default now(),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists notices_published_at_idx
    on public.notices (is_pinned desc, published_at desc);

alter table public.notices enable row level security;

-- 읽기는 로그인한 사용자 모두. 등록·수정은 대시보드(service_role)에서만 한다.
drop policy if exists notices_select_published on public.notices;
create policy notices_select_published
    on public.notices for select to authenticated
    using (published_at <= now());

-- 2) 약관 마스터 -------------------------------------------------------------
--
-- 앱에는 약관 본문이 하나도 없어서 '자세히 보기'가 눌러지지 않는 상태였다.
-- 본문을 여기에 넣어 두면 배포 없이 문구를 고칠 수 있다.

create table if not exists public.terms (
    id           uuid primary key default gen_random_uuid(),
    -- 온보딩 약관 동의 화면의 항목 id 와 같은 값을 쓴다(open_source 만 설정 전용).
    type         text not null check (type in ('service', 'privacy', 'marketing', 'ai_training', 'open_source')),
    version      text not null,
    title        text not null,
    -- 마크다운이 아니라 그냥 텍스트. 앱은 줄바꿈만 살려서 그린다.
    content      text not null,
    effective_at timestamptz not null default now(),
    -- 지금 보여 줄 버전. 종류마다 하나만 true 일 수 있다.
    is_current   boolean not null default true,
    created_at   timestamptz not null default now()
);

create unique index if not exists terms_current_per_type
    on public.terms (type) where is_current;

create index if not exists terms_type_effective_idx
    on public.terms (type, effective_at desc);

alter table public.terms enable row level security;

-- 약관은 공개 문서다. 로그인 전(온보딩)에도 읽을 수 있어야 한다.
drop policy if exists terms_select_all on public.terms;
create policy terms_select_all
    on public.terms for select to anon, authenticated
    using (true);

-- 3) 알림 설정 ---------------------------------------------------------------
--
-- 행이 없으면 '전부 켜짐'으로 본다. 앱이 처음 토글을 건드릴 때 upsert 로 만든다.

create table if not exists public.user_notification_settings (
    user_id                uuid primary key references auth.users (id) on delete cascade,
    -- 마스터 스위치. 끄면 나머지 값과 무관하게 앱 활동 알림을 보내지 않는다.
    all_enabled            boolean not null default true,
    comment_enabled        boolean not null default true,
    friend_request_enabled boolean not null default true,
    like_enabled           boolean not null default true,
    friend_post_enabled    boolean not null default true,
    updated_at             timestamptz not null default now()
);

alter table public.user_notification_settings enable row level security;

drop policy if exists user_notification_settings_select_own on public.user_notification_settings;
create policy user_notification_settings_select_own
    on public.user_notification_settings for select to authenticated
    using (user_id = auth.uid());

drop policy if exists user_notification_settings_insert_own on public.user_notification_settings;
create policy user_notification_settings_insert_own
    on public.user_notification_settings for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists user_notification_settings_update_own on public.user_notification_settings;
create policy user_notification_settings_update_own
    on public.user_notification_settings for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- 4) 마케팅 수신 / AI 학습 활용 토글 ------------------------------------------
--
-- 온보딩에서 upsert 만 하던 테이블이라 update 정책이 없으면 설정에서 끌 수 없다.

drop policy if exists user_terms_agreements_update_own on public.user_terms_agreements;
create policy user_terms_agreements_update_own
    on public.user_terms_agreements for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
