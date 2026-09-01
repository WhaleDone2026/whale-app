-- 보관함 카테고리 썸네일
--
--   - 카테고리를 만들 때 고른 이미지를 폴더 대표 이미지로 고정한다.
--   - 고르지 않았으면(null) 앱이 그 카테고리의 '최신' 게시글 사진을 대신 보여준다.
--   - 이미지 파일은 새 버킷을 만들지 않고 기존 'profiles' 버킷의
--     {userId}/diary-categories/ 경로에 올린다. 첫 폴더가 본인 userId 라서
--     프로필·커버 이미지에 걸려 있는 스토리지 정책이 그대로 적용된다.

alter table public.diary_categories
    add column if not exists image_url text;

comment on column public.diary_categories.image_url is
    '카테고리 대표 이미지 공개 URL. null 이면 최신 게시글 사진을 쓴다.';
