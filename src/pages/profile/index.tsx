import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { PencilIcon } from '@/components/icons/pencil-icon';
import { SmallWhaleIcon } from '@/components/icons/small-whale-icon';
import { NotificationBellIcon } from '@/components/notification-bell-icon';
import { DEFAULT_WHALE_ID, getIntimacyProgress, getWhaleImage } from '@/constants/whales';
import { background, darkGray, FontFamily, gray, lightGray, primary, white } from '@/constants/theme';
import { useUnseenNotifications } from '@/hooks/use-unseen-notifications';
import { fetchAcceptedFriendIds } from '@/src/services/friends';
import { signOutUser } from '@/src/services/onboarding';
import { AppUser, fetchCurrentUser, saveCoverImage } from '@/src/services/users';

const friendsCheerImage = require('../../../assets/icons/friends_cheer.png');
const emptyProfile: AppUser = {
  id: '',
  name: '',
  tag: '',
  profile_image: require('../../../assets/icons/test.png'),
  cover_image_url: null,
  description: '',
  installed_at: new Date().toISOString(),
  intimacy_level: 1,
  whale_id: DEFAULT_WHALE_ID,
  friends_count: 0,
  like_count: 0,
  post_count: 0,
};
// 다음 단계까지 며칠 남았는지는 WHALES 의 unlockDay 로 계산한다. 예전에는 여기에 31 이
// 박혀 있어서 31일을 넘기면 '0일 남았어요'가 계속 떴다(3단계 기준은 100일이다).
const COVER_BODY_HEIGHT = 150;

function getInstalledDays(installedAt: string) {
  const installedDate = new Date(installedAt);
  const today = new Date();
  const diffTime = today.getTime() - installedDate.getTime();

  return Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
}

function ProgressGauge({ days }: { days: number }) {
  const { daysLeft, progress } = getIntimacyProgress(days);
  const endAngle = -180 + 180 * progress;
  const radius = 50;
  const centerX = 70;
  const centerY = 54;
  const inactivePath = createArcPath(centerX, centerY, radius, -180, 0);
  const activePath = createArcPath(centerX, centerY, radius, -180, endAngle);

  return (
    <View style={styles.gaugeWrap}>
      <Svg width={180} height={130} viewBox="0 0 145 92">
        <Path d={inactivePath} stroke="#E8ECEE" strokeWidth={5} strokeLinecap="round" fill="none" />
        <Path d={activePath} stroke={primary} strokeWidth={5} strokeLinecap="round" fill="none" />
      </Svg>
      <View style={styles.gaugeTextWrap}>
        <Text style={styles.gaugeValue}>{days}</Text>
        <Text style={styles.gaugeUnit}>일</Text>
      </View>
      <Text style={styles.gaugeHint}>
        {daysLeft === null
          ? '마지막 고래까지 만났어요!'
          : `다음 친밀도까지 ${daysLeft}일 남았어요!`}
      </Text>
    </View>
  );
}

function createArcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function StatCard({
  icon,
  title,
  value,
  unit,
}: {
  icon: ReactNode;
  title: string;
  value: number;
  unit: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTitleRow}>
        {icon}
        <Text style={styles.statTitle}>{title}</Text>
      </View>
      <View style={styles.statValueRow}>
        <Text style={styles.statNumber}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
    </View>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const hasUnseen = useUnseenNotifications();
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState<AppUser>(emptyProfile);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  // 방금 고른 커버(로컬 미리보기). 저장 성공 시 currentUser.cover_image_url 로 대체된다.
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isSavingCover, setIsSavingCover] = useState(false);
  const installedDays = getInstalledDays(currentUser.installed_at);
  // 단계는 고른 고래가 아니라 함께한 날수로 정한다. 고래를 바꿔도 단계는 그대로다.
  const intimacyLevel = getIntimacyProgress(installedDays).level;
  const coverImageUri = coverPreview ?? currentUser.cover_image_url ?? null;

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      fetchCurrentUser()
        .then((user) => {
          if (!isMounted || !user) {
            return;
          }

          setCurrentUser(user);

          fetchAcceptedFriendIds(user.id)
            .then((ids) => {
              if (isMounted) {
                setFriendsCount(ids.length);
              }
            })
            .catch((error) => {
              console.warn('[profile] Failed to load friends count', error);
            });
        })
        .catch((error) => {
          console.warn('[profile] Failed to load user', error);
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }, []),
  );

  const handlePickCover = useCallback(async () => {
    if (!currentUser.id || isSavingCover) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const localUri = result.assets[0].uri;
    const previous = coverPreview;
    setCoverPreview(localUri); // 즉시 미리보기
    setIsSavingCover(true);

    try {
      const savedUrl = await saveCoverImage(currentUser.id, localUri);
      setCurrentUser((prev) => ({ ...prev, cover_image_url: savedUrl }));
      setCoverPreview(savedUrl);
    } catch (error) {
      console.warn('[profile] Failed to save cover image', error);
      setCoverPreview(previous); // 실패 시 이전 상태로 롤백
      Alert.alert('저장 실패', '커버 이미지를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setIsSavingCover(false);
    }
  }, [coverPreview, currentUser.id, isSavingCover]);

  const handleOpenFriendList = () => {
    if (!currentUser.id) {
      return;
    }

    router.push({
      pathname: '/(tabs)/profile/friend-list',
      params: {
        userId: currentUser.id,
        name: currentUser.name,
        count: String(friendsCount ?? ''),
      },
    });
  };

  const handleLogout = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOutUser();
      router.replace('/');
    } catch (error) {
      console.warn('[profile] Failed to sign out', error);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={gray} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="배경 사진 변경"
          onPress={handlePickCover}
          disabled={isSavingCover}
          style={[styles.cover, { height: insets.top + COVER_BODY_HEIGHT }]}>
          {coverImageUri ? (
            <Image source={{ uri: coverImageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.coverEmpty]} />
          )}
          {isSavingCover ? (
            <View style={[StyleSheet.absoluteFill, styles.coverLoading]}>
              <ActivityIndicator size="large" color={white} />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.profileSection}>
          <View style={styles.avatarWrap}>
            <Image source={currentUser.profile_image} style={styles.avatar} contentFit="cover" />
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {currentUser.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="프로필 편집"
              hitSlop={8}
              onPress={() => router.push('/(tabs)/profile/edit')}
              style={({ pressed }) => pressed && styles.pressed}>
              <PencilIcon size={15} color={darkGray} />
            </Pressable>
          </View>
          <Text style={styles.tag} numberOfLines={1}>
            @{currentUser.tag}
          </Text>
          {currentUser.description ? (
            <Text style={styles.description}>{currentUser.description}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="친구 목록 보기"
            onPress={handleOpenFriendList}
            hitSlop={6}
            style={({ pressed }) => [styles.friendsRow, pressed && styles.pressed]}>
            <Text style={styles.friendsLabel}>친구</Text>
            <Text style={styles.friendsCount}>{friendsCount ?? currentUser.friends_count ?? 0}</Text>
          </Pressable>
        </View>

        <View style={styles.streakSection}>
          <Text style={styles.sectionTitle}>Streaks</Text>
          <View style={styles.mainStreakCard}>
            <View style={styles.cardTitleRow}>
              <SmallWhaleIcon size={16} color={darkGray} />
              <Text style={styles.mainCardTitle}>고래와 함께한지</Text>
            </View>
            <View style={styles.mainStreakBody}>
              <View style={styles.whaleLevel}>
                <Image
                  source={getWhaleImage(currentUser.whale_id)}
                  style={styles.whaleImage}
                  contentFit="contain"
                />
                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 10}} >
                  <Text style={styles.levelText}>친밀도</Text>
                  <Text style={styles.levelValue}>{intimacyLevel}단계</Text>
                </View>
              </View>
              <ProgressGauge days={installedDays} />
            </View>
          </View>

          <View style={styles.statGrid}>
            <StatCard
              icon={<PencilIcon size={13} color={darkGray} />}
              title="작성한 일기 수"
              value={currentUser.post_count}
              unit="개"
            />
            <StatCard
              icon={<Image source={friendsCheerImage} style={styles.friendsCheerIcon} contentFit="contain" />}
              title="친구 응원 수"
              value={currentUser.like_count}
              unit="번"
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="로그아웃"
          disabled={isSigningOut}
          onPress={handleLogout}
          style={({ pressed }) => [styles.logoutButton, (pressed || isSigningOut) && styles.logoutPressed]}>
          <Text style={styles.logoutText}>{isSigningOut ? '로그아웃 중...' : '로그아웃'}</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.topIcons, { top: insets.top + 4 }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="알림"
          onPress={() => router.push('/(tabs)/profile/notifications')}
          style={({ pressed }) => [styles.iconHit, pressed && styles.iconPressed]}>
          <NotificationBellIcon hasUnseen={hasUnseen} color={darkGray} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="설정"
          onPress={() => router.push('/(tabs)/profile/settings')}
          style={({ pressed }) => [styles.iconHit, pressed && styles.iconPressed]}>
          <Ionicons name="settings-outline" size={22} color={darkGray} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingBottom: 80,
  },
  cover: {
    width: '100%',
  },
  coverEmpty: {
    backgroundColor: lightGray,
  },
  coverLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  topIcons: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconHit: {
    padding: 4,
  },
  iconPressed: {
    opacity: 0.7,
  },
  profileSection: {
    backgroundColor: background,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  avatarWrap: {
    marginTop: -46,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    borderColor: white,
    backgroundColor: white,
  },
  nameRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: '#000000',
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 20,
    lineHeight: 24,
  },
  tag: {
    marginTop: 4,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 16,
  },
  description: {
    marginTop: 12,
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 20,
  },
  friendsRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  friendsLabel: {
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 18,
  },
  friendsCount: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.6,
  },
  streakSection: {
    backgroundColor: background,
    paddingTop: 24,
    paddingHorizontal: 30,
    borderTopColor: '#E8ECEE',
    borderTopWidth: 2,
  },
  sectionTitle: {
    color: darkGray,
    fontFamily: FontFamily.pretendardBold,
    fontSize: 20,
    lineHeight: 24,
  },
  mainStreakCard: {
    marginTop: 30,
    borderRadius: 10,
    backgroundColor: white,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
    shadowColor: '#3C4446',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mainCardTitle: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  mainStreakBody: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  whaleLevel: {
    width: 124,
    alignItems: 'center',
  },
  whaleImage: {
    marginTop: 10,
    width: 86,
    height: 56,
  },
  levelText: {
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 10,
  },
  levelValue: {
    marginLeft: 4,
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 11,
  },
  gaugeWrap: {
    width: 164,
    alignItems: 'center',
  },
  gaugeTextWrap: {
    position: 'absolute',
    top: 30,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  gaugeValue: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 38,
    lineHeight: 42,
  },
  gaugeUnit: {
    marginBottom: 6,
    marginLeft: 4,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 12,
  },
  gaugeHint: {
    marginTop: -60,
    color: '#777777',
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 9,
  },
  statGrid: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 22,
  },
  statCard: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: white,
    paddingTop: 16,
    paddingHorizontal: 18,
    shadowColor: '#3C4446',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statTitle: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  friendsCheerIcon: {
    width: 14,
    height: 14,
  },
  statValueRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40
  },
  statNumber: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 36,
    lineHeight: 46,
  },
  statUnit: {
    marginLeft: 4,
    marginTop: 16,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 12,
  },
  logoutButton: {
    marginTop: 32,
    marginHorizontal: 30,
    marginBottom: 24,
    height: 47,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: gray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: white,
  },
  logoutPressed: {
    opacity: 0.7,
  },
  logoutText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
});
