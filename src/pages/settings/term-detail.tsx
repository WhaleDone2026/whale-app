import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkGray, FontFamily, gray, white } from '@/constants/theme';
import { SettingsHeader } from '@/src/pages/settings/shared';
import { fetchCurrentTerm, type Term, type TermType } from '@/src/services/terms';

/**
 * 약관 본문 뷰어. 본문은 terms 테이블에서 온다 —
 * 앱에 문구를 박아 두지 않아야 배포 없이 고칠 수 있다.
 */
export default function TermDetailPage() {
  const params = useLocalSearchParams<{ type?: string; title?: string }>();
  const [term, setTerm] = useState<Term | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const type = params.type as TermType | undefined;
    if (!type) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    fetchCurrentTerm(type)
      .then((nextTerm) => {
        if (isMounted) {
          setTerm(nextTerm);
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
  }, [params.type]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <SettingsHeader title={term?.title ?? params.title ?? '약관'} />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={gray} />
        </View>
      ) : term ? (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <Text style={styles.version}>버전 {term.version}</Text>
          <Text style={styles.body}>{term.content}</Text>
        </ScrollView>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>아직 등록된 내용이 없어요.</Text>
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
  version: {
    marginBottom: 12,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
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
