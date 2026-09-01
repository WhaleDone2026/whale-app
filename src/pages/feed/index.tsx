import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFriends } from '@/src/contexts/friends';
import { fetchFeedPostsByUserIds } from '@/src/services/posts';
import type { FeedPost } from '@/src/types/api/feed-post';

import { FeedPostCard } from '@/src/pages/feed/post-card';

import { HomeHeader } from '@/components/home/home-header';
import { PencilIcon } from '@/components/icons/pencil-icon';
import { background, darkGray, gray, primary, FontFamily } from '@/constants/theme';

const TAB_BAR_VISUAL_HEIGHT = 80;
const FAB_SIZE = 52;
/** 탭바 상단 기준 위로 띄울 간격 */
const FAB_GAP_ABOVE_TAB = -80;

export default function FeedPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { feedUserIds, isLoading, reload: reloadFriends } = useFriends();
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  // 탭 화면은 한 번 뜨면 계속 마운트된 상태로 남는다. 글을 쓰고 돌아왔을 때 방금
  // 올린 글이 보이도록, 화면에 다시 포커스될 때마다 목록을 새로 받아온다.
  const [refreshKey, setRefreshKey] = useState(0);
  // 첫 조회가 끝나기 전에는 안내 문구 대신 스피너를 둔다. 안 그러면 불러오는
  // 사이에 "피드가 없습니다" 가 한 번 스쳐 지나간다.
  const [hasLoadedPosts, setHasLoadedPosts] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // 친구 목록도 같이 갱신한다. 친구를 새로 받고 피드 탭으로 오면 그 친구 글까지
      // 바로 보여야 한다.
      void reloadFriends();
      setRefreshKey((key) => key + 1);
    }, [reloadFriends]),
  );

  useEffect(() => {
    let isMounted = true;

    if (isLoading) {
      return;
    }

    if (feedUserIds.length === 0) {
      setFeedPosts([]);
      setHasLoadedPosts(true);
      return;
    }

    // 여기서 목록을 비우지 않는다 — 포커스마다 다시 받아오므로, 비우면 탭을 옮길
    // 때마다 화면이 한 번씩 깜빡인다. 받아온 결과로 통째로 교체한다.
    fetchFeedPostsByUserIds(feedUserIds)
      .then((posts) => {
        if (isMounted) {
          setFeedPosts(posts);
          setHasLoadedPosts(true);
        }
      })
      .catch((error) => {
        console.warn('[feed] Failed to load posts', error);
        if (isMounted) {
          setFeedPosts([]);
          setHasLoadedPosts(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [feedUserIds, isLoading, refreshKey]);

  // 알림에서 넘어온 경우 그 글로 스크롤한다.
  //
  // 파라미터는 스크롤한 뒤 지운다. 안 지우면 탭을 옮겼다 돌아올 때마다 같은 글로
  // 다시 튀고, 같은 알림을 두 번 눌렀을 때는 값이 그대로라 아무 일도 안 일어난다.
  const { postId } = useLocalSearchParams<{ postId?: string }>();
  const listRef = useRef<FlatList<FeedPost>>(null);

  useEffect(() => {
    if (!postId || feedPosts.length === 0) {
      return;
    }

    const index = feedPosts.findIndex((post) => post.id === postId);
    if (index < 0) {
      // 친구를 끊었거나 글이 지워지면 피드에 없다. 목록 맨 위에 그대로 둔다.
      router.setParams({ postId: '' });
      return;
    }

    // 목록이 그려진 다음 프레임에 움직여야 위치 계산이 맞는다.
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
      router.setParams({ postId: '' });
    });

    return () => cancelAnimationFrame(frame);
  }, [postId, feedPosts, router]);

  const renderItem: ListRenderItem<FeedPost> = ({ item }) => <FeedPostCard post={item} />;

  const isEmpty = feedPosts.length === 0;

  // 갓 가입해서 친구가 없으면 피드에 아무것도 없다. 빈 화면 대신 다음에 뭘 하면
  // 되는지 알려 준다.
  const renderEmpty = () => (
    <View style={styles.emptyBox}>
      {isLoading || !hasLoadedPosts ? (
        <ActivityIndicator color={gray} />
      ) : (
        <>
          <Text style={styles.emptyTitle}>피드가 없습니다.</Text>
          <Text style={styles.emptyText}>친구 탭에서 친구를 추가해 보세요.</Text>
        </>
      )}
    </View>
  );

  const fabBottom = TAB_BAR_VISUAL_HEIGHT + insets.bottom + FAB_GAP_ABOVE_TAB;
  const bottomPad = fabBottom + FAB_SIZE + 16;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <HomeHeader active="feed" />
      <View style={styles.screen}>
        <FlatList
          ref={listRef}
          data={feedPosts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad },
            isEmpty && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          // 카드 높이가 글 길이·이미지 수에 따라 제각각이라 getItemLayout 을 줄 수 없고,
          // 아직 그려지지 않은 항목으로는 곧장 뛰지 못해 여기로 떨어진다. 평균 높이로
          // 어림잡아 옮겨서 대상 항목을 렌더시킨 뒤 한 번만 다시 시도한다.
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
            requestAnimationFrame(() => {
              listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
            });
          }}
        />
        <Pressable
          style={[styles.fab, { bottom: fabBottom }]}
          accessibilityRole="button"
          accessibilityLabel="글 작성"
          onPress={() => router.push('/(tabs)/write')}>
          <PencilIcon size={22} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: background,
  },
  screen: {
    flex: 1,
    backgroundColor: background,
  },
  listContent: {
    paddingTop: 8,
  },
  // 비어 있을 때만 세로 가운데로. 목록이 있을 때 쓰면 짧은 목록이 가운데로 몰린다.
  emptyListContent: {
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
  fab: {
    position: 'absolute',
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
});
