-- 좋아요 / 댓글 / 답글 알림 생성
--
-- notifications 테이블은 만들어져 있었지만 여기에 행을 넣는 곳이 앱에도 DB에도 없어서
-- 생성 이후 0행이었다. 그래서 알림 페이지의 목록은 항상 비어 있었고(친구 요청만 별도
-- 경로로 보이던 것), 푸시도 발동할 소스가 없었다.
--
-- 앱이 아니라 트리거로 넣는 이유
--   1) 앱에서 넣으면 RLS상 "남의 행을 대신 만드는" 권한을 열어야 한다.
--   2) 좋아요는 여러 화면에서 토글되는데, 화면마다 알림 생성을 붙이면 빠뜨리기 쉽다.
--   3) 여기서 넣으면 기존 notifications_send_push 트리거가 이어받아 푸시까지 나간다.

-- 공통 삽입 --------------------------------------------------------------------
create or replace function public.create_notification(
    p_type            text,
    p_actor           uuid,
    p_recipient       uuid,
    p_post_id         uuid,
    p_comment_content text default null,
    -- 앱은 아직 이 값을 읽지 않지만, 나중에 알림을 눌러 해당 댓글로 보내려면 필요하다.
    p_comment_id      uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_image text;
begin
    -- 자기 글에 자기가 남긴 반응은 알리지 않는다. 수신자를 못 찾은 경우(글 삭제 등)도 마찬가지.
    if p_actor is null or p_recipient is null or p_actor = p_recipient then
        return;
    end if;

    -- 알림 목록이 글 썸네일을 같이 보여준다. 첫 번째 이미지를 쓴다.
    select image_url into v_image
    from public.post_images
    where post_id = p_post_id
    order by sort_order
    limit 1;

    insert into public.notifications
        (type, actor_user_id, recipient_user_id, post_id, comment_id, post_image_url, comment_content, is_read)
    values
        (p_type, p_actor, p_recipient, p_post_id, p_comment_id, v_image, p_comment_content, false);
end;
$$;

-- 좋아요 ------------------------------------------------------------------------
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_author uuid;
begin
    -- 좋아요를 껐다 켰다 하면 그때마다 알림이 쌓인다. 같은 사람이 같은 글에 남긴
    -- 좋아요 알림이 이미 있으면 건너뛴다.
    if exists (
        select 1 from public.notifications
        where type = 'like'
          and actor_user_id = new.user_id
          and post_id = new.post_id
    ) then
        return new;
    end if;

    select user_id into v_author from public.posts where id = new.post_id;
    perform public.create_notification('like', new.user_id, v_author, new.post_id, null);
    return new;
exception
    -- 알림 생성 실패가 좋아요 자체를 되돌리게 두지 않는다.
    when others then
        raise warning '[notify] post_likes 트리거 실패: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify
    after insert on public.post_likes
    for each row
    execute function public.notify_on_post_like();

-- 댓글 / 답글 --------------------------------------------------------------------
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_post_author   uuid;
    v_parent_author uuid;
begin
    select user_id into v_post_author from public.posts where id = new.post_id;

    if new.parent_comment_id is null then
        perform public.create_notification(
            'comment', new.user_id, v_post_author, new.post_id, new.content, new.id);
    else
        -- 답글은 글쓴이가 아니라 원 댓글을 쓴 사람에게 간다. 둘이 같은 사람이면
        -- create_notification 의 자기 자신 검사에서 걸러진다.
        select user_id into v_parent_author
        from public.comments where id = new.parent_comment_id;
        perform public.create_notification(
            'reply', new.user_id, v_parent_author, new.post_id, new.content, new.id);
    end if;
    return new;
exception
    when others then
        raise warning '[notify] comments 트리거 실패: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
    after insert on public.comments
    for each row
    execute function public.notify_on_comment();
