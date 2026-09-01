-- 신고 사유·신고 내역·신고 메일
--
-- 기존 20260728120000 에서 reports 테이블을 만들 때 사유(reason) 선택 UI 가 없어서
-- reason 을 nullable 로 비워 뒀다. 이제 화면이 생겼으므로
--   1) 사유 코드값을 고정하고
--   2) 접수를 RPC 로 묶고 (중복 신고 처리 때문에 — 아래 참고)
--   3) 내 신고 내역을 대상 이름까지 붙여 내려주고
--   4) 접수되면 운영 메일로 보낸다.

-- 1) 사유 코드 ---------------------------------------------------------------
--
-- not valid: 사유 없이 접수된 기존 행이 남아 있어서 지금 있는 데이터는 검사하지 않는다.
-- 앞으로 들어오는 행에는 그대로 걸린다.

alter table public.reports drop constraint if exists reports_reason_valid;
alter table public.reports add constraint reports_reason_valid
    check (reason is null or reason in (
        'spam',        -- 스팸 또는 광고
        'sexual',      -- 성적인 콘텐츠
        'violence',    -- 폭력 또는 혐오
        'harassment',  -- 괴롭힘 또는 따돌림
        'false_info',  -- 거짓 정보
        'etc'          -- 기타
    )) not valid;

alter table public.reports drop constraint if exists reports_detail_length;
alter table public.reports add constraint reports_detail_length
    check (detail is null or char_length(detail) <= 500) not valid;

-- 2) 접수 RPC ----------------------------------------------------------------
--
-- 왜 RPC 인가: 같은 대상을 다시 신고하면 reports_unique_target 에 걸린다. 이때 사유만
-- 갱신하려면 upsert 가 필요한데, PostgREST 의 upsert 는 보낸 컬럼을 전부 SET 에 넣어서
-- reporter_id/target_* 까지 update 권한이 필요해진다. 사용자에게 그 권한을 주고 싶지
-- 않으므로 서버 함수 안에서 처리한다.

create or replace function public.submit_report(
    p_target_type text,
    p_target_id   uuid,
    p_reason      text,
    p_detail      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id     uuid;
    v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
begin
    if auth.uid() is null then
        raise exception '로그인이 필요합니다.';
    end if;

    if p_target_type not in ('post', 'comment', 'user') then
        raise exception '신고할 수 없는 대상입니다.';
    end if;

    if p_reason is null or p_reason not in
        ('spam', 'sexual', 'violence', 'harassment', 'false_info', 'etc') then
        raise exception '신고 사유를 선택해 주세요.';
    end if;

    if p_target_type = 'user' and p_target_id = auth.uid() then
        raise exception '자기 자신은 신고할 수 없습니다.';
    end if;

    if v_detail is not null and char_length(v_detail) > 500 then
        raise exception '상세 내용은 500자까지 쓸 수 있어요.';
    end if;

    -- 이미 신고한 대상이면 사유만 갈아 끼운다. 내역은 대상당 한 줄로 유지된다.
    insert into public.reports (reporter_id, target_type, target_id, reason, detail)
    values (auth.uid(), p_target_type, p_target_id, p_reason, v_detail)
    on conflict (reporter_id, target_type, target_id)
    do update set reason = excluded.reason,
                  detail = excluded.detail
    returning id into v_id;

    return v_id;
end;
$$;

grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

-- 3) 내 신고 내역 -------------------------------------------------------------
--
-- security definer 인 이유: 신고하고 나서 차단하면 RLS 때문에 상대 프로필·글이 안 보인다.
-- 그러면 내역 화면이 통째로 '알 수 없음'이 된다. 대상 이름과 미리보기만 내려준다.

create or replace function public.get_my_reports()
returns table (
    id                uuid,
    target_type       text,
    target_id         uuid,
    target_label      text,
    target_owner_name text,
    reason            text,
    detail            text,
    status            text,
    created_at        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select
        r.id,
        r.target_type,
        r.target_id,
        case r.target_type
            when 'post'    then left(nullif(btrim(coalesce(p.contents, '')), ''), 60)
            when 'comment' then left(nullif(btrim(coalesce(c.content, '')), ''), 60)
            else null
        end,
        coalesce(tu.name, pu.name, cu.name),
        r.reason,
        r.detail,
        r.status,
        r.created_at
    from public.reports r
    left join public.profiles tu on r.target_type = 'user' and tu.id = r.target_id
    left join public.posts    p  on r.target_type = 'post' and p.id = r.target_id
    left join public.profiles pu on pu.id = p.user_id
    left join public.comments c  on r.target_type = 'comment' and c.id = r.target_id
    left join public.profiles cu on cu.id = c.user_id
    where r.reporter_id = auth.uid()
    order by r.created_at desc;
$$;

grant execute on function public.get_my_reports() to authenticated;

-- 4) 운영 메일 ----------------------------------------------------------------
--
-- 경로: reports INSERT → 이 트리거(pg_net) → send-report-mail Edge Function → Resend
-- send-push 와 같은 방식이다. 시크릿은 Vault 에서 읽는다.
--
-- 배포 전에 한 번 실행할 것 (SQL Editor):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/send-report-mail', 'report_fn_url');
--   select vault.create_secret('<임의의 긴 문자열>', 'report_hook_secret');
-- 두 번째 값은 Edge Function 의 REPORT_HOOK_SECRET 과 같아야 한다:
--   supabase secrets set REPORT_HOOK_SECRET=<같은 값> RESEND_API_KEY=<Resend 키>
--   supabase functions deploy send-report-mail --no-verify-jwt

create extension if not exists pg_net;

create or replace function public.notify_report_mail()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
    fn_url      text;
    hook_secret text;
begin
    -- 재신고로 사유가 바뀐 경우에만 다시 보낸다. 상태 변경(운영이 처리)에는 안 보낸다.
    if tg_op = 'UPDATE'
       and new.reason is not distinct from old.reason
       and new.detail is not distinct from old.detail then
        return new;
    end if;

    select decrypted_secret into fn_url
        from vault.decrypted_secrets where name = 'report_fn_url';
    select decrypted_secret into hook_secret
        from vault.decrypted_secrets where name = 'report_hook_secret';

    -- 시크릿이 아직 없으면 조용히 넘어간다. 메일 때문에 신고 접수가 실패하면 안 된다.
    if fn_url is null or hook_secret is null then
        return new;
    end if;

    perform net.http_post(
        url     := fn_url,
        body    := jsonb_build_object('record', to_jsonb(new)),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-report-secret', hook_secret
        ),
        timeout_milliseconds := 5000
    );

    return new;
exception
    when others then
        raise warning '[report-mail] 트리거 실패: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists reports_send_mail on public.reports;
create trigger reports_send_mail
    after insert or update of reason, detail on public.reports
    for each row
    execute function public.notify_report_mail();
