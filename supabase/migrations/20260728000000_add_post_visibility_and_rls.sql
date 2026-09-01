-- 게시글 공개범위(전체/비공개) 추가 및 posts 계열 테이블 RLS 적용
--
-- 배경
--   - posts 에는 정책이 정의돼 있었지만 RLS 가 켜져 있지 않아 정책이 적용되지 않고 있었다.
--     (비로그인 anon 키로 posts / comments / post_likes 가 그대로 조회됨)
--   - post_images / comments / post_likes 는 정책이 아예 없었다.
--   - 공개범위 컬럼만 추가하고 RLS 를 켜지 않으면 UI 눈속임이 되므로 함께 처리한다.
--
-- 공개범위 정의
--   public  = 전체 공개. 본인 + 친구(are_friends)가 볼 수 있다.
--   private = 비공개. 본인만 볼 수 있다.
--   비친구 / 비로그인 사용자는 어느 경우에도 볼 수 없다. (기존 친구 공개 모델 유지)

-- 1) 공개범위 타입 및 컬럼 ---------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'post_visibility') then
    create type public.post_visibility as enum ('public', 'private');
  end if;
end
$$;

-- 기존 게시글은 default 를 통해 모두 'public' 으로 채워진다.
alter table public.posts
  add column if not exists visibility public.post_visibility not null default 'public';

-- 2) posts RLS ---------------------------------------------------------------

alter table public.posts enable row level security;

-- 기존 정책에 visibility 조건만 추가한다. insert/update/delete 정책은 그대로 둔다.
drop policy if exists posts_select_own_and_friends on public.posts;
create policy posts_select_own_and_friends
  on public.posts
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (visibility = 'public' and are_friends(auth.uid(), user_id))
  );

-- 3) post_images RLS ---------------------------------------------------------
--
-- 자식 테이블은 "부모 posts 행이 나에게 보이는가"로 판단한다.
-- 하위 쿼리에도 posts 의 RLS 가 그대로 적용되므로 공개범위 규칙이 자동으로 전파된다.

alter table public.post_images enable row level security;

drop policy if exists post_images_select_visible on public.post_images;
create policy post_images_select_visible
  on public.post_images
  for select
  to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_images.post_id)
  );

drop policy if exists post_images_insert_own on public.post_images;
create policy post_images_insert_own
  on public.post_images
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_images.post_id and p.user_id = auth.uid()
    )
  );

drop policy if exists post_images_update_own on public.post_images;
create policy post_images_update_own
  on public.post_images
  for update
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_images.post_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_images.post_id and p.user_id = auth.uid()
    )
  );

drop policy if exists post_images_delete_own on public.post_images;
create policy post_images_delete_own
  on public.post_images
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_images.post_id and p.user_id = auth.uid()
    )
  );

-- 4) comments RLS ------------------------------------------------------------

alter table public.comments enable row level security;

drop policy if exists comments_select_visible on public.comments;
create policy comments_select_visible
  on public.comments
  for select
  to authenticated
  using (
    exists (select 1 from public.posts p where p.id = comments.post_id)
  );

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
  on public.comments
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = comments.post_id)
  );

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
  on public.comments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 댓글은 작성자 본인과 게시글 작성자가 삭제할 수 있다.
drop policy if exists comments_delete_own_or_post_owner on public.comments;
create policy comments_delete_own_or_post_owner
  on public.comments
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.posts p
      where p.id = comments.post_id and p.user_id = auth.uid()
    )
  );

-- 5) post_likes RLS ----------------------------------------------------------

alter table public.post_likes enable row level security;

drop policy if exists post_likes_select_visible on public.post_likes;
create policy post_likes_select_visible
  on public.post_likes
  for select
  to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_likes.post_id)
  );

drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own
  on public.post_likes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_likes.post_id)
  );

drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own
  on public.post_likes
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 6) comment_likes RLS -------------------------------------------------------
--
-- 정책은 이미 있었으나 SELECT 가 {public} + true 라, 비공개 글의 댓글에 누가 좋아요를
-- 눌렀는지가 그대로 노출된다. 부모 댓글이 보이는 경우로 좁힌다.

alter table public.comment_likes enable row level security;

drop policy if exists comment_likes_select on public.comment_likes;
create policy comment_likes_select_visible
  on public.comment_likes
  for select
  to authenticated
  using (
    exists (select 1 from public.comments c where c.id = comment_likes.comment_id)
  );

drop policy if exists comment_likes_insert_own on public.comment_likes;
create policy comment_likes_insert_own
  on public.comment_likes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.comments c where c.id = comment_likes.comment_id)
  );

-- comment_likes_delete_own 은 기존 정책을 그대로 사용한다.
