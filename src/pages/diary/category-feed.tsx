import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  ListRenderItem,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { background, darkGray, FontFamily, gray, primary, white } from '@/constants/theme';
import { FeedPostCard } from '@/src/pages/feed/post-card';
import {
  fetchUserPostCategories,
  fetchUserPostsByCategory,
  type PostSortOrder,
} from '@/src/services/posts';
import { fetchCurrentUser } from '@/src/services/users';
import type { FeedPost } from '@/src/types/api/feed-post';

type CategoryTab = {
  id: string;
  title: string;
  postCount: number;
};

const SORT_LABELS: Record<PostSortOrder, string> = {
  latest: '최신순',
  oldest: '오래된순',
};

function CategoryPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.categoryPill, selected && styles.categoryPillSelected]}>
      <Text style={[styles.categoryPillText, selected && styles.categoryPillTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function DiaryCategoryFeedPage() {
  const params = useLocalSearchParams<{ categoryId?: string; categoryTitle?: string }>();
  const initialCategoryId = params.categoryId ?? 'all';
  const initialCategoryTitle = params.categoryTitle ?? '전체';

  const [categories, setCategories] = useState<CategoryTab[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);
  const [selectedCategoryTitle, setSelectedCategoryTitle] = useState(initialCategoryTitle);
  const [sortOrder, setSortOrder] = useState<PostSortOrder>('latest');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [sortMenuAnchor, setSortMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const sortAnchorRef = useRef<View>(null);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );

  const loadPosts = useCallback(async () => {
    setPosts([]);

    const user = await fetchCurrentUser();
    if (!user) {
      return;
    }

    const [nextCategories, nextPosts] = await Promise.all([
      fetchUserPostCategories(user.id),
      fetchUserPostsByCategory(user.id, selectedCategoryId, selectedCategoryTitle, sortOrder),
    ]);

    setCategories(nextCategories);

    const resolvedCategory = nextCategories.find((category) => category.id === selectedCategoryId);
    if (resolvedCategory) {
      setSelectedCategoryTitle(resolvedCategory.title);
    }

    setPosts(nextPosts);
  }, [selectedCategoryId, selectedCategoryTitle, sortOrder]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const closeSortMenu = () => {
    setIsSortMenuOpen(false);
    setSortMenuAnchor(null);
  };

  const openSortMenu = () => {
    sortAnchorRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get('window').width;
      setSortMenuAnchor({
        top: y + height,
        right: screenWidth - (x + width),
      });
      setIsSortMenuOpen(true);
    });
  };

  const toggleSortMenu = () => {
    if (isSortMenuOpen) {
      closeSortMenu();
      return;
    }

    openSortMenu();
  };

  const handleSelectCategory = (category: CategoryTab) => {
    closeSortMenu();
    setSelectedCategoryId(category.id);
    setSelectedCategoryTitle(category.title);
  };

  const handleSelectSort = (nextSort: PostSortOrder) => {
    setSortOrder(nextSort);
    closeSortMenu();
  };

  const renderItem: ListRenderItem<FeedPost> = ({ item }) => <FeedPostCard post={item} />;

  const listHeader = (
    <View style={styles.listHeader}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}>
        {categories.map((category) => (
          <CategoryPill
            key={category.id}
            label={category.title}
            selected={category.id === selectedCategoryId}
            onPress={() => handleSelectCategory(category)}
          />
        ))}
      </ScrollView>

      <View style={styles.sortRow}>
        <View ref={sortAnchorRef} collapsable={false} style={styles.sortAnchor}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="정렬 변경"
            onPress={toggleSortMenu}
            style={styles.sortButton}>
            <Text style={styles.sortLabel}>{SORT_LABELS[sortOrder]}</Text>
            <Ionicons name="chevron-down" size={16} color={gray} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          hitSlop={10}
          onPress={() => router.back()}
          style={styles.headerSide}>
          <Ionicons name="arrow-back" size={24} color={darkGray} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {selectedCategory?.title ?? selectedCategoryTitle}
        </Text>
        <View style={styles.headerIcons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="알림"
            hitSlop={8}
            onPress={() => router.push('/(tabs)/home/notifications')}>
            <Ionicons name="notifications-outline" size={22} color={darkGray} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="설정"
            hitSlop={8}
            onPress={() => router.push('/(tabs)/profile/settings')}>
            <Ionicons name="settings-outline" size={22} color={darkGray} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        scrollEnabled={!isSortMenuOpen}
        showsVerticalScrollIndicator={false}
      />

      {isSortMenuOpen && sortMenuAnchor ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="정렬 메뉴 닫기"
            style={styles.sortMenuBackdrop}
            onPress={closeSortMenu}
          />
          <View
            style={[
              styles.sortMenu,
              { top: sortMenuAnchor.top, right: sortMenuAnchor.right },
            ]}>
            {(Object.keys(SORT_LABELS) as PostSortOrder[]).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                onPress={() => handleSelectSort(option)}
                style={styles.sortMenuItem}>
                <Text style={[styles.sortMenuText, sortOrder === option && styles.sortMenuTextSelected]}>
                  {SORT_LABELS[option]}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: background,
  },
  sortMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: background,
  },
  headerSide: {
    width: 72,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  headerIcons: {
    width: 72,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  listContent: {
    paddingBottom: 96,
  },
  listHeader: {
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: background,
  },
  categoryRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: primary,
  },
  categoryPillSelected: {
    backgroundColor: primary,
    borderColor: primary,
  },
  categoryPillText: {
    color: primary,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 14,
    lineHeight: 16,
  },
  categoryPillTextSelected: {
    color: white,
  },
  sortRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
  sortAnchor: {
    alignSelf: 'flex-end',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortLabel: {
    color: gray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  sortMenu: {
    position: 'absolute',
    minWidth: 96,
    backgroundColor: white,
    borderRadius: 4,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 101,
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
});
