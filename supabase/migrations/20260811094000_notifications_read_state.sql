-- 알림 읽음 처리
--
-- is_read 컬럼은 처음부터 있었지만 이 값을 true 로 바꾸는 곳이 없어서, 모든 알림이
-- 영원히 NEW 로 남아 있었다. 읽음 처리를 하려면 본인 알림에 대한 update 정책이 필요하다.

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
    on public.notifications for update to authenticated
    using (recipient_user_id = auth.uid())
    with check (recipient_user_id = auth.uid());

-- 안 읽은 알림 개수는 화면을 열 때마다 물어보는 값이다. 읽은 알림이 쌓일수록
-- 전체 스캔이 되므로, 안 읽은 행만 담는 부분 인덱스를 둔다.
create index if not exists notifications_unread_idx
    on public.notifications (recipient_user_id)
    where not is_read;
