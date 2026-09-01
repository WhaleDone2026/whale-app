-- notifications INSERT → send-push Edge Function 호출
--
-- pg_net 의 http_post 는 요청을 큐에 넣고 바로 돌아온다. 그래서 푸시 전송이 느리거나
-- 실패해도 알림 저장 트랜잭션은 그대로 커밋된다. 인앱 알림이 푸시 때문에 막히면 안 된다.
--
-- 함수 URL과 공유 시크릿은 Vault 에서 읽는다. 마이그레이션에 박아 두면 레포에 키가
-- 그대로 남고, 갈아끼울 때마다 마이그레이션을 새로 만들어야 한다.
--
-- 배포 전에 한 번 실행할 것 (SQL Editor):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/send-push', 'push_fn_url');
--   select vault.create_secret('<임의의 긴 문자열>', 'push_hook_secret');
-- 두 번째 값은 Edge Function 의 PUSH_HOOK_SECRET 과 같아야 한다:
--   supabase secrets set PUSH_HOOK_SECRET=<같은 값>

create extension if not exists pg_net;

create or replace function public.notify_push_on_notification()
returns trigger
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

    -- 시크릿이 아직 안 들어갔으면 조용히 넘어간다. 로컬 개발이나 시크릿 교체 중에
    -- 알림 저장 자체가 실패하는 게 훨씬 나쁘다.
    if fn_url is null or hook_secret is null then
        return new;
    end if;

    perform net.http_post(
        url     := fn_url,
        body    := jsonb_build_object(
            'type', 'INSERT',
            'table', 'notifications',
            'record', to_jsonb(new)
        ),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-secret', hook_secret
        ),
        timeout_milliseconds := 5000
    );

    return new;
exception
    -- 푸시 발송 시도가 알림 저장을 되돌리게 두지 않는다.
    when others then
        raise warning '[push] 트리거 실패: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists notifications_send_push on public.notifications;
create trigger notifications_send_push
    after insert on public.notifications
    for each row
    execute function public.notify_push_on_notification();
