-- 친구가 새 글을 올렸을 때 알림 (new_post)
--
-- 앞의 like/comment/reply 와 달리 이건 fan-out 이다. 글 하나에 친구 수만큼 알림 행이
-- 생긴다. 일기 앱이라 하루에도 여러 번 쓰는데 그때마다 친구 전원에게 울리면 알림을
-- 아예 꺼버리게 되므로, 같은 작성자→같은 수신자 조합은 24시간에 한 번만 알린다.
--
-- 달력 하루가 아니라 24시간 롤링인 이유: 자정 경계를 쓰면 23:59와 00:01에 쓴 두 글이
-- '다른 날'이라 2분 간격으로 두 번 울린다. 롤링이면 그런 구멍이 없다.

create or replace function public.notify_on_new_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- 비공개 글은 친구도 못 보므로 알리지 않는다.
    if new.visibility is distinct from 'public' then
        return new;
    end if;

    -- 친구 목록을 돌면서 하나씩 넣지 않고 한 문장으로 처리한다. 친구가 많을수록
    -- 왕복이 늘어나는데, 이 트리거는 글쓰기 트랜잭션 안에서 도는 것이라 짧아야 한다.
    insert into public.notifications
        (type, actor_user_id, recipient_user_id, post_id, comment_id,
         post_image_url, comment_content, is_read)
    select 'new_post', new.user_id, f.friend_id, new.id, null, null, null, false
    from (
        -- friend_requests 는 방향이 있는 테이블이라, 내가 보낸 쪽·받은 쪽 양쪽에서
        -- 상대를 뽑아야 실제 친구 목록이 된다.
        select case
                   when requester_id = new.user_id then addressee_id
                   else requester_id
               end as friend_id
        from public.friend_requests
        where status = 'accepted'
          and (requester_id = new.user_id or addressee_id = new.user_id)
    ) f
    where f.friend_id is not null
      and f.friend_id <> new.user_id
      and not exists (
          select 1
          from public.notifications n
          where n.type = 'new_post'
            and n.actor_user_id = new.user_id
            and n.recipient_user_id = f.friend_id
            and n.created_at > now() - interval '24 hours'
      );

    return new;
exception
    -- 알림 생성 실패가 글쓰기 자체를 되돌리게 두지 않는다.
    when others then
        raise warning '[notify] posts 트리거 실패: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists posts_notify_friends on public.posts;
create trigger posts_notify_friends
    after insert on public.posts
    for each row
    execute function public.notify_on_new_post();

-- 위 중복 검사(actor + recipient + 최근 24시간)가 매 글마다 돈다.
create index if not exists notifications_new_post_dedupe_idx
    on public.notifications (actor_user_id, recipient_user_id, created_at desc)
    where type = 'new_post';

-- 썸네일 채우기 -----------------------------------------------------------------
--
-- 앱은 글을 먼저 만들고 이미지를 post_images 에 따로 넣는다. 그래서 new_post 알림이
-- 만들어지는 시점에는 아직 이미지가 없어 썸네일이 항상 비어 있게 된다. 첫 이미지가
-- 들어올 때 그 글의 알림들을 채워 준다.
create or replace function public.backfill_notification_post_image()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- 여러 장 올리면 이 트리거도 여러 번 돈다. 대표 이미지(sort_order 가 가장 작은 것)일
    -- 때만 반영해서, 나중에 들어온 장이 앞 장을 덮어쓰지 않게 한다.
    if new.sort_order is distinct from (
        select min(sort_order) from public.post_images where post_id = new.post_id
    ) then
        return new;
    end if;

    update public.notifications
       set post_image_url = new.image_url
     where post_id = new.post_id
       and post_image_url is null;

    return new;
exception
    when others then
        raise warning '[notify] post_images 썸네일 채우기 실패: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists post_images_backfill_notification on public.post_images;
create trigger post_images_backfill_notification
    after insert on public.post_images
    for each row
    execute function public.backfill_notification_post_image();
