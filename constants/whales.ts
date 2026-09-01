import type { ImageSourcePropType } from 'react-native';

/**
 * 고래 종류.
 *
 * 사용자가 마이페이지에서 고르고(profiles.whale_id), 친구 화면·프로필에서 그 사람을
 * 나타내는 캐릭터로 쓴다. 예전에는 프로필 편집 화면 안에만 목록이 있고 다른 화면은
 * whale1 을 하드코딩하고 있었다 — 한 곳에서만 관리한다.
 *
 * id 를 늘릴 때 DB 의 profiles_whale_id_valid 체크 제약도 같이 늘려야 한다.
 */

export type Whale = {
  id: number;
  name: string;
  /** 이 일수(고래와 함께한 날) 이상이면 잠금 해제 */
  unlockDay: number;
  image: ImageSourcePropType;
};

export const WHALES: Whale[] = [
  { id: 1, name: '아기고래', unlockDay: 0, image: require('@/assets/icons/whale1.png') },
  { id: 2, name: '울보고래', unlockDay: 30, image: require('@/assets/icons/crying_whale.png') },
  { id: 3, name: '심통고래', unlockDay: 100, image: require('@/assets/icons/angry_whale.png') },
];

export const DEFAULT_WHALE_ID = 1;

/** 잠긴 칸에 대신 그리는 이미지. */
export const LOCKED_WHALE_IMAGE: ImageSourcePropType = require('@/assets/icons/lock_whale.png');

/**
 * id 로 고래를 찾는다. 없는 id(앱보다 DB 가 앞서 있는 경우)는 기본 고래로 떨어뜨린다 —
 * 친구 화면에 빈칸이 뜨는 것보다 낫다.
 */
export function getWhale(id: number | null | undefined): Whale {
  return WHALES.find((whale) => whale.id === id) ?? WHALES[0];
}

export function getWhaleImage(id: number | null | undefined): ImageSourcePropType {
  return getWhale(id).image;
}

/** 함께한 날수로 계산한 친밀도 진행 상황. */
export type IntimacyProgress = {
  /** 지금 단계 = 해금된 고래 수 (1부터) */
  level: number;
  /** 다음 단계에 필요한 날수. 마지막 단계면 null */
  nextUnlockDay: number | null;
  /** 다음 단계까지 남은 날. 마지막 단계면 null */
  daysLeft: number | null;
  /** 이번 단계 구간의 진행률 0~1 */
  progress: number;
};

/**
 * 친밀도는 고른 고래가 아니라 '함께한 날수'로 정한다.
 *
 * 예전에는 마이페이지가 31일이라는 값을 따로 들고 있어서, 31일을 넘기면 남은 날이 계속
 * 0으로 보이고 게이지도 꽉 찬 채 멈췄다. 기준일은 WHALES 의 unlockDay 한 곳에만 둔다.
 */
export function getIntimacyProgress(days: number): IntimacyProgress {
  const unlockDays = WHALES.map((whale) => whale.unlockDay).sort((a, b) => a - b);

  const unlockedCount = unlockDays.filter((unlockDay) => days >= unlockDay).length;
  const level = Math.max(unlockedCount, 1);

  const nextUnlockDay = unlockDays.find((unlockDay) => days < unlockDay) ?? null;

  if (nextUnlockDay === null) {
    return { level, nextUnlockDay: null, daysLeft: null, progress: 1 };
  }

  // 이번 구간의 시작점. 30일에 2단계가 열렸다면 37일은 100일까지 남은 구간의 10% 지점이다.
  const currentUnlockDay = unlockDays[Math.max(unlockedCount - 1, 0)];
  const span = nextUnlockDay - currentUnlockDay;

  return {
    level,
    nextUnlockDay,
    daysLeft: Math.max(nextUnlockDay - days, 0),
    progress: span > 0 ? Math.min(Math.max((days - currentUnlockDay) / span, 0), 1) : 1,
  };
}
