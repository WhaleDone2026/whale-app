import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { posthog } from '@/src/lib/posthog';
import { supabase } from '@/src/lib/supabase';

SplashScreen.preventAutoHideAsync();

console.log('=== LAYOUT LOADED ===')


export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
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
    if (loaded || fontError) {
      if (fontError) {
        console.warn('[fonts]', fontError);
      }
      SplashScreen.hideAsync();
    }
  }, [loaded, fontError]);

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
          <Stack.Screen name="onboarding/terms" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/profile" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </PostHogProvider>
  );
}
