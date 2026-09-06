import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { login } from '@react-native-seoul/kakao-login';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleIcon } from '@/components/icons/google-icon';
import {FontFamily, gray} from "@/constants/theme";
import { supabase } from '@/src/lib/supabase';
import {
  confirmAuthenticatedUser,
  getPostLoginRoute,
  type PostLoginRoute,
} from '@/src/services/onboarding';

type SocialProvider = 'kakao' | 'google' | 'apple';

type KakaoLoginToken = {
  idToken?: string;
  id_token?: string;
};

const SESSION_BOOTSTRAP_TIMEOUT_MS = 6_000;

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Google Cloud Console 에서 만든 OAuth 클라이언트 ID. 비밀값이 아니라 앱에 그대로
// 들어가는 값이고, client secret 은 Supabase 쪽에만 넣는다.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

// configure 는 signIn 전에 한 번만 부르면 된다. 화면이 다시 그려질 때마다 부를
// 이유가 없어서 모듈 로드 시점에 처리한다.
//
// webClientId 가 핵심이다 — 이 값이 없으면 Android 에서 idToken 이 null 로 와서
// Supabase 에 넘길 게 없어진다. iOS 는 iosClientId 로 자기 클라이언트를 찾는다.
if (GOOGLE_WEB_CLIENT_ID) {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: ['profile', 'email'],
  });
}

