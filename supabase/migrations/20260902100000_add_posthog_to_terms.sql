-- 서비스 이용약관과 개인정보처리방침의 현재 버전에 PostHog 처리 고지를 추가한다.
-- 이미 같은 문구가 있으면 다시 붙이지 않아 여러 환경에서 안전하게 재실행할 수 있다.
update public.terms
set content = concat_ws(
  E'\n\n',
  content,
  '개인정보 처리 위탁/제공 안내\nPostHog Inc. (미국) — 서비스 이용 통계 분석\n처리 항목: 앱 이용 기록(비식별 이벤트), 사용자 식별자\n보유 및 이용 기간: 회원 탈퇴 시까지',
)
where type in ('service', 'privacy')
  and is_current = true
  and content not ilike '%PostHog Inc.%';
