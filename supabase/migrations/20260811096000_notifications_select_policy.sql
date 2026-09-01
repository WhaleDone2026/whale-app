-- 알림 읽기 정책
--
-- 트리거로 알림 행이 쌓이고 푸시도 정상적으로 나가는데 앱의 알림 목록만 비어 있었다.
-- 앱은 사용자 토큰으로 읽어서 RLS를 타는데 notifications 에 select 정책이 없으면
-- PostgREST 가 에러 없이 빈 배열을 돌려주기 때문에, 화면이 조용히 비어 보인다.
-- (같은 화면의 친구 요청은 friend_requests 쪽에 정책이 있어서 보였다.)
--
-- 정책은 permissive 라 여러 개가 OR 로 합쳐진다. 이미 비슷한 정책이 있어도
-- 이걸 더하는 것으로 깨지지 않는다.

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
    on public.notifications for select to authenticated
    using (recipient_user_id = auth.uid());

-- 목록은 항상 "내 알림을 최신순으로"만 조회한다.
create index if not exists notifications_recipient_created_idx
    on public.notifications (recipient_user_id, created_at desc);
