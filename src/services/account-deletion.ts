import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { login } from '@react-native-seoul/kakao-login';
import { Alert, Platform } from 'react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';

type DeletionProvider = 'google' | 'kakao' | 'apple';

type DeleteAccountPayload =
  | { provider: 'google'; idToken: string; accessToken: string }
  | { provider: 'kakao'; accessToken: string }
  | { provider: 'apple'; identityToken: string; authorizationCode: string };

/** 현재 계정으로 다시 인증한 뒤 Edge Function에 영구 삭제를 요청한다. */
export async function deleteCurrentAccount(): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.');
  }

  const provider = user.app_metadata.provider as DeletionProvider | undefined;
  if (!provider || !['google', 'kakao', 'apple'].includes(provider)) {
    throw new Error('회원탈퇴를 위한 로그인 방식을 확인할 수 없습니다. 고객센터로 문의해 주세요.');
  }

  const payload = await getReauthenticationPayload(provider);
  const { error } = await supabase.functions.invoke('delete-account', { body: payload });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  // 서버에서 auth.users를 지운 뒤에도 기기에 남은 토큰은 즉시 지운다.
  await supabase.auth.signOut({ scope: 'local' });
}

/** Edge Function의 JSON 오류를 꺼내야 운영/사용자 화면에서 실제 실패 원인을 볼 수 있다. */
async function getFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context
      .clone()
      .json()
      .catch(() => null) as { error?: unknown } | null;

    if (typeof body?.error === 'string' && body.error) {
      return body.error;
    }
  }

  return error instanceof Error && error.message
    ? error.message
    : '회원탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}

async function getReauthenticationPayload(provider: DeletionProvider): Promise<DeleteAccountPayload> {
  switch (provider) {
    case 'google': {
      // Google이 여는 시스템 계정 선택 시트의 고정 문구는 앱에서 바꿀 수 없다.
      // 직전에 목적을 분명히 안내해 다른 계정을 고르는 실수를 막는다.
      await new Promise<void>((resolve, reject) => {
        Alert.alert(
          '탈퇴할 Google 계정을 선택하세요',
          '현재 탈퇴하려는 계정과 같은 Google 계정을 선택해 주세요.',
          [
            { text: '취소', style: 'cancel', onPress: () => reject(new Error('Google 계정 재인증이 취소되었습니다.')) },
            { text: '계정 선택하기', onPress: () => resolve() },
          ],
          { cancelable: true, onDismiss: () => reject(new Error('Google 계정 재인증이 취소되었습니다.')) },
        );
      });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // 계정 선택을 다시 열어 사용자가 의도한 Google 계정으로 재인증하게 한다.
      await GoogleSignin.signOut().catch(() => undefined);
      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response) || !response.data.idToken) {
        throw new Error('Google 계정 재인증이 취소되었습니다.');
      }

      const tokens = await GoogleSignin.getTokens();
      return { provider, idToken: response.data.idToken, accessToken: tokens.accessToken };
    }

    case 'kakao': {
      const token = await login();
      if (!token.accessToken) {
        throw new Error('카카오 계정 재인증 정보를 받지 못했습니다.');
      }
      return { provider, accessToken: token.accessToken };
    }

    case 'apple': {
      if (Platform.OS !== 'ios') {
        throw new Error('Apple 계정 탈퇴는 iOS 기기에서 다시 인증해야 합니다.');
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [],
      });

      if (!credential.identityToken || !credential.authorizationCode) {
        throw new Error('Apple 계정 재인증 정보를 받지 못했습니다.');
      }

      return {
        provider,
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
      };
    }
  }
}
