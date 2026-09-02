import { Stack } from 'expo-router';

/** 온보딩 단계를 독립 스택으로 묶어 탭 네비게이터와 히스토리가 섞이지 않게 한다. */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="terms" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
