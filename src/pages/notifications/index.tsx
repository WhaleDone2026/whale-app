import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkGray, FontFamily, gray, lightGray, primary, red, white } from '@/constants/theme';
import { fetchIncomingFriendRequests, respondToFriendRequest } from '@/src/services/friends';
import {
  AppNotification,
  fetchNotificationsForUserId,
  markNotificationsRead,
} from '@/src/services/notifications';
import { fetchCurrentUser, type AppUser } from '@/src/services/users';

const SECTION_LABELS: Record<AppNotification['section'], string> = {
  today: '오늘',
  last_week: '일주일 전',
};

const SECTION_ORDER: AppNotification['section'][] = ['today', 'last_week'];

function getActorName(notification: AppNotification) {
  return notification.actorName ?? '친구';
}

function getActorProfileImage(notification: AppNotification) {
  return notification.actorProfileImage;
}

function getNotificationMessageSuffix(notification: AppNotification) {
  if (notification.type === 'like') {
    return '님이 내 게시글을 좋아합니다.';
  }

  if (notification.type === 'comment') {
    return '님이 내 게시글에 댓글을 남겼습니다.';
  }

  if (notification.type === 'reply') {
    return '님이 내 댓글에 답글을 남겼습니다.';
  }

  return '님이 새 게시글을 올렸습니다.';
}

function NotificationAvatar({ notification }: { notification: AppNotification }) {
  const profileImage = getActorProfileImage(notification);

  return (
    <View style={styles.avatarWrap}>
      {profileImage ? (
        <Image source={profileImage} style={styles.avatarImage} contentFit="cover" />
      ) : (
        <View style={styles.avatarPlaceholder} />
      )}
      {notification.type === 'like' ? (
        <View style={styles.likeBadge}>
          <Ionicons name="heart" size={18} color={red} />
        </View>
      ) : null}
    </View>
  );
}

function NotificationItem({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: (postId: string) => void;
}) {
  const actorName = getActorName(notification);
  const targetPostId = notification.targetPostId;

  return (
    <Pressable
      accessibilityRole={targetPostId ? 'button' : undefined}
      // 글이 없는 알림(또는 글이 지워진 경우)까지 눌리는 것처럼 보이면, 눌러도
      // 아무 일이 없어서 고장난 것처럼 느껴진다. 눌림 효과도 같이 끈다.
      disabled={!targetPostId}
      onPress={() => targetPostId && onPress(targetPostId)}
      style={({ pressed }) => [styles.notificationItem, pressed && styles.notificationPressed]}>
      <NotificationAvatar notification={notification} />
      <View style={styles.notificationBody}>
        <Text style={styles.notificationText}>
          <Text style={styles.actorName}>{actorName}</Text>
          {getNotificationMessageSuffix(notification)}
          {notification.isNew ? <Text style={styles.newText}>  NEW</Text> : null}
        </Text>
        {notification.commentContent ? (
          <Text style={styles.commentText}>: {notification.commentContent}</Text>
        ) : null}
        <Text style={styles.timeText}>{notification.relativeTime}</Text>
      </View>
      {notification.postImage ? (
        <Image source={notification.postImage} style={styles.thumbnailImage} contentFit="cover" />
      ) : (
        <View style={styles.thumbnailPlaceholder} />
      )}
    </Pressable>
  );
}

