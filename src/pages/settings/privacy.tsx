import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { gray, white } from '@/constants/theme';
import { SettingsHeader, ToggleRow } from '@/src/pages/settings/shared';
import { fetchTermsPreferences, saveTermsPreference } from '@/src/services/user-settings';

export default function PrivacySettingsPage() {
  const [aiTrainingAgreed, setAiTrainingAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetchTermsPreferences()
      .then((preferences) => {
        if (isMounted) {
          setAiTrainingAgreed(preferences.aiTrainingAgreed);
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

  // 온보딩에서 받은 선택 동의를 여기서 다시 켜고 끈다.
  const handleToggle = async (value: boolean) => {
    const previous = aiTrainingAgreed;
    setAiTrainingAgreed(value);

    try {
      await saveTermsPreference('aiTrainingAgreed', value);
    } catch (error) {
      setAiTrainingAgreed(previous);
      Alert.alert(error instanceof Error ? error.message : '설정을 저장하지 못했습니다.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <SettingsHeader title="개인정보 설정" />

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={gray} />
        </View>
      ) : (
        <View style={styles.body}>
          <ToggleRow
            label="AI 모델 개선을 위한 데이터 활용"
            value={aiTrainingAgreed}
            onValueChange={(next) => {
              void handleToggle(next);
            }}
          />
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
  body: {
    flex: 1,
    paddingTop: 10,
    backgroundColor: white,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
