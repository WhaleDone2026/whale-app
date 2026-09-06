import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { posthog } from '@/src/lib/posthog';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { supabase } from '@/src/lib/supabase';

// 앱의 첫 렌더가 준비될 때까지 기본 스플래시가 먼저 사라지지 않게 한다.
// 호출 자체가 실패해도 앱 시작을 막을 이유는 없다.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

console.log('=== LAYOUT LOADED ===')


export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hasHiddenSplash = useRef(false);
  const [loaded, fontError] = useFonts({
    'Pretendard-Thin': require('../assets/fonts/Pretendard-Thin.ttf'),
    'Pretendard-ExtraLight': require('../assets/fonts/Pretendard-ExtraLight.ttf'),
    'Pretendard-Light': require('../assets/fonts/Pretendard-Light.ttf'),
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.ttf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.ttf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.ttf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.ttf'),
    'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.ttf'),
    'Pretendard-Black': require('../assets/fonts/Pretendard-Black.ttf'),
  });

  useEffect(() => {
    const hideSplash = () => {
      if (hasHiddenSplash.current) {
        return;
      }

      hasHiddenSplash.current = true;
      void SplashScreen.hideAsync().catch((error) => {
        console.warn('[splash] failed to hide', error);
      });
    };

    // 폰트 파일 I/O가 첫 실행에서 지연되더라도 네이티브 스플래시가 영구히 남으면 안 된다.
    const fallbackTimer = setTimeout(hideSplash, 4_000);

    if (loaded || fontError) {
      if (fontError) {
        console.warn('[fonts]', fontError);
      }
      hideSplash();
    }

    return () => clearTimeout(fallbackTimer);
  }, [fontError, loaded]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        posthog.reset();
        router.replace('/');
        return;
      }

      if (session?.user && ['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED'].includes(event)) {
        const { user } = session;
        const name =
          user.user_metadata?.profile_nickname ??
          user.user_metadata?.nickname ??
          user.user_metadata?.name;

        posthog.identify(user.id, {
          ...(user.email ? { email: user.email } : {}),
          ...(typeof name === 'string' && name ? { name } : {}),
        });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  usePushNotifications();

  if (!loaded && !fontError) {
    return null;
  }

  return (
    <PostHogProvider
      client={posthog}
      autocapture={{
        captureScreens: false,
        captureTouches: true,
        propsToCapture: ['testID'],
      }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* 신고는 피드·친구 프로필·친구 목록 어디서든 열리므로 루트에 둔다 */}
          <Stack.Screen name="report" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </PostHogProvider>
  );
}
