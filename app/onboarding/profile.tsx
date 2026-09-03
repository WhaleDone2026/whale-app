import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePostHog } from 'posthog-react-native';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CustomImagePicker } from '@/components/custom-image-picker';
import {background, darkGray, FontFamily, gray, primary, red, white} from '@/constants/theme';
import {
  completeOnboardingProfile,
  confirmAuthenticatedUser,
  fetchOnboardingProfileSeed,
  getAuthUserMetadata,
  isProfileFieldTaken,
  normalizeTag,
  resolveProfileImageUrl,
} from '@/src/services/onboarding';
import { uploadProfileImage } from '@/src/services/users';

const MAX_DESCRIPTION_LENGTH = 100;

type DuplicateStatus = 'idle' | 'checking' | 'available' | 'taken';

export default function OnboardingProfilePage() {
  const posthog = usePostHog();
  const params = useLocalSearchParams<{ nickname?: string; profileImage?: string }>();
  const initialNickname = useMemo(() => sanitizeSingleParam(params.nickname), [params.nickname]);
  const initialProfileImage = useMemo(
    () => resolveProfileImageUrl(sanitizeSingleParam(params.profileImage)),
    [params.profileImage],
  );

  const [nickname, setNickname] = useState(initialNickname);
  const [profileImage, setProfileImage] = useState(initialProfileImage);
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nicknameStatus, setNicknameStatus] = useState<DuplicateStatus>('idle');
  const [tagStatus, setTagStatus] = useState<DuplicateStatus>('idle');
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const goBackToTerms = useCallback(() => {
    router.replace('/onboarding/terms');
  }, []);

  // 프로필 단계의 Android 시스템 뒤로가기도 탭/앱 종료가 아니라 약관 단계로 보낸다.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBackToTerms();
      return true;
    });

    return () => subscription.remove();
  }, [goBackToTerms]);

  useEffect(() => {
    let isMounted = true;

    confirmAuthenticatedUser()
      .then(async (user) => {
        const seed = await fetchOnboardingProfileSeed(user);

        if (!isMounted) {
          return;
        }

        if (seed.nickname) {
          setNickname(seed.nickname);
        }

        if (seed.profileImage) {
          setProfileImage(seed.profileImage);
        }
      })
      .catch((error) => {
        console.warn('[onboarding-profile] Failed to load profile seed', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 중복확인은 보조 기능이다. 완료 시 서버에서 이름·아이디의 중복을 다시 검사하므로,
  // 사용자가 중복확인 버튼을 누르지 않아도 바로 완료를 시도할 수 있다.
  const canComplete = !isSubmitting;

  const handleCheckDuplicate = async (field: 'name' | 'tag') => {
    const value = field === 'name' ? nickname.trim() : normalizeTag(tag);
    const setStatus = field === 'name' ? setNicknameStatus : setTagStatus;

    if (!value) {
      return;
    }

    setStatus('checking');
    setSubmitError(null);

    try {
      const user = await confirmAuthenticatedUser();
      const taken = await isProfileFieldTaken(field, value, user.id);
      setStatus(taken ? 'taken' : 'available');
    } catch (error) {
      setStatus('idle');
      const message = error instanceof Error ? error.message : '중복 확인 중 문제가 발생했습니다.';
      setSubmitError(message);
    }
  };

  const handlePickImage = async (uris: string[]) => {
    setIsPickerVisible(false);

    const localUri = uris[0];
    if (!localUri) {
      return;
    }

    setIsUploadingImage(true);
    setSubmitError(null);

    try {
      const user = await confirmAuthenticatedUser();
      const publicUrl = await uploadProfileImage(user.id, localUri);
      setProfileImage(publicUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : '프로필 이미지 업로드 중 문제가 발생했습니다.';
      setSubmitError(message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleComplete = async () => {
    if (!canComplete || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const user = await confirmAuthenticatedUser();
      const { email } = getAuthUserMetadata(user);

      await completeOnboardingProfile(user.id, {
        name: nickname,
        tag,
        description,
        profileImageUrl: profileImage,
        email,
      });

      // 현재 온보딩에는 어조 선택 UI가 없어, 실제 선택값이 생기기 전까지는
      // 분석에서 구분 가능한 비식별 상태값을 남긴다.
      posthog.capture('onboarding_completed', {
        tone_preference: 'not_configured',
      });
      router.replace('/(tabs)/home/group');
    } catch (error) {
      const message = error instanceof Error ? error.message : '프로필 저장 중 문제가 발생했습니다.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="뒤로가기"
              hitSlop={10}
              // 약관까지는 이미 저장된 상태이므로, 피드나 로그인 화면이 아니라 이전
              // 온보딩 단계로만 돌아간다.
              onPress={goBackToTerms}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Ionicons name="chevron-back" size={25} color={darkGray} />
            </Pressable>
            <Text style={styles.title}>프로필 설정</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.profileImageArea}>
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={styles.profileImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.profilePlaceholder}>
                <Ionicons name="person" size={43} color={white} />
              </View>
            )}
            {isUploadingImage ? (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator color={white} size="small" />
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="프로필 사진 변경"
              disabled={isUploadingImage}
              onPress={() => setIsPickerVisible(true)}
              style={({ pressed }) => [styles.cameraButton, pressed && styles.pressed]}>
              <Ionicons name="camera" size={16} color={white} />
            </Pressable>
          </View>

          <View style={styles.form}>
            <FieldBlock
              label="닉네임"
              filled={nickname.trim().length > 0}
              status={nicknameStatus}
              onCheckDuplicate={() => handleCheckDuplicate('name')}>
              <TextInput
                value={nickname}
                onChangeText={(text) => {
                  setNickname(text);
                  setNicknameStatus('idle');
                }}
                style={styles.input}
                placeholder="닉네임을 입력하세요"
                placeholderTextColor={gray}
                returnKeyType="next"
              />
            </FieldBlock>

            <FieldBlock
              label="아이디"
              filled={tag.trim().length > 0}
              status={tagStatus}
              onCheckDuplicate={() => handleCheckDuplicate('tag')}>
              <TextInput
                value={tag}
                onChangeText={(text) => {
                  setTag(normalizeTag(text));
                  setTagStatus('idle');
                }}
                style={styles.input}
                placeholder="영문, 숫자만 사용 가능"
                placeholderTextColor={gray}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </FieldBlock>

            <FieldBlock
              label="소개"
              filled={description.trim().length > 0}
              count={`(${description.length}/${MAX_DESCRIPTION_LENGTH})`}
              multiline>
              <TextInput
                value={description}
                onChangeText={(text) => setDescription(text.slice(0, MAX_DESCRIPTION_LENGTH))}
                style={[styles.input, styles.descriptionInput]}
                placeholder="내 페이지를 소개해 주세요."
                placeholderTextColor={gray}
                multiline
                textAlignVertical="top"
                maxLength={MAX_DESCRIPTION_LENGTH}
              />
            </FieldBlock>
          </View>
          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="완료"
            disabled={!canComplete}
            onPress={handleComplete}
            style={({ pressed }) => [styles.completeButton, !canComplete && styles.disabledButton, pressed && styles.pressed]}>
            {isSubmitting ? (
              <ActivityIndicator color={white} size="small" />
            ) : (
              <Text style={styles.completeButtonText}>완료</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={isPickerVisible}
        animationType="slide"
        onRequestClose={() => setIsPickerVisible(false)}>
        <CustomImagePicker
          onConfirm={handlePickImage}
          onClose={() => setIsPickerVisible(false)}
          maxSelect={1}
          resolveLocalUri
        />
      </Modal>
    </SafeAreaView>
  );
}

function FieldBlock({
  label,
  filled,
  count,
  status,
  onCheckDuplicate,
  multiline = false,
  children,
}: {
  label: string;
  filled: boolean;
  count?: string;
  status?: DuplicateStatus;
  onCheckDuplicate?: () => void;
  multiline?: boolean;
  children: React.ReactNode;
}) {
  const statusMessage =
    status === 'available'
      ? `사용 가능한 ${label}입니다.`
      : status === 'taken'
        ? `중복되는 ${label}입니다.`
        : null;

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.labelRow}>
        <View style={styles.labelLeft}>
          <Text style={styles.label}>{label}</Text>
          <Ionicons name="checkmark-circle" size={16} color={filled ? primary : gray} />
        </View>
        {statusMessage ? (
          <Text
            style={[styles.statusText, status === 'taken' ? styles.statusTaken : styles.statusAvailable]}>
            {statusMessage}
          </Text>
        ) : null}
      </View>
      <View style={[styles.fieldBox, multiline && styles.descriptionBox]}>
        {children}
        {onCheckDuplicate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} 중복확인`}
            onPress={onCheckDuplicate}
            style={({ pressed }) => [styles.checkButton, pressed && styles.pressed]}>
            <Text style={styles.checkButtonText}>중복확인</Text>
          </Pressable>
        ) : null}
        {count ? <Text style={styles.countText}>{count}</Text> : null}
      </View>
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
  keyboardAvoiding: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: white,
  },
  content: {
    paddingBottom: 120,
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  headerSpacer: {
    width: 44,
  },
  profileImageArea: {
    marginTop: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: 84,
    height: 84,
    borderRadius: 46,
    backgroundColor: '#D9D9D9',
  },
  profilePlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 46,
    backgroundColor: '#D9D9D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingOverlay: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 46,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButton: {
    position: 'absolute',
    right: '50%',
    bottom: 0,
    marginRight: -44,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: white,
    backgroundColor: '#D0D0D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    marginTop: 45,
    paddingHorizontal: 28,
    gap: 20,
  },
  fieldBlock: {
    gap: 15,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  statusText: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  statusAvailable: {
    color: primary,
  },
  statusTaken: {
    color: red,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 5,
    backgroundColor: background,
  },
  descriptionBox: {
    flexDirection: 'column',
    height: 114,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingTop: 14,
    paddingRight: 64,
  },
  input: {
    flex: 1,
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 18,
    padding: 0,
  },
  checkButton: {
    marginLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 5,
    backgroundColor: darkGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkButtonText: {
    color: white,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 13,
    lineHeight: 14,
  },
  descriptionInput: {
    minHeight: 76,
    paddingRight: 0,
  },
  countText: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 36,
    paddingHorizontal: 26,
  },
  completeButton: {
    paddingVertical: 15,
    borderRadius: 5,
    backgroundColor: darkGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.35,
  },
  completeButtonText: {
    color: white,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    marginTop: 12,
    paddingHorizontal: 28,
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
