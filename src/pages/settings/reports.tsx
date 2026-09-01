import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { background, darkGray, FontFamily, gray, lightGray, primary, red, white } from '@/constants/theme';
import { SettingsHeader } from '@/src/pages/settings/shared';
import { formatNoticeDate } from '@/src/services/notices';
import {
  fetchMyReports,
  REPORT_STATUS_LABEL,
  REPORT_TARGET_LABEL,
  reportReasonLabel,
  type MyReport,
  type ReportStatus,
} from '@/src/services/reports';

/** 상태 배지 색 — 처리가 끝난 건은 눈에 덜 띄어도 된다. */
const STATUS_COLOR: Record<ReportStatus, string> = {
  pending: primary,
  reviewing: primary,
  resolved: gray,
  rejected: red,
};

/** '민수님의 게시글', '민수님' 처럼 무엇을 신고했는지 한 줄로. */
function describeTarget(report: MyReport): string {
  const owner = report.targetOwnerName ?? '알 수 없는 사용자';

  if (report.targetType === 'user') {
    return `${owner}님`;
  }

  return `${owner}님의 ${REPORT_TARGET_LABEL[report.targetType]}`;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<MyReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 신고하고 바로 들어오는 경로가 아니어도, 운영이 상태를 바꾸면 다시 봤을 때 반영돼야 한다.
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      fetchMyReports()
        .then((nextReports) => {
          if (isMounted) {
            setReports(nextReports);
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
    }, []),
  );

  const renderItem: ListRenderItem<MyReport> = ({ item }) => (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{REPORT_TARGET_LABEL[item.targetType]}</Text>
        </View>
        <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>
          {REPORT_STATUS_LABEL[item.status]}
        </Text>
      </View>

      <Text style={styles.target} numberOfLines={1}>
        {describeTarget(item)}
      </Text>

      {/* 게시글·댓글이면 무엇을 신고했는지 본문 앞부분을 보여 준다 */}
      {item.targetLabel ? (
        <Text style={styles.preview} numberOfLines={1}>
          “{item.targetLabel}”
        </Text>
      ) : null}

      <Text style={styles.reason}>{reportReasonLabel(item.reason)}</Text>
      {item.detail ? (
        <Text style={styles.detail} numberOfLines={2}>
          {item.detail}
        </Text>
      ) : null}

      <Text style={styles.date}>{formatNoticeDate(item.createdAt)} 접수</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <SettingsHeader title="신고내역" />

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            {isLoading ? (
              <ActivityIndicator color={gray} />
            ) : (
              <Text style={styles.emptyText}>신고한 내역이 없어요.</Text>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightGray,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: background,
  },
  typeBadgeText: {
    color: gray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  status: {
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  target: {
    marginTop: 8,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  preview: {
    marginTop: 2,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  reason: {
    marginTop: 6,
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  detail: {
    marginTop: 2,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 17,
  },
  date: {
    marginTop: 8,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  emptyBox: {
    paddingTop: 80,
    alignItems: 'center',
  },
  emptyText: {
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
  },
});
