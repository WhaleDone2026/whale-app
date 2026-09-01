import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkGray, FontFamily, gray, lightGray, white } from '@/constants/theme';
import { SettingsHeader } from '@/src/pages/settings/shared';
import { fetchNoticeById, formatNoticeDate, type Notice } from '@/src/services/notices';

/** 공지 상세. 목록 디자인만 있어서 제목·날짜·본문만 담백하게 보여 준다. */
export default function NoticeDetailPage() {
  const params = useLocalSearchParams<{ noticeId?: string }>();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const noticeId = params.noticeId;
    if (!noticeId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    fetchNoticeById(noticeId)
      .then((nextNotice) => {
        if (isMounted) {
          setNotice(nextNotice);
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
  }, [params.noticeId]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <SettingsHeader title="공지사항" />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={gray} />
        </View>
      ) : notice ? (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <Text style={styles.title}>{notice.title}</Text>
          <Text style={styles.date}>{formatNoticeDate(notice.publishedAt)}</Text>
          <View style={styles.divider} />
          <Text style={styles.body}>{notice.content}</Text>
        </ScrollView>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>공지사항을 불러오지 못했어요.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: white,
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 60,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 17,
    lineHeight: 24,
  },
  date: {
    marginTop: 6,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
    backgroundColor: lightGray,
  },
  body: {
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 22,
  },
  emptyText: {
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
  },
});
