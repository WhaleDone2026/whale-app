import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { background, darkGray, FontFamily, gray, white } from '@/constants/theme';
import {
  confirmAuthenticatedUser,
  getAuthUserMetadata,
  saveUserTermsAgreement,
  signOutUser,
} from '@/src/services/onboarding';

type TermId = 'service' | 'privacy' | 'marketing' | 'aiTraining';

const terms: {
  id: TermId;
  label: string;
  required: boolean;
}[] = [
  { id: 'service', label: '서비스 이용약관', required: true },
  { id: 'privacy', label: '개인정보 처리방침', required: true },
  { id: 'marketing', label: '마케팅 정보 수신', required: false },
  { id: 'aiTraining', label: 'AI 모델 개선을 위한 데이터 활용', required: false },
];

export default function OnboardingTermsPage() {
  const params = useLocalSearchParams<{ nickname?: string; profileImage?: string }>();
  const [checkedTerms, setCheckedTerms] = useState<Record<TermId, boolean>>({
    service: false,
    privacy: false,
    marketing: false,
    aiTraining: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isAllChecked = useMemo(() => terms.every((term) => checkedTerms[term.id]), [checkedTerms]);
  const canContinue = checkedTerms.service && checkedTerms.privacy;

  const toggleAll = () => {
    const nextValue = !isAllChecked;

    setCheckedTerms({
      service: nextValue,
      privacy: nextValue,
      marketing: nextValue,
      aiTraining: nextValue,
    });
  };

  const toggleTerm = (id: TermId) => {
    setCheckedTerms((prevTerms) => ({
      ...prevTerms,
      [id]: !prevTerms[id],
    }));
  };

  const handleNext = async () => {
    if (!canContinue || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const user = await confirmAuthenticatedUser();
      const { email, nickname, profileImage } = getAuthUserMetadata(user);
      const routeNickname = sanitizeSingleParam(params.nickname) || nickname;
      const routeProfileImage = sanitizeSingleParam(params.profileImage) || profileImage;

      await saveUserTermsAgreement(
        user.id,
        {
          service: checkedTerms.service,
          privacy: checkedTerms.privacy,
          marketing: checkedTerms.marketing,
          aiTraining: checkedTerms.aiTraining,
        },
        {
          email,
          name: routeNickname,
          profileImageUrl: routeProfileImage,
        },
      );

      router.push({
        pathname: '/onboarding/profile',
        params: {
          nickname: routeNickname,
          profileImage: routeProfileImage,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '약관 동의 저장 중 문제가 발생했습니다.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 로그인은 완료됐지만 가입을 취소한 상태다. 단순 back이면 로그인 세션이 남아 탭
  // 초기 화면(피드)으로 빠지므로, 세션을 끝낸 뒤 로그인 첫 화면으로 명시적으로 보낸다.
  const handleCancelOnboarding = useCallback(async () => {
    if (isSubmitting || isCancelling) {
      return;
    }

    setIsCancelling(true);
    setSubmitError(null);

    try {
      await signOutUser();
      router.replace('/');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '로그아웃하지 못했습니다. 다시 시도해 주세요.');
      setIsCancelling(false);
    }
  }, [isCancelling, isSubmitting]);

  // Android 시스템 뒤로가기 역시 헤더 화살표와 같은 "가입 취소 → 로그인" 동작으로 맞춘다.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void handleCancelOnboarding();
      return true;
    });

    return () => subscription.remove();
  }, [handleCancelOnboarding]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          hitSlop={10}
          disabled={isSubmitting || isCancelling}
          onPress={() => {
            void handleCancelOnboarding();
          }}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={25} color={darkGray} />
        </Pressable>
        <Text style={styles.headerTitle}>약관 동의</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleArea}>
          <Text style={styles.title}>약관 동의</Text>
          <Text style={styles.subtitle}>필수항목 및 선택항목 약관에 동의해 주세요.</Text>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isAllChecked }}
          onPress={toggleAll}
          style={({ pressed }) => [styles.allAgreeBox, pressed && styles.pressed]}>
          <CheckCircle checked={isAllChecked} filled />
          <Text style={styles.allAgreeText}>모든 약관에 동의합니다.</Text>
        </Pressable>

        <View style={styles.termList}>
          {terms.map((term) => (
            <View key={term.id} style={styles.termRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checkedTerms[term.id] }}
                hitSlop={10}
                onPress={() => toggleTerm(term.id)}
                style={({ pressed }) => [styles.termCheckButton, pressed && styles.pressed]}>
                <CheckCircle checked={checkedTerms[term.id]} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => toggleTerm(term.id)}
                style={({ pressed }) => [styles.termLabelButton, pressed && styles.pressed]}>
                <Text style={styles.termText}>
                  [{term.required ? '필수' : '선택'}] {term.label}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${term.label} 자세히 보기`}
                hitSlop={10}
                style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}>
                <Ionicons name="chevron-forward" size={25} color={gray} />
              </Pressable>
            </View>
          ))}
        </View>
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음"
          disabled={!canContinue || isSubmitting}
          onPress={handleNext}
          style={({ pressed }) => [
            styles.nextButton,
            (!canContinue || isSubmitting) && styles.disabledButton,
            pressed && styles.pressed,
          ]}>
          {isSubmitting ? (
            <ActivityIndicator color={white} size="small" />
          ) : (
            <Text style={styles.nextButtonText}>다음</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function CheckCircle({ checked, filled = false }: { checked: boolean; filled?: boolean }) {
  return (
    <View style={[styles.checkCircle, checked && styles.checkedCircle, filled && checked && styles.filledCheckedCircle]}>
      {checked ? <Ionicons name="checkmark" size={16} color={white} /> : null}
    </View>
  );
}

function sanitizeSingleParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: white,
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    flex: 1,
    paddingHorizontal: 36,
  },
  titleArea: {
    marginTop: 46,
  },
  title: {
    color: '#000000',
    fontFamily: FontFamily.pretendardBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    color: '#000000',
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  allAgreeBox: {
    marginTop: 44,
    borderRadius: 5,
    paddingVertical: 16,
    backgroundColor: background,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginHorizontal: -12
  },
  allAgreeText: {
    marginLeft: 10,
    color: '#000000',
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 16,
    lineHeight: 22,
  },
  termList: {
    marginTop: 26,
    gap: 30,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  termCheckButton: {
    width: 34,
    height: 34,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  termLabelButton: {
    flex: 1,
    height: 34,
    justifyContent: 'center',
  },
  termText: {
    color: '#000000',
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  arrowButton: {
    width: 34,
    height: 34,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedCircle: {
    borderColor: darkGray,
    backgroundColor: darkGray,
  },
  filledCheckedCircle: {
    backgroundColor: darkGray,
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 36,
  },
  nextButton: {
    height: 47,
    borderRadius: 5,
    backgroundColor: darkGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.35,
  },
  nextButtonText: {
    color: white,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    marginTop: 16,
    color: '#D04444',
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
