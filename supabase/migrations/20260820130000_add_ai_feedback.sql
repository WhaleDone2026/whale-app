-- 고래 한마디 평가 (따봉/붐따)
--
-- 글쓰기 > 고래에게 물어보기 시트에서 한마디에 좋아요·싫어요를 누르고 사유와 코멘트를
-- 남기는 흐름. 지금까지는 화면에서 모으기만 하고 어디에도 저장하지 않았다.
--
-- 왜 whale-AI 서버가 아니라 여기인가
--   한마디 생성·장기기억은 FastAPI 서버가 맡지만, 평가는 앱 안에서 끝나는 데이터라
--   서버 API 를 새로 뚫는 것보다 Supabase 에 남기는 쪽이 붙이기 쉽다.
--   draft_id 를 같이 저장하므로 나중에 서버 기록과 맞춰볼 수 있다.

create table if not exists public.ai_feedback (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles (id) on delete cascade,
    -- 어떤 초안에서 나온 한마디인지. whale-AI 의 draft 와 같은 값이다.
    draft_id      text,
    feedback_type text not null check (feedback_type in ('positive', 'negative')),
    -- 시트에서 고른 사유들. 화면에 보이는 한글 라벨을 그대로 담는다.
    reasons       text[] not null default '{}',
    comment       text,
    -- 평가 대상이 된 한마디. 이게 없으면 무엇이 나빴는지 알 수 없다.
    whale_message text,
    -- '다른 한마디'를 몇 번 누른 뒤에 나온 것인지
    retry_count   integer,
    created_at    timestamptz not null default now(),
    constraint ai_feedback_comment_length
        check (comment is null or char_length(comment) <= 1000)
);

create index if not exists ai_feedback_created_idx
    on public.ai_feedback (created_at desc);

alter table public.ai_feedback enable row level security;

-- 남기고 자기 것만 볼 수 있다. 분석은 대시보드(service_role)에서 한다.
drop policy if exists ai_feedback_insert_own on public.ai_feedback;
create policy ai_feedback_insert_own
    on public.ai_feedback for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists ai_feedback_select_own on public.ai_feedback;
create policy ai_feedback_select_own
    on public.ai_feedback for select to authenticated
    using (user_id = auth.uid());

-- 운영 메일 -------------------------------------------------------------------
--
-- 따봉이든 붐따든 평가는 전부 보낸다. 나중에 양이 많아져 메일함이 부담되면
-- 트리거에 when 절을 걸어 붐따만 남기면 된다.
--
-- 배포 전에 한 번 실행할 것 (SQL Editor):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/send-ai-feedback-mail', 'ai_feedback_fn_url');
--   select vault.create_secret('<임의의 긴 문자열>', 'ai_feedback_hook_secret');
--   supabase secrets set AI_FEEDBACK_HOOK_SECRET=<같은 값>
--   supabase functions deploy send-ai-feedback-mail --no-verify-jwt

create extension if not exists pg_net;

create or replace function public.notify_ai_feedback_mail()
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
        from vault.decrypted_secrets where name = 'ai_feedback_fn_url';
    select decrypted_secret into hook_secret
        from vault.decrypted_secrets where name = 'ai_feedback_hook_secret';

    -- 시크릿이 아직 없으면 조용히 넘어간다. 메일 때문에 평가 저장이 실패하면 안 된다.
    if fn_url is null or hook_secret is null then
        return new;
    end if;

    perform net.http_post(
        url     := fn_url,
        body    := jsonb_build_object('record', to_jsonb(new)),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-ai-feedback-secret', hook_secret
        ),
        timeout_milliseconds := 5000
    );

    return new;
exception
    when others then
        raise warning '[ai-feedback-mail] 트리거 실패: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists ai_feedback_send_mail on public.ai_feedback;
create trigger ai_feedback_send_mail
    after insert on public.ai_feedback
    for each row
    execute function public.notify_ai_feedback_mail();
