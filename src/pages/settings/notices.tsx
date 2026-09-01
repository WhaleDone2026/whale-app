import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkGray, FontFamily, gray, lightGray, red, white } from '@/constants/theme';
import { SettingsHeader } from '@/src/pages/settings/shared';
import { fetchNotices, formatNoticeDate, type Notice } from '@/src/services/notices';

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetchNotices()
      .then((nextNotices) => {
        if (isMounted) {
          setNotices(nextNotices);
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
  }, []);

  const renderItem: ListRenderItem<Notice> = ({ item }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() =>
        router.push({
          pathname: '/(tabs)/profile/settings/notice',
          params: { noticeId: item.id },
        })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowText}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {/* 최근에 올라온 공지에만 붙는 배지 */}
          {item.isNew ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>N</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.date}>{formatNoticeDate(item.publishedAt)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#000000" />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <SettingsHeader title="공지사항" />

      <FlatList
        data={notices}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            {isLoading ? (
              <ActivityIndicator color={gray} />
            ) : (
              <Text style={styles.emptyText}>등록된 공지사항이 없어요.</Text>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: white,
  },
  listContent: {
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightGray,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flexShrink: 1,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  newBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBadgeText: {
    color: white,
    fontFamily: FontFamily.pretendardBold,
    fontSize: 10,
    lineHeight: 12,
  },
  date: {
    marginTop: 4,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  emptyBox: {
    paddingTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
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
