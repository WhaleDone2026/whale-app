-- 보관함 카테고리 수정·삭제
--
-- 카테고리는 두 곳에 흩어져 있다.
--   1) diary_categories 행       — 사용자가 만든 폴더(썸네일 포함)
--   2) posts.category            — 글에 붙은 카테고리 '이름' (text)
--
-- 이름을 바꾸면 두 곳을 같이 고쳐야 하고, 지우면 폴더만 없애고 글은 남겨야 한다.
-- 한 트랜잭션에서 처리해야 해서 RPC 로 묶는다. (block_user 와 같은 이유)
--
-- 글에 붙은 이름만 있고 diary_categories 행이 없는 카테고리도 있다(폴더를 만들지 않고
-- 글에서 바로 이름을 붙인 경우). 그래서 두 함수 모두 행이 없어도 posts 는 손본다.

-- 1) 이름·썸네일 수정 ---------------------------------------------------------
--
-- p_image_url 이 null 이면 썸네일은 건드리지 않는다. 지우는 기능은 없다 —
-- 다른 사진으로 바꾸는 것만 된다.

create or replace function public.update_diary_category(
    p_title     text,
    p_new_title text,
    p_image_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_title     text := btrim(coalesce(p_title, ''));
    v_new_title text := btrim(coalesce(p_new_title, ''));
begin
    if auth.uid() is null then
        raise exception '로그인이 필요합니다.';
    end if;

    if v_title = '' or v_new_title = '' then
        raise exception '카테고리명을 입력해 주세요.';
    end if;

    if char_length(v_new_title) > 20 then
        raise exception '카테고리명은 20자까지 쓸 수 있어요.';
    end if;

    -- 이름을 바꾸는 경우에만 중복 검사. 썸네일만 바꿀 때는 자기 자신과 부딪힌다.
    if v_new_title <> v_title and exists (
        select 1 from public.diary_categories
        where user_id = auth.uid() and title = v_new_title
    ) then
        raise exception '이미 있는 카테고리예요.';
    end if;

    update public.diary_categories
    set title     = v_new_title,
        image_url = coalesce(p_image_url, image_url)
    where user_id = auth.uid()
      and title = v_title;

    -- 폴더 없이 글에만 이름이 붙어 있던 카테고리라면 행을 만들어 준다.
    -- 안 만들면 이름을 바꾼 뒤 썸네일을 넣을 자리가 없다.
    if not found then
        insert into public.diary_categories (user_id, title, image_url)
        values (auth.uid(), v_new_title, p_image_url)
        on conflict do nothing;
    end if;

    if v_new_title <> v_title then
        update public.posts
        set category = v_new_title
        where user_id = auth.uid()
          and category = v_title;
    end if;
end;
$$;

grant execute on function public.update_diary_category(text, text, text) to authenticated;

-- 2) 삭제 --------------------------------------------------------------------
--
-- 폴더만 없앤다. 안에 있던 글은 category 를 비워서 '전체'에만 남는다 —
-- 카테고리를 정리하다가 글이 사라지면 되돌릴 방법이 없다.

create or replace function public.delete_diary_category(p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_title text := btrim(coalesce(p_title, ''));
begin
    if auth.uid() is null then
        raise exception '로그인이 필요합니다.';
    end if;

    if v_title = '' then
        raise exception '삭제할 카테고리를 찾지 못했어요.';
    end if;

    update public.posts
    set category = null
    where user_id = auth.uid()
      and category = v_title;

    delete from public.diary_categories
    where user_id = auth.uid()
      and title = v_title;
end;
$$;

grant execute on function public.delete_diary_category(text) to authenticated;