function FriendRequestItem({
  user,
  disabled,
  onRespond,
}: {
  user: AppUser;
  disabled: boolean;
  onRespond: (accept: boolean) => void;
}) {
  return (
    <View style={styles.requestItem}>
      <Image source={user.profile_image} style={styles.requestAvatar} contentFit="cover" />
      <View style={styles.requestBody}>
        <Text style={styles.requestName} numberOfLines={1}>
          {user.name}
        </Text>
        <Text style={styles.requestTag} numberOfLines={1}>
          @{user.tag}
        </Text>
      </View>
      <View style={styles.requestActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="친구 요청 거절"
          disabled={disabled}
          onPress={() => onRespond(false)}
          style={({ pressed }) => [styles.requestButton, styles.rejectButton, pressed && styles.pressed]}>
          <Text style={[styles.requestButtonText, styles.rejectText]}>거절</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="친구 요청 수락"
          disabled={disabled}
          onPress={() => onRespond(true)}
          style={({ pressed }) => [styles.requestButton, styles.acceptButton, pressed && styles.pressed]}>
          <Text style={[styles.requestButtonText, styles.acceptText]}>수락</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [friendRequests, setFriendRequests] = useState<AppUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingRequestIds, setPendingRequestIds] = useState<Record<string, boolean>>({});
  // 처음 받아오는 동안 '알림이 없어요'가 깜빡이지 않게 로딩을 구분한다.
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetchCurrentUser()
      .then(async (user) => {
        if (!isMounted || !user) {
          return;
        }

        setCurrentUserId(user.id);

        const [nextNotifications, nextRequests] = await Promise.all([
          fetchNotificationsForUserId(user.id),
          fetchIncomingFriendRequests(user.id),
        ]);

        if (!isMounted) {
          return;
        }

        setNotifications(nextNotifications);
        setFriendRequests(nextRequests);

        // 목록을 받은 뒤에 읽음 처리한다. 먼저 하면 이번 화면에서 NEW 뱃지가 사라져서
        // 무엇이 새 알림이었는지 알 수 없다. 화면을 벗어난 뒤부터 깨끗해진다.
        void markNotificationsRead(user.id);
      })
      .catch((error) => {
        console.warn('[notifications] Failed to load notifications', error);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 글 상세 화면이 따로 없어서 피드로 보내고 그 글까지 스크롤시킨다.
  // push 가 아니라 navigate 를 쓰는 이유: push 면 홈 화면이 스택에 하나 더 쌓여서
  // 뒤로 가기를 두 번 눌러야 한다.
  const handleNotificationPress = (postId: string) => {
    router.navigate({ pathname: '/(tabs)/home', params: { postId } });
  };

  const isEmpty = friendRequests.length === 0 && notifications.length === 0;

  const handleRespond = async (requester: AppUser, accept: boolean) => {
    if (!currentUserId || pendingRequestIds[requester.id]) {
      return;
    }

    setPendingRequestIds((current) => ({ ...current, [requester.id]: true }));
    // 낙관적 업데이트: 응답한 요청을 목록에서 즉시 제거
    setFriendRequests((prev) => prev.filter((request) => request.id !== requester.id));

    try {
      await respondToFriendRequest(requester.id, currentUserId, accept);
    } catch (error) {
      console.warn('[notifications] Failed to respond to friend request', error);
      // 실패 시 목록에 복구
      setFriendRequests((prev) => [requester, ...prev]);
    } finally {
      setPendingRequestIds((current) => {
        const next = { ...current };
        delete next[requester.id];
        return next;
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={24} color={darkGray} />
        </Pressable>
        <Text style={styles.title}>알림</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, isEmpty && styles.emptyContent]}
        showsVerticalScrollIndicator={false}>
        {/* 친구 요청도 알림도 없을 때. 로딩 중에는 문구 대신 스피너를 둔다 */}
        {isEmpty ? (
          <View style={styles.emptyBox}>
            {isLoading ? (
              <ActivityIndicator color={gray} />
            ) : (
              <>
                <Text style={styles.emptyTitle}>아직 알림이 없어요</Text>
                <Text style={styles.emptyText}>
                  친구들이 남긴 좋아요와 댓글이 여기에 모여요.
                </Text>
              </>
            )}
          </View>
        ) : null}

        {friendRequests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>친구 요청</Text>
            <View style={styles.requestList}>
              {friendRequests.map((request) => (
                <FriendRequestItem
                  key={request.id}
                  user={request}
                  disabled={Boolean(pendingRequestIds[request.id])}
                  onRespond={(accept) => handleRespond(request, accept)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {SECTION_ORDER.map((section) => {
          const sectionNotifications = notifications.filter((notification) => notification.section === section);

          if (sectionNotifications.length === 0) {
            return null;
          }

          return (
            <View key={section} style={styles.section}>
              <Text style={styles.sectionTitle}>{SECTION_LABELS[section]}</Text>
              <View style={styles.sectionList}>
                {sectionNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onPress={handleNotificationPress}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: white,
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: white,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  headerSpacer: {
    width: 44,
  },
  screen: {
    flex: 1,
    backgroundColor: white,
  },
  content: {
    paddingBottom: 96,
  },
  // 빈 화면일 때만 세로 가운데로. 목록이 있을 때 쓰면 짧은 목록이 가운데로 몰린다.
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  emptyTitle: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  emptyText: {
    marginTop: 6,
    textAlign: 'center',
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    paddingTop: 16,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    color: '#000000',
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 20,
  },
  sectionList: {
    marginTop: 10,
  },
  requestList: {
    marginTop: 12,
    gap: 6,
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  requestAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: lightGray,
  },
  requestBody: {
    flex: 1,
    paddingRight: 12,
    minWidth: 0,
  },
  requestName: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  requestTag: {
    marginTop: 2,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestButton: {
    minWidth: 60,
    height: 36,
    paddingHorizontal: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    backgroundColor: lightGray,
  },
  acceptButton: {
    backgroundColor: primary,
  },
  requestButtonText: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  rejectText: {
    color: darkGray,
  },
  acceptText: {
    color: white,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: lightGray,
  },
  notificationPressed: {
    backgroundColor: lightGray,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 24,
    backgroundColor: lightGray,
  },
  likeBadge: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    width: 24,
    height: 24,
  },
  notificationBody: {
    flex: 1,
    paddingRight: 12,
  },
  notificationText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  actorName: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 16,
  },
  newText: {
    color: primary,
    fontFamily: FontFamily.pretendardSemiBold,
  },
  commentText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  timeText: {
    marginTop: 4,
    color: gray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  thumbnailPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#D9D9D9',
  },
  thumbnailImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  pressed: {
    opacity: 0.7,
  },
});
