# 회원탈퇴 배포 안내

앱의 설정 > 회원탈퇴는 `delete-account` Edge Function을 호출한다. 함수는 현재 세션과
소셜 계정을 다시 대조한 뒤, 소셜 연결 해제 → `posts`/`profiles` Storage → 활동 데이터 →
`auth.users` 순서로 영구 삭제한다. 어느 단계라도 실패하면 `auth.users`는 삭제하지 않아
사용자가 다시 인증해 재시도할 수 있다.

## 배포

```sh
supabase secrets set GOOGLE_OAUTH_CLIENT_ID='Google Web client ID'
supabase secrets set APPLE_CLIENT_ID='iOS bundle ID'
supabase secrets set APPLE_TEAM_ID='Apple Team ID'
supabase secrets set APPLE_KEY_ID='Sign in with Apple key ID'
supabase secrets set APPLE_PRIVATE_KEY='-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----'
supabase functions deploy delete-account
```

`GOOGLE_OAUTH_CLIENT_ID`는 앱의 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`와 같은 값이다. Apple
시크릿은 iOS Apple 로그인 사용자를 위해 필요하며, 앱 `.env`에 넣으면 안 된다.

## 운영 주의사항

- 현재 프로젝트에는 Apple refresh token을 서버에 보관하는 기존 로그인 흐름이 없어서,
  탈퇴 시 새 Apple authorization code를 받아 토큰 교환 후 즉시 revoke한다. Apple 키
  시크릿이 없으면 Apple 계정 탈퇴는 삭제 전에 안전하게 중단된다.
- 웹은 기존 로그인 화면 자체가 Google 네이티브 SDK에 의존해 Google 로그인을 지원하지
  않는다. Edge Function은 웹 세션에서도 호출 가능하지만, 웹 OAuth 로그인/재인증 화면을
  별도로 도입하기 전에는 웹에서 탈퇴 요청을 완료할 수 없다.
- 새 개인 데이터 테이블이나 사용자 파일 버킷을 추가하면
  `supabase/functions/delete-account/index.ts`의 `deleteAppData`에도 삭제 규칙을 추가한다.
