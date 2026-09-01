import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/src/lib/supabase';

/**
 * 푸시 알림 등록 / 해제.
 *
 * 전송은 Expo Push Service를 거친다. 앱은 ExpoPushToken 하나만 다루고, Android는
 * FCM으로 iOS는 APNs로 Expo가 갈라서 보낸다. 그래서 이 파일에 플랫폼 분기가 거의 없다.
 *
 * 흐름
 *   로그인 성공     registerPushToken()    권한 요청 → 토큰 발급 → DB 저장
 *   알림 도착       (수신은 OS가 처리)
 *   알림 탭         usePushNotificationRouting() 이 해당 화면으로 이동
 *   로그아웃        unregisterPushToken()  이 기기 토큰만 삭제
 *
 * 주의: 실기기에서만 동작한다. 시뮬레이터·에뮬레이터는 원격 푸시 토큰을 못 받고,
 * Expo Go도 SDK 53부터 푸시를 지원하지 않으므로 개발 빌드(expo-dev-client)로 켜야 한다.
 */

// 앱이 떠 있는 동안 알림이 오면 기본적으로 아무것도 안 보인다. 배너까지 띄워 준다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    // 배지는 읽음 처리와 맞물려야 해서 지금은 건드리지 않는다. 숫자만 늘고 안 줄어드는
    // 상태가 제일 나쁘다.
    shouldSetBadge: false,
  }),
});

const ANDROID_CHANNEL_ID = 'default';

/** 알림에 실어 보내는 데이터. Edge Function이 넣는 값과 짝을 맞춰야 한다. */
export type PushPayload = {
  notificationId?: string;
  type?: string;
  postId?: string;
};

function getProjectId(): string | undefined {
  // 개발 빌드에서는 expoConfig, EAS 빌드 산출물에서는 easConfig 쪽에 들어 있다.
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/**
 * Android 알림 채널을 만든다.
 *
 * Android 8부터는 채널이 없으면 알림이 조용히 버려진다. 토큰을 받기 전에 만들어 둔다.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: '알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/**
 * 권한을 확인하고 필요하면 요청한다.
 *
 * 이미 거절한 사용자에게 다시 물어도 시스템 다이얼로그가 안 뜬다. 그래서 거절
 * 상태면 조용히 false 를 돌려주고, 설정에서 켜도록 안내하는 건 화면 쪽 몫이다.
 */
async function ensurePermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * 이 기기의 푸시 토큰을 발급받아 DB에 저장한다. 로그인 직후에 부른다.
 *
 * 실패해도 예외를 던지지 않는다 — 푸시는 부가 기능이라 여기서 터지면 로그인 흐름까지
 * 막힌다. 결과는 boolean 으로만 돌려준다.
 */
export async function registerPushToken(): Promise<boolean> {
  // iOS 시뮬레이터는 APNs 토큰을 발급받을 수 없어서 시도 자체가 무의미하다.
  // Android 에뮬레이터는 다르다 — Play 서비스가 포함된 시스템 이미지라면 FCM
  // 토큰이 정상적으로 나오므로 막지 않는다. Play 서비스가 없는 이미지면 아래
  // getExpoPushTokenAsync 가 던지고 catch 에서 걸린다.
  if (!Device.isDevice && Platform.OS === 'ios') {
    console.log('[push] iOS 시뮬레이터에서는 푸시 토큰을 받을 수 없습니다.');
    return false;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.warn('[push] EAS projectId를 찾지 못했습니다. app.json의 extra.eas.projectId를 확인하세요.');
    return false;
  }

  try {
    await ensureAndroidChannel();

    if (!(await ensurePermission())) {
      console.log('[push] 알림 권한이 거부되어 토큰을 등록하지 않습니다.');
      return false;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      p_device_name: Device.deviceName ?? null,
    });

    if (error) {
      console.warn('[push] 토큰 저장 실패', error);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[push] 토큰 등록 중 오류', error);
    return false;
  }
}

/**
 * 로그아웃 시 이 기기의 토큰만 지운다.
 *
 * 안 지우면 로그아웃한 계정의 알림이 이 기기로 계속 온다. 다른 기기의 토큰은
 * 남겨야 하므로 user_id 가 아니라 token 으로 지운다.
 *
 * 세션이 끊기기 전에 불러야 한다 — RLS가 auth.uid() 로 본인 행인지 판단한다.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!Device.isDevice && Platform.OS === 'ios') {
    return;
  }

  const projectId = getProjectId();
  if (!projectId) {
    return;
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      // 권한이 없으면 애초에 등록된 토큰도 없다. 여기서 발급을 시도하면 괜히 실패한다.
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.from('user_push_tokens').delete().eq('token', token);

    if (error) {
      console.warn('[push] 토큰 삭제 실패', error);
    }
  } catch (error) {
    console.warn('[push] 토큰 삭제 중 오류', error);
  }
}

/** 알림을 탭했을 때 실려 온 데이터를 꺼낸다. */
export function getPushPayload(response: Notifications.NotificationResponse): PushPayload {
  return (response.notification.request.content.data ?? {}) as PushPayload;
}
