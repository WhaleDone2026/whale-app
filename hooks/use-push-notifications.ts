import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { supabase } from '@/src/lib/supabase';
import { registerPushToken } from '@/src/services/push';

/**
 * 로그인 상태에 맞춰 푸시 토큰을 등록하고, 알림 탭을 화면 이동으로 연결한다.
 *
 * 루트 레이아웃에서 한 번만 부른다.
 *
 * 로그아웃 시의 토큰 삭제는 여기서 하지 않는다 — SIGNED_OUT 이벤트가 올 땐 세션이
 * 이미 끊겨서 RLS 때문에 삭제가 실패한다. signOutUser() 안에서 signOut 직전에 지운다.
 */
export function usePushNotifications(): void {
  // TOKEN_REFRESHED 는 한 시간에도 여러 번 온다. 같은 사용자로 반복 등록하지 않도록
  // 이미 처리한 user_id 를 기억해 둔다.
  const registeredUserId = useRef<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;

      if (!userId) {
        registeredUserId.current = null;
        return;
      }

      if (registeredUserId.current === userId) {
        return;
      }

      registeredUserId.current = userId;
      void registerPushToken();
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // 알림을 탭하면 알림 목록으로 보낸다. 게시글 상세 라우트가 따로 없어서, 지금은
    // 목록에서 해당 글로 들어가는 게 가장 짧은 경로다.
    const goToNotifications = () => {
      router.push('/(tabs)/home/notifications');
    };

    // 앱이 꺼져 있을 때 알림을 탭해서 실행된 경우. 리스너는 이 응답을 받지 못한다.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        goToNotifications();
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(goToNotifications);
    return () => subscription.remove();
  }, []);
}
