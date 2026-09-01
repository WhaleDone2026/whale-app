import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { background, darkGray, FontFamily, gray, white } from '@/constants/theme';
import { SettingsHeader, ToggleRow } from '@/src/pages/settings/shared';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  fetchNotificationSettings,
  fetchTermsPreferences,
  saveNotificationSetting,
  saveTermsPreference,
  type NotificationSettingKey,
  type NotificationSettings,
} from '@/src/services/user-settings';

const ACTIVITY_ROWS: { key: NotificationSettingKey; label: string }[] = [
  { key: 'allEnabled', label: '전체 알림' },
  { key: 'commentEnabled', label: '댓글 알림' },
  { key: 'friendRequestEnabled', label: '친구 요청 알림' },
  { key: 'likeEnabled', label: '좋아요 알림' },
  { key: 'friendPostEnabled', label: '친구 게시글 알림' },
];

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [marketingAgreed, setMarketingAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchNotificationSettings(), fetchTermsPreferences()])
      .then(([nextSettings, preferences]) => {
        if (isMounted) {
          setSettings(nextSettings);
          setMarketingAgreed(preferences.marketingAgreed);
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

  // 토글은 즉시 반영하고 저장에 실패하면 되돌린다.
  const handleToggle = async (key: NotificationSettingKey, value: boolean) => {
    const previous = settings;
    setSettings((current) => ({ ...current, [key]: value }));

    try {
      await saveNotificationSetting(previous, key, value);
    } catch (error) {
      setSettings(previous);
      Alert.alert(error instanceof Error ? error.message : '알림 설정을 저장하지 못했습니다.');
    }
  };

  const handleToggleMarketing = async (value: boolean) => {
    const previous = marketingAgreed;
    setMarketingAgreed(value);

    try {
      await saveTermsPreference('marketingAgreed', value);
    } catch (error) {
      setMarketingAgreed(previous);
      Alert.alert(error instanceof Error ? error.message : '설정을 저장하지 못했습니다.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <SettingsHeader title="알림" />

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={gray} />
        </View>
      ) : (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>앱 활동</Text>
            {ACTIVITY_ROWS.map((row) => (
              <ToggleRow
                key={row.key}
                label={row.label}
                value={settings[row.key]}
                // 전체 알림을 끄면 개별 알림은 손댈 수 없다.
                disabled={row.key !== 'allEnabled' && !settings.allEnabled}
                onValueChange={(next) => {
                  void handleToggle(row.key, next);
                }}
              />
            ))}
          </View>

          <View style={[styles.section, styles.separatedSection]}>
            <Text style={styles.sectionTitle}>마케팅 수신</Text>
            <ToggleRow
              label="마케팅 정보 수신"
              value={marketingAgreed}
              onValueChange={(next) => {
                void handleToggleMarketing(next);
              }}
            />
          </View>
        </ScrollView>
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
    backgroundColor: background,
  },
  content: {
    paddingBottom: 40,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: white,
  },
  section: {
    paddingTop: 18,
    paddingBottom: 12,
    backgroundColor: white,
  },
  // 섹션 사이 간격 — 배경색이 비쳐 구분선처럼 보인다.
  separatedSection: {
    marginTop: 8,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    paddingBottom: 6,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
});
