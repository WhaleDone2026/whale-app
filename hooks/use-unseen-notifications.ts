import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/src/lib/supabase';
import { hasUnseenNotifications } from '@/src/services/notifications';

/**
 * 알림 아이콘의 레드닷 표시 여부.
 *
 * 세 시점에 다시 확인한다.
 *   화면 포커스  — 알림 화면에서 돌아오면 점이 사라져야 한다
 *   푸시 수신    — 앱을 켜둔 채로 알림이 오면 점이 바로 켜져야 한다
 *   로그인 변경  — 계정이 바뀌면 이전 사용자의 상태가 남으면 안 된다
 */
export function useUnseenNotifications(): boolean {
  const [hasUnseen, setHasUnseen] = useState(false);

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setHasUnseen(false);
      return;
    }

    setHasUnseen(await hasUnseenNotifications(user.id));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    // 포그라운드에서 푸시를 받은 경우. 서버에는 이미 행이 들어가 있으므로 다시 세면 된다.
    const received = Notifications.addNotificationReceivedListener(() => {
      void refresh();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      received.remove();
      subscription.unsubscribe();
    };
  }, [refresh]);

  return hasUnseen;
}
