-- 친구 요청 푸시
--
-- notifications 테이블에 행을 넣지 않는다. 알림 화면이 대기중 친구 요청을 이미
-- fetchIncomingFriendRequests 로 따로 불러와 보여주고 있어서, 여기에 행까지 넣으면
-- 같은 요청이 화면에 두 번 뜬다. 인앱 표시는 지금 방식 그대로 두고 푸시만 얹는다.
--
-- 그래서 트리거가 friend_requests 에 직접 붙고, Edge Function 에는 notifications 행과
-- 같은 모양의 payload 를 만들어 보낸다(함수 입장에선 구분할 필요가 없다).

-- 1) 발송 호출을 함수 하나로 모은다 -------------------------------------------
--
-- notifications 트리거와 friend_requests 트리거가 같은 일(Vault 조회 → pg_net 호출)을
-- 하므로, 두 벌로 두면 URL·시크릿 이름을 고칠 때 한쪽만 고치는 사고가 난다.
create or replace function public.send_push_event(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
    fn_url      text;
    hook_secret text;
begin
    select decrypted_secret into fn_url
        from vault.decrypted_secrets where name = 'push_fn_url';
    select decrypted_secret into hook_secret
        from vault.decrypted_secrets where name = 'push_hook_secret';

    if fn_url is null or hook_secret is null then
        return;
    end if;

    perform net.http_post(
        url     := fn_url,
        body    := payload,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-secret', hook_secret
        ),
        timeout_milliseconds := 5000
    );
end;
$$;

-- 2) 기존 notifications 트리거를 공용 함수 쪽으로 옮긴다 ------------------------
create or replace function public.notify_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.send_push_event(jsonb_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'record', to_jsonb(new)
    ));
    return new;
exception
    when others then
        raise warning '[push] notifications 트리거 실패: %', sqlerrm;
        return new;
end;
$$;

-- 3) 친구 요청 트리거 ----------------------------------------------------------
create or replace function public.notify_push_on_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- 수락·거절로 status 가 바뀌는 건 이 트리거의 관심사가 아니다. 새로 들어온
    -- 대기중 요청만 알린다.
    if new.status is distinct from 'pending' then
        return new;
    end if;

    perform public.send_push_event(jsonb_build_object(
        'type', 'INSERT',
        'table', 'friend_requests',
        'record', jsonb_build_object(
            'type', 'friend_request',
            'actor_user_id', new.requester_id,
            'recipient_user_id', new.addressee_id,
            'post_id', null,
            'comment_content', null
        )
    ));
    return new;
exception
    -- 푸시 때문에 친구 요청 자체가 실패하면 안 된다.
    when others then
        raise warning '[push] friend_requests 트리거 실패: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists friend_requests_send_push on public.friend_requests;
create trigger friend_requests_send_push
    after insert on public.friend_requests
    for each row
    execute function public.notify_push_on_friend_request();
