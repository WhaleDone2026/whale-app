-- 문의하기
--
-- 설정 > 문의하기 에서 올린 내용을 저장하고, 운영 메일로 보낸다.
-- 메일만 보내고 끝내지 않는 이유: 메일이 실패하거나 지워져도 내용이 남아야 하고,
-- 나중에 답변 상태를 관리하려면 어차피 행이 필요하다.
--
-- 발송 경로는 신고와 같다.
--   inquiries INSERT → trigger(notify_inquiry_mail) → pg_net → send-inquiry-mail → Resend

create table if not exists public.inquiries (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    -- 답장 받을 주소. 소셜 로그인이라 계정 이메일이 없을 수 있어서 직접 받는다.
    reply_email text,
    content     text not null,
    status      text not null default 'pending'
                check (status in ('pending', 'answered', 'closed')),
    created_at  timestamptz not null default now(),
    constraint inquiries_content_length
        check (char_length(btrim(content)) between 5 and 2000)
);

create index if not exists inquiries_user_idx
    on public.inquiries (user_id, created_at desc);

alter table public.inquiries enable row level security;

-- 내가 보낸 문의만 볼 수 있다. 답변 상태 변경은 운영(service_role)이 한다.
drop policy if exists inquiries_select_own on public.inquiries;
create policy inquiries_select_own
    on public.inquiries for select to authenticated
    using (user_id = auth.uid());

drop policy if exists inquiries_insert_own on public.inquiries;
create policy inquiries_insert_own
    on public.inquiries for insert to authenticated
    with check (user_id = auth.uid());

-- 접수 RPC ------------------------------------------------------------------
--
-- 한 건마다 운영 메일함으로 메일이 한 통 간다. 실수로든 고의로든 연타하면 메일함이
-- 막히므로 여기서 막는다.

create or replace function public.submit_inquiry(
    p_content     text,
    p_reply_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id      uuid;
    v_content text := btrim(coalesce(p_content, ''));
    v_email   text := nullif(btrim(coalesce(p_reply_email, '')), '');
    v_recent  int;
begin
    if auth.uid() is null then
        raise exception '로그인이 필요합니다.';
    end if;

    if char_length(v_content) < 5 then
        raise exception '문의 내용을 5자 이상 적어 주세요.';
    end if;

    if char_length(v_content) > 2000 then
        raise exception '문의 내용은 2000자까지 쓸 수 있어요.';
    end if;

    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception '이메일 주소를 다시 확인해 주세요.';
    end if;

    select count(*) into v_recent
    from public.inquiries
    where user_id = auth.uid()
      and created_at > now() - interval '1 hour';

    if v_recent >= 5 then
        raise exception '문의는 한 시간에 5건까지 보낼 수 있어요. 잠시 후 다시 시도해 주세요.';
    end if;

    insert into public.inquiries (user_id, reply_email, content)
    values (auth.uid(), v_email, v_content)
    returning id into v_id;

    return v_id;
end;
$$;

grant execute on function public.submit_inquiry(text, text) to authenticated;

-- 운영 메일 -------------------------------------------------------------------
--
-- 배포 전에 한 번 실행할 것 (SQL Editor):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/send-inquiry-mail', 'inquiry_fn_url');
--   select vault.create_secret('<임의의 긴 문자열>', 'inquiry_hook_secret');
-- 두 번째 값은 Edge Function 의 INQUIRY_HOOK_SECRET 과 같아야 한다:
--   supabase secrets set INQUIRY_HOOK_SECRET=<같은 값>
--   supabase functions deploy send-inquiry-mail --no-verify-jwt

create extension if not exists pg_net;

create or replace function public.notify_inquiry_mail()
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
        from vault.decrypted_secrets where name = 'inquiry_fn_url';
    select decrypted_secret into hook_secret
        from vault.decrypted_secrets where name = 'inquiry_hook_secret';

    -- 시크릿이 아직 없으면 조용히 넘어간다. 메일 때문에 문의 저장이 실패하면 안 된다.
    if fn_url is null or hook_secret is null then
        return new;
    end if;

    perform net.http_post(
        url     := fn_url,
        body    := jsonb_build_object('record', to_jsonb(new)),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-inquiry-secret', hook_secret
        ),
        timeout_milliseconds := 5000
    );

    return new;
exception
    when others then
        raise warning '[inquiry-mail] 트리거 실패: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists inquiries_send_mail on public.inquiries;
create trigger inquiries_send_mail
    after insert on public.inquiries
    for each row
    execute function public.notify_inquiry_mail();
