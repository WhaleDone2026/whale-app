import { useEffect, useState } from 'react';

import { supabase } from '@/src/lib/supabase';

/**
 * 로그인한 사용자의 id.
 *
 * FriendsProvider 는 home 탭에만 걸려 있어서 useFriends 의 currentUserId 를 쓰면
 * 보관함·프로필 탭에서 터진다. 어느 화면에서나 안전하게 쓰려고 별도 훅으로 둔다.
 *
 * 목록 아이템마다 호출될 수 있으므로 조회를 한 번만 하고 결과를 공유한다.
 * (로그인·로그아웃은 onAuthStateChange 로 따라간다)
 */
let cachedUserId: string | null | undefined;
let inFlight: Promise<string | null> | null = null;

function loadUserId(): Promise<string | null> {
  if (cachedUserId !== undefined) {
    return Promise.resolve(cachedUserId);
  }

  inFlight ??= supabase.auth
    .getUser()
    .then(({ data }) => {
      cachedUserId = data.user?.id ?? null;
      return cachedUserId;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id ?? null;
});

export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(cachedUserId ?? null);

  useEffect(() => {
    let isMounted = true;

    void loadUserId().then((id) => {
      if (isMounted) {
        setUserId(id);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUserId(session?.user?.id ?? null);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return userId;
}
