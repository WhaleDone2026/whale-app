import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams, useSegments } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmModal } from "@/components/confirm-modal";
import {
  background,
  darkGray,
  FontFamily,
  gray,
  lightGray,
  primary,
  red,
  white,
} from "@/constants/theme";
import { supabase } from "@/src/lib/supabase";
import { blockUser } from "@/src/services/blocks";
import {
  cancelFriendRequest,
  fetchAcceptedFriendsForUser,
  fetchRelationStatuses,
  sendFriendRequest,
  type FriendRelationStatus,
} from "@/src/services/friends";
import type { AppUser } from "@/src/services/users";

const cryingWhaleImage = require("../../../assets/icons/crying_whale.png");

type RowMenu = { userId: string; top: number; right: number };
type ConfirmTarget = { userId: string; action: "block" };

export default function FriendListPage() {
  const params = useLocalSearchParams<{
    userId: string;
    name?: string;
    count?: string;
  }>();
  const segments = useSegments();
  // 현재 어느 탭 스택에서 열렸는지 판단해, 같은 탭 안에서 이동(뒤로가기 스택 유지)한다.
  const tab = (segments as string[]).includes("profile") ? "profile" : "home";

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<AppUser[]>([]);
  const [statuses, setStatuses] = useState<
    Record<string, FriendRelationStatus>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<RowMenu | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(
    null,
  );
  const [isConfirmPending, setIsConfirmPending] = useState(false);
  const menuButtonRefs = useRef<Record<string, View | null>>({});

  const initialCount = params.count ? Number(params.count) : null;
  const count =
    isLoading && initialCount != null ? initialCount : friends.length;

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setCurrentUserId(data.user?.id ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const userId = params.userId;
    if (!userId) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    fetchAcceptedFriendsForUser(userId)
      .then(async (nextFriends) => {
        if (!isMounted) {
          return;
        }

        setFriends(nextFriends);

        // 목록의 각 사용자에 대한 '나' 기준 관계 상태(친구/요청됨/요청받음/없음)를 조회한다.
        if (currentUserId) {
          const relation = await fetchRelationStatuses(
            currentUserId,
            nextFriends.map((friend) => friend.id),
          );
          if (isMounted) {
            setStatuses(relation);
          }
        }
      })
      .catch((error) => {
        console.warn("[friend-list] Failed to load friends", error);
        if (isMounted) {
          setFriends([]);
          setStatuses({});
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [params.userId, currentUserId]);

  const handleAdd = useCallback(
    async (userId: string) => {
      if (!currentUserId || pendingIds[userId]) {
        return;
      }

      setPendingIds((current) => ({ ...current, [userId]: true }));
      setStatuses((current) => ({ ...current, [userId]: "requested" }));

      try {
        await sendFriendRequest(currentUserId, userId);
      } catch (error) {
        console.warn("[friend-list] Failed to send request", error);
        setStatuses((current) => ({ ...current, [userId]: "none" }));
      } finally {
        setPendingIds((current) => {
          const next = { ...current };
          delete next[userId];
          return next;
        });
      }
    },
    [currentUserId, pendingIds],
  );

  const handleCancelRequest = useCallback(
    async (userId: string) => {
      if (!currentUserId || pendingIds[userId]) {
        return;
      }

      setPendingIds((current) => ({ ...current, [userId]: true }));
      // 낙관적 업데이트: 버튼을 즉시 '추가' 가능 상태로 되돌린다.
      setStatuses((current) => ({ ...current, [userId]: "none" }));

      try {
        await cancelFriendRequest(currentUserId, userId);
      } catch (error) {
        console.warn("[friend-list] Failed to cancel request", error);
        setStatuses((current) => ({ ...current, [userId]: "requested" }));
      } finally {
        setPendingIds((current) => {
          const next = { ...current };
          delete next[userId];
          return next;
        });
      }
    },
    [currentUserId, pendingIds],
  );

  const handleVisit = useCallback(
    (friend: AppUser) => {
      router.push({
        pathname:
          tab === "profile" ? "/(tabs)/profile/friend" : "/(tabs)/home/friend",
        params: {
          userId: friend.id,
          name: friend.name,
          tag: friend.tag,
          description: friend.description,
        },
      });
    },
    [tab],
  );

  const openMenu = useCallback((userId: string) => {
    const node = menuButtonRefs.current[userId];
    if (!node) {
      return;
    }

    node.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get("window").width;
      setMenu({
        userId,
        top: y + height + 4,
        right: screenWidth - (x + width),
      });
    });
  }, []);

  const handleBlock = (userId: string) => {
    setMenu(null);
    setConfirmTarget({ userId, action: "block" });
  };

  // 사유 선택은 별도 화면에서 받는다.
  const handleReport = (userId: string) => {
    setMenu(null);
    router.push({
      pathname: "/report",
      params: {
        targetType: "user",
        targetId: userId,
        targetName: friends.find((friend) => friend.id === userId)?.name ?? "",
      },
    });
  };

  const confirmBlock = async (userId: string) => {
    setIsConfirmPending(true);
    try {
      await blockUser(userId);
      setConfirmTarget(null);
      // 내 친구 목록을 보고 있을 때만 즉시 제거한다. 남의 친구 목록에서는
      // 차단해도 그 사람의 친구인 건 그대로이므로 목록을 건드리지 않는다.
      if (params.userId === currentUserId) {
        setFriends((prev) => prev.filter((friend) => friend.id !== userId));
      }
    } catch (error) {
      setConfirmTarget(null);
      Alert.alert(
        error instanceof Error ? error.message : "차단하지 못했습니다.",
      );
    } finally {
      setIsConfirmPending(false);
    }
  };

  const renderItem: ListRenderItem<AppUser> = ({ item }) => {
    const isSelf = currentUserId != null && currentUserId === item.id;
    const status = statuses[item.id] ?? "none";

    return (
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.name} 프로필 보기`}
          onPress={() => handleVisit(item)}
          style={({ pressed }) => [styles.rowLeft, pressed && styles.pressed]}
        >
          <Image
            source={item.profile_image}
            style={styles.avatar}
            contentFit="cover"
          />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.tag} numberOfLines={1}>
              @{item.tag}
            </Text>
          </View>
        </Pressable>

        {isSelf ? null : (
          <ActionButton
            status={status}
            onAdd={() => handleAdd(item.id)}
            onCancel={() => handleCancelRequest(item.id)}
          />
        )}

        {isSelf ? null : (
          <View
            ref={(node) => {
              menuButtonRefs.current[item.id] = node;
            }}
            collapsable={false}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="더보기"
              hitSlop={8}
              onPress={() =>
                menu?.userId === item.id ? setMenu(null) : openMenu(item.id)
              }
              style={({ pressed }) => [
                styles.moreButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={gray} />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
            hitSlop={10}
            onPress={() => router.back()}
            style={styles.headerSide}
          >
            <Ionicons name="chevron-back" size={26} color={darkGray} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            친구 목록
          </Text>
          <View style={styles.headerSide} />
        </View>

        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={<Text style={styles.countLabel}>{count}명</Text>}
          contentContainerStyle={styles.listContent}
          scrollEnabled={menu === null}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              {isLoading ? (
                <ActivityIndicator color={gray} />
              ) : (
                <Text style={styles.emptyText}>아직 친구가 없어요.</Text>
              )}
            </View>
          }
        />
      </SafeAreaView>

      {menu ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="메뉴 닫기"
            style={styles.menuBackdrop}
            onPress={() => setMenu(null)}
          />
          <View style={[styles.menu, { top: menu.top, right: menu.right }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => handleBlock(menu.userId)}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text style={styles.menuText}>차단</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => handleReport(menu.userId)}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text style={[styles.menuText, styles.menuTextDanger]}>신고</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <ConfirmModal
        visible={confirmTarget?.action === "block"}
        title={`친구 관계를 정말 해제하시겠습니까?`}
        message="해제 후에는 서로의 게시글을 볼 수 없어요."
        confirmLabel="해제"
        image={cryingWhaleImage}
        destructive
        isPending={isConfirmPending}
        onConfirm={() => confirmTarget && confirmBlock(confirmTarget.userId)}
        onCancel={() => setConfirmTarget(null)}
      />
    </View>
  );
}

function ActionButton({
  status,
  onAdd,
  onCancel,
}: {
  status: FriendRelationStatus;
  onAdd: () => void;
  onCancel: () => void;
}) {
  if (status === "friend") {
    return (
      <View style={[styles.actionButton, styles.friendButton]}>
        <Text style={[styles.actionText, styles.friendText]}>친구</Text>
      </View>
    );
  }

  if (status === "requested") {
    // '요청됨' 상태에서 한 번 더 누르면 보낸 친구 요청을 취소한다.
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="친구 요청 취소"
        onPress={onCancel}
        style={({ pressed }) => [
          styles.actionButton,
          styles.requestedButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.actionText, styles.requestedText]}>요청됨</Text>
      </Pressable>
    );
  }

  if (status === "incoming") {
    return (
      <View style={[styles.actionButton, styles.requestedButton]}>
        <Text style={[styles.actionText, styles.requestedText]}>요청받음</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="친구 추가"
      onPress={onAdd}
      style={({ pressed }) => [
        styles.actionButton,
        styles.addButton,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, styles.addText]}>추가</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: white,
  },
  safeArea: {
    flex: 1,
    backgroundColor: white,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerSide: {
    width: 40,
    alignItems: "flex-start",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  countLabel: {
    paddingTop: 8,
    paddingBottom: 12,
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  rowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: lightGray,
  },
  info: {
    flex: 1,
    marginLeft: 14,
    minWidth: 0,
  },
  name: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  tag: {
    marginTop: 2,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 16,
  },
  actionButton: {
    minWidth: 72,
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  actionText: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 14,
    lineHeight: 16,
  },
  addButton: {
    backgroundColor: primary,
  },
  addText: {
    color: white,
  },
  friendButton: {
    backgroundColor: white,
    borderWidth: 1,
    borderColor: primary,
  },
  friendText: {
    color: primary,
  },
  requestedButton: {
    backgroundColor: lightGray,
  },
  requestedText: {
    color: darkGray,
  },
  moreButton: {
    width: 28,
    height: 34,
    marginLeft: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  menu: {
    position: "absolute",
    minWidth: 104,
    backgroundColor: white,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 21,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 6,
    alignItems: "center",
  },
  menuItemPressed: {
    backgroundColor: background,
  },
  menuText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  menuTextDanger: {
    color: red,
  },
  emptyBox: {
    paddingTop: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.6,
  },
});
