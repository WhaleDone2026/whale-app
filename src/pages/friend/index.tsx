import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmModal } from "@/components/confirm-modal";
import {
  background,
  darkGray,
  FontFamily,
  gray,
  lightGray,
  red,
  white,
} from "@/constants/theme";
import { supabase } from "@/src/lib/supabase";
import { FeedPostCard } from "@/src/pages/feed/post-card";
import { blockUser } from "@/src/services/blocks";
import { fetchAcceptedFriendIds } from "@/src/services/friends";
import {
  fetchUserPostsByCategory,
  type PostSortOrder,
} from "@/src/services/posts";
import {
  fetchUserById,
  saveCoverImage,
  type AppUser,
} from "@/src/services/users";
import type { FeedPost } from "@/src/types/api/feed-post";

const cryingWhaleImage = require("../../../assets/icons/crying_whale.png");

const SORT_LABELS: Record<PostSortOrder, string> = {
  latest: "최신순",
  oldest: "오래된순",
};

const COVER_BODY_HEIGHT = 150;

export default function FriendProfilePage() {
  const params = useLocalSearchParams<{
    userId: string;
    name?: string;
    tag?: string;
    description?: string;
  }>();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  // 어느 탭 스택에서 열렸는지 판단해, 같은 탭 안에서 이동(뒤로가기 스택 유지)한다.
  const tab = (segments as string[]).includes("profile") ? "profile" : "home";

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [sortOrder, setSortOrder] = useState<PostSortOrder>("latest");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [sortMenuPosition, setSortMenuPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const sortButtonRef = useRef<View | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const moreButtonRef = useRef<View | null>(null);
  const [confirmAction, setConfirmAction] = useState<"block" | null>(
    null,
  );
  const [isConfirmPending, setIsConfirmPending] = useState(false);
  // 방금 고른 커버(로컬 미리보기). 저장 성공 시 user.cover_image_url 로 대체된다.
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isSavingCover, setIsSavingCover] = useState(false);

  // 내 페이지일 때만 커버를 편집할 수 있고, 친구가 보면 저장된 커버를 읽기 전용으로 본다.
  const isOwnProfile = currentUserId != null && currentUserId === params.userId;
  const coverImageUri = coverPreview ?? user?.cover_image_url ?? null;

  // 이름/아이디/소개는 파라미터로 먼저 그려 즉시 표시하고, 상세 데이터는 아래에서 보강한다.
  const displayName = user?.name ?? params.name ?? "";
  const displayTag = user?.tag ?? params.tag ?? "";
  const displayDescription = user?.description ?? params.description ?? "";

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

    fetchUserById(userId)
      .then((nextUser) => {
        if (isMounted && nextUser) {
          setUser(nextUser);
        }
      })
      .catch((error) => {
        console.warn("[friend] Failed to load user", error);
      });

    fetchAcceptedFriendIds(userId)
      .then((ids) => {
        if (isMounted) {
          setFriendsCount(ids.length);
        }
      })
      .catch((error) => {
        console.warn("[friend] Failed to load friends count", error);
      });

    return () => {
      isMounted = false;
    };
  }, [params.userId]);

  useEffect(() => {
    const userId = params.userId;
    if (!userId) {
      return;
    }

    let isMounted = true;
    setIsLoadingPosts(true);

    fetchUserPostsByCategory(userId, "all", "전체", sortOrder)
      .then((nextPosts) => {
        if (isMounted) {
          setPosts(nextPosts);
        }
      })
      .catch((error) => {
        console.warn("[friend] Failed to load posts", error);
        if (isMounted) {
          setPosts([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingPosts(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [params.userId, sortOrder]);

  const handlePickCover = useCallback(async () => {
    // 내 페이지가 아니면 커버는 읽기 전용이다.
    if (!isOwnProfile || !currentUserId || isSavingCover) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
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
      const savedUrl = await saveCoverImage(currentUserId, localUri);
      // 저장된 공개 URL 로 확정 (친구가 볼 때도 이 URL 로 표시된다).
      setUser((prev) => (prev ? { ...prev, cover_image_url: savedUrl } : prev));
      setCoverPreview(savedUrl);
    } catch (error) {
      console.warn("[friend] Failed to save cover image", error);
      setCoverPreview(previous); // 실패 시 이전 상태로 롤백
      Alert.alert(
        "저장 실패",
        "커버 이미지를 저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setIsSavingCover(false);
    }
  }, [coverPreview, currentUserId, isOwnProfile, isSavingCover]);

  const handleSelectSort = (nextSort: PostSortOrder) => {
    setSortOrder(nextSort);
    setIsSortMenuOpen(false);
  };

  // 버튼 위치를 재서 화면 좌표에 드롭다운을 띄운다.
  const toggleSortMenu = () => {
    if (isSortMenuOpen) {
      setIsSortMenuOpen(false);
      return;
    }

    sortButtonRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get("window").width;
      setSortMenuPosition({
        top: y + height + 6,
        right: screenWidth - (x + width),
      });
      setIsSortMenuOpen(true);
    });
  };

  // 더보기(⋮)도 정렬 메뉴와 같은 이유로 화면 좌표에 띄운다 — 리스트 헤더 안에 두면 잘린다.
  const toggleMoreMenu = () => {
    if (isMoreMenuOpen) {
      setIsMoreMenuOpen(false);
      return;
    }

    moreButtonRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get("window").width;
      setMoreMenuPosition({
        top: y + height + 6,
        right: screenWidth - (x + width),
      });
      setIsMoreMenuOpen(true);
    });
  };

  const handleBlock = async () => {
    if (!params.userId || isConfirmPending) {
      return;
    }

    setIsConfirmPending(true);
    try {
      await blockUser(params.userId);
      setConfirmAction(null);
      // 차단하면 이 사람 프로필은 더 이상 볼 수 없으므로 이전 화면으로 돌아간다.
      router.back();
    } catch (error) {
      setConfirmAction(null);
      Alert.alert(
        error instanceof Error ? error.message : "차단하지 못했습니다.",
      );
    } finally {
      setIsConfirmPending(false);
    }
  };

  // 사유 선택은 별도 화면에서 받는다.
  const handleReport = () => {
    if (!params.userId) {
      return;
    }

    setIsMoreMenuOpen(false);
    router.push({
      pathname: "/report",
      params: {
        targetType: "user",
        targetId: params.userId,
        targetName: displayName,
      },
    });
  };

  const renderItem: ListRenderItem<FeedPost> = ({ item }) => (
    <FeedPostCard post={item} />
  );

  const listHeader = (
    <View>
      <Pressable
        accessibilityRole={isOwnProfile ? "button" : "image"}
        accessibilityLabel={isOwnProfile ? "배경 사진 변경" : "배경 사진"}
        onPress={handlePickCover}
        disabled={!isOwnProfile || isSavingCover}
        style={[styles.cover, { height: insets.top + COVER_BODY_HEIGHT }]}
      >
        {coverImageUri ? (
          <Image
            source={{ uri: coverImageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
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
        <View style={styles.profileTopRow}>
          <View style={styles.avatarWrap}>
            {user ? (
              <Image
                source={user.profile_image}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
          </View>
          {/* 내 프로필에서는 나를 차단·신고할 일이 없으니 감춘다. */}
          {isOwnProfile ? null : (
            <View ref={moreButtonRef} collapsable={false}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="더보기"
                hitSlop={10}
                onPress={toggleMoreMenu}
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

        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.tag} numberOfLines={1}>
          @{displayTag}
        </Text>
        {displayDescription ? (
          <Text style={styles.description}>{displayDescription}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="친구 목록 보기"
          onPress={() =>
            router.push({
              pathname:
                tab === "profile"
                  ? "/(tabs)/profile/friend-list"
                  : "/(tabs)/home/friend-list",
              params: {
                userId: params.userId,
                name: displayName,
                count: String(friendsCount ?? user?.friends_count ?? ""),
              },
            })
          }
          hitSlop={6}
          style={({ pressed }) => [
            styles.friendsRow,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.friendsLabel}>친구</Text>
          <Text style={styles.friendsCount}>
            {friendsCount ?? user?.friends_count ?? 0}
          </Text>
        </Pressable>
      </View>

      {/* 드롭다운은 여기서 그리지 않는다 — 리스트 헤더 안에 두면 목록에 가리거나
          안드로이드에서 잘려 안 보인다. 화면 최상단에 따로 띄운다(아래 참고). */}
      <View style={styles.sortRow}>
        <View ref={sortButtonRef} collapsable={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="정렬 변경"
            onPress={toggleSortMenu}
            style={styles.sortButton}
          >
            <Text style={styles.sortLabel}>{SORT_LABELS[sortOrder]}</Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={"#777777"}
              style={isSortMenuOpen ? styles.chevronOpen : undefined}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const listEmpty = isLoadingPosts ? (
    <View style={styles.emptyBox}>
      <ActivityIndicator color={gray} />
    </View>
  ) : (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>아직 작성한 피드가 없어요.</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.listContent}
        scrollEnabled={!isSortMenuOpen && !isMoreMenuOpen}
        showsVerticalScrollIndicator={false}
      />

      {isSortMenuOpen && sortMenuPosition ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="정렬 메뉴 닫기"
            style={styles.sortMenuBackdrop}
            onPress={() => setIsSortMenuOpen(false)}
          />
          <View
            style={[
              styles.sortMenu,
              { top: sortMenuPosition.top, right: sortMenuPosition.right },
            ]}
          >
            {(Object.keys(SORT_LABELS) as PostSortOrder[]).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                onPress={() => handleSelectSort(option)}
                style={({ pressed }) => [
                  styles.sortMenuItem,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.sortMenuText,
                    sortOrder === option && styles.sortMenuTextSelected,
                  ]}
                >
                  {SORT_LABELS[option]}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {isMoreMenuOpen && moreMenuPosition ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="메뉴 닫기"
            style={styles.sortMenuBackdrop}
            onPress={() => setIsMoreMenuOpen(false)}
          />
          <View
            style={[
              styles.moreMenu,
              { top: moreMenuPosition.top, right: moreMenuPosition.right },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setIsMoreMenuOpen(false);
                setConfirmAction("block");
              }}
              style={({ pressed }) => [
                styles.moreMenuItem,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.moreMenuText}>차단</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleReport}
              style={({ pressed }) => [
                styles.moreMenuItem,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.moreMenuText, styles.moreMenuTextDanger]}>
                신고
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <ConfirmModal
        visible={confirmAction === "block"}
        title={`친구 관계를 정말 해제하시겠습니까?`}
        message="해제 후에는 서로의 게시글을 볼 수 없어요."
        confirmLabel="해제"
        image={cryingWhaleImage}
        destructive
        isPending={isConfirmPending}
        onConfirm={handleBlock}
        onCancel={() => setConfirmAction(null)}
      />

      <View
        style={[styles.topBar, { top: insets.top + 4 }]}
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.topBarButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={26} color={darkGray} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="설정"
          hitSlop={10}
          onPress={() => router.push("/(tabs)/profile/settings")}
          style={({ pressed }) => [
            styles.topBarButton,
            pressed && styles.pressed,
          ]}
        >
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
  listContent: {
    paddingBottom: 96,
  },
  cover: {
    width: "100%",
  },
  coverEmpty: {
    backgroundColor: lightGray,
  },
  coverLoading: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  topBar: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBarButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  profileSection: {
    backgroundColor: background,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  profileTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  avatarWrap: {
    marginTop: -40,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 36,
    backgroundColor: white,
  },
  avatarPlaceholder: {
    backgroundColor: lightGray,
  },
  name: {
    marginTop: 10,
    color: "#000000",
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 18,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    fontSize: 16,
    lineHeight: 18,
  },
  sortRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8ECEE",
    zIndex: 10,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sortLabel: {
    color: "#777777",
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 15,
    lineHeight: 16,
  },
  sortMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  chevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  sortMenu: {
    position: "absolute",
    minWidth: 96,
    backgroundColor: white,
    borderRadius: 4,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 30,
  },
  sortMenuItem: {
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  sortMenuText: {
    color: gray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  sortMenuTextSelected: {
    color: darkGray,
  },
  moreButton: {
    width: 28,
    height: 28,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  moreMenu: {
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
    zIndex: 30,
  },
  moreMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 6,
    alignItems: "center",
  },
  moreMenuText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  moreMenuTextDanger: {
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
});