export default function RootIndex() {
  const rootNavigationState = useRootNavigationState();
  const { width } = useWindowDimensions();
  const backgroundHeight = width * (1024 / 780);
  // 어떤 버튼을 눌렀는지 기억해 둔다. 단순 boolean 이면 세 버튼이 한꺼번에
  // 로딩 상태로 보여서, 누른 버튼에만 스피너를 띄우려고 provider 를 담는다.
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null);
  const isAuthLoading = pendingProvider !== null;
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    // Expo Router의 root navigator가 준비되기 전 replace를 보내면 액션이 유실되어
    // "Do you have a route named onboarding?" 오류가 난다.
    if (!rootNavigationState?.key) {
      return;
    }

    let isMounted = true;

    // getUser()는 서버 검증 요청까지 기다린다. 시작 화면에서는 먼저 SecureStore의
    // 로컬 세션을 복원해야 오프라인·느린 네트워크에서도 앱이 멈춘 것처럼 보이지 않는다.
    withTimeout(supabase.auth.getSession(), SESSION_BOOTSTRAP_TIMEOUT_MS, '세션 복원 시간이 초과되었습니다.')
      .then(async ({ data: { session }, error }) => {
        if (!isMounted) {
          return;
        }

        if (error || !session?.user) {
          return;
        }

        const route = await withTimeout(
          getPostLoginRoute(session.user),
          SESSION_BOOTSTRAP_TIMEOUT_MS,
          '로그인 상태 확인 시간이 초과되었습니다.',
        );

        if (!isMounted) {
          return;
        }

        navigateAfterLogin(route);
      })
      .catch(() => {
        // Stay on login screen when there is no active session.
      })
      .finally(() => {
        if (isMounted) {
          setIsCheckingSession(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [rootNavigationState?.key]);

  const navigateAfterLogin = (route: PostLoginRoute) => {
    if (route.destination === 'home') {
      // 칭찬고래의 첫 진입은 피드보다 친구 고래가 보이는 공간으로 연다.
      router.replace('/(tabs)/home/group');
      return;
    }

    // 프로필 화면은 진입 시 현재 세션에서 seed를 다시 읽으므로 params 없이도 된다.
    // 문자열 절대 경로로 보내면 탭 navigator가 이 replace 액션을 가로채지 않는다.
    router.replace(route.step === 'profile' ? '/onboarding/profile' : '/onboarding/terms');
  };

  const handleKakaoLogin = async () => {
    if (isAuthLoading) {
      return;
    }

    setPendingProvider('kakao');
    setLoginError(null);

    try {
      const kakaoToken = (await login()) as KakaoLoginToken;
      const idToken = kakaoToken.idToken ?? kakaoToken.id_token;

      if (!idToken) {
        throw new Error('카카오 로그인 결과에서 id_token을 찾을 수 없습니다.');
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'kakao',
        token: idToken,
      });

      if (signInError) {
        throw signInError;
      }

      const user = await confirmAuthenticatedUser();
      const route = await getPostLoginRoute(user);
      navigateAfterLogin(route);
    } catch (error) {
      const message = error instanceof Error ? error.message : '카카오 로그인 중 문제가 발생했습니다.';
      setLoginError(message);
    } finally {
      setPendingProvider(null);
    }
  };

  const handleGoogleLogin = async () => {
    if (isAuthLoading) {
      return;
    }

    if (!GOOGLE_WEB_CLIENT_ID) {
      setLoginError('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID 환경 변수를 확인해주세요.');
      return;
    }

    setPendingProvider('google');
    setLoginError(null);

    try {
      // Android 전용 검사다. Play 서비스가 없거나 낡은 기기에서 signIn 이 알 수 없는
      // 에러로 죽는 걸 막고, 업데이트 안내 다이얼로그를 띄워 준다. iOS 에서는 통과한다.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Google SDK가 이전에 선택한 계정을 자동으로 재사용하지 않도록
      // 앱에 저장된 Google 로그인 상태만 지운 뒤 계정 선택을 다시 연다.
      // Supabase 세션이나 기기의 Google 계정에는 영향을 주지 않는다.
      await GoogleSignin.signOut().catch(() => undefined);

      const response = await GoogleSignin.signIn();

      // 사용자가 시트를 닫은 경우. 실패가 아니라서 에러 문구를 띄우지 않는다.
      if (!isSuccessResponse(response)) {
        return;
      }

      const idToken = response.data.idToken;

      if (!idToken) {
        throw new Error('구글 로그인 결과에서 idToken을 찾을 수 없습니다.');
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (signInError) {
        throw signInError;
      }

      const user = await confirmAuthenticatedUser();
      const route = await getPostLoginRoute(user);
      navigateAfterLogin(route);
    } catch (error) {
      // 구버전 네이티브 경로는 취소를 응답이 아니라 예외로 던진다. 둘 다 막아 둔다.
      if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      }

      const message = error instanceof Error ? error.message : '구글 로그인 중 문제가 발생했습니다.';
      setLoginError(message);
    } finally {
      setPendingProvider(null);
    }
  };

  const handleAppleLogin = async () => {
    if (isAuthLoading) {
      return;
    }

    if (Platform.OS !== 'ios') {
      setLoginError('Apple 로그인은 iOS에서만 지원됩니다.');
      return;
    }

    setPendingProvider('apple');
    setLoginError(null);

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const identityToken = credential.identityToken;

      if (!identityToken) {
        throw new Error('Apple 로그인 결과에서 identityToken을 찾을 수 없습니다.');
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
      });

      if (signInError) {
        throw signInError;
      }

      const user = await confirmAuthenticatedUser();
      const route = await getPostLoginRoute(user);
      navigateAfterLogin(route);
    } catch (error) {
      // 사용자가 Apple 로그인 시트를 취소한 경우는 오류로 표시하지 않는다.
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Apple 로그인 중 문제가 발생했습니다.';
      setLoginError(message);
    } finally {
      setPendingProvider(null);
    }
  };

  if (isCheckingSession) {
    return (
      <View style={styles.sessionLoadingScreen}>
        <ActivityIndicator color="#7ED4FF" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <Image
        source={require('@/assets/icons/login_background.png')}
        style={[styles.backgroundImage, { width, height: backgroundHeight }]}
        resizeMode="stretch"
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <Text style={styles.title}>칭찬고래</Text>
          <Text style={styles.subtitle}>{'오늘도 수고한 서로에게\n건네는 칭찬 한마디'}</Text>
        </View>

        <View style={styles.buttonGroup}>
          <SocialLoginButton
            label="카카오톡으로 시작하기"
            icon={require('@/assets/icons/kakao.png')}
            style={styles.kakaoButton}
            textStyle={styles.kakaoText}
            iconStyle={styles.kakaoIcon}
            onPress={handleKakaoLogin}
            loading={pendingProvider === 'kakao'}
            disabled={isAuthLoading}
          />
          <SocialLoginButton
            label="Google로 시작하기"
            iconElement={<GoogleIcon size={18} />}
            style={styles.googleButton}
            textStyle={styles.googleText}
            onPress={handleGoogleLogin}
            loading={pendingProvider === 'google'}
            disabled={isAuthLoading}
          />
          <SocialLoginButton
            label="Apple로 시작하기"
            icon={require('@/assets/icons/apple.png')}
            style={styles.appleButton}
            textStyle={styles.appleText}
            iconStyle={styles.appleIcon}
            onPress={handleAppleLogin}
            loading={pendingProvider === 'apple'}
            loadingIndicatorColor="#FFFFFF"
            disabled={isAuthLoading}
          />
          {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

type SocialLoginButtonProps = {
  label: string;
  /** PNG 로고용. 구글처럼 SVG 로 그리는 로고는 iconElement 를 쓴다. */
  icon?: ImageSourcePropType;
  /** 구글 로고는 4색 벡터라 PNG 로 두면 해상도마다 흐려진다. */
  iconElement?: ReactNode;
  style: ViewStyle;
  textStyle: TextStyle;
  iconStyle?: ImageStyle;
  onPress: () => void;
  loading?: boolean;
  loadingIndicatorColor?: string;
  disabled?: boolean;
};

function SocialLoginButton({
  label,
  icon,
  iconElement,
  style,
  textStyle,
  iconStyle,
  onPress,
  loading = false,
  loadingIndicatorColor = '#000000',
  disabled = false,
}: SocialLoginButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.loginButton, style, disabled && styles.disabled, pressed && styles.pressed]}>
      {loading ? (
        <ActivityIndicator color={loadingIndicatorColor} size="small" style={styles.loginIcon} />
      ) : iconElement ? (
        <View style={styles.loginIcon}>{iconElement}</View>
      ) : icon ? (
        <Image source={icon} style={[styles.loginIcon, iconStyle]} resizeMode="contain" />
      ) : null}
      <Text style={[styles.buttonText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFB',
  },
  sessionLoadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFB',
  },
  backgroundImage: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  hero: {
    marginTop: 150,
    alignItems: 'center',
  },
  title: {
    color: '#7ED4FF',
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.2,
  },
  subtitle: {
    marginTop: 10,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  buttonGroup: {
    position: 'absolute',
    bottom: 90,
    width: '100%',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 52,
  },
  loginButton: {
    width: '100%',
    maxWidth: 272,
    height: 44,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  kakaoButton: {
    backgroundColor: '#FFEE00',
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  // 흰 배경이라 그냥 두면 배경 이미지 위에서 경계가 안 보인다. 구글 가이드라인도
  // 흰 버튼에는 테두리를 두도록 정하고 있다.
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.6,
  },
  loginIcon: {
    marginRight: 10
  },
  kakaoIcon: {
    width: 20,
    height: 20,
  },
  appleIcon: {
    width: 20,
    height: 20,
  },
  buttonText: {
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  kakaoText: {
    color: '#000000',
  },
  appleText: {
    color: '#FFFFFF',
  },
  googleText: {
    color: '#1F1F1F',
  },
  errorText: {
    maxWidth: 272,
    marginTop: 4,
    color: '#D04444',
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});
