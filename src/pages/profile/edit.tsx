import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArrowIcon } from '@/components/icons/arrow-icon';
import { DEFAULT_WHALE_ID, LOCKED_WHALE_IMAGE, WHALES, type Whale } from '@/constants/whales';
import { background, darkGray, FontFamily, gray, lightGray, primary, white } from '@/constants/theme';
import {
  AppUser,
  fetchCurrentUser,
  saveCoverImage,
  saveProfileImage,
  updateSelectedWhaleId,
  updateUserProfile,
} from '@/src/services/users';

// 고래 목록은 constants/whales.ts 한 곳에서 관리한다. 예전에는 이 화면 안에만 있어서
// 마이페이지·친구 화면은 whale1 을 하드코딩하고 있었다.
const CHARACTERS = WHALES;

const MAX_NICKNAME_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 100;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.5);
const CARD_SPACING = 28;
const ITEM_WIDTH = CARD_WIDTH + CARD_SPACING * 2;
const SIDE_PADDING = Math.max(0, (SCREEN_WIDTH - ITEM_WIDTH) / 2);

const emptyProfile: AppUser = {
  id: '',
  name: '',
  tag: '',
  profile_image: require('../../../assets/icons/test.png'),
  cover_image_url: null,
  description: '',
  installed_at: new Date().toISOString(),
  intimacy_level: 1,
  whale_id: DEFAULT_WHALE_ID,
  friends_count: 0,
  like_count: 0,
  post_count: 0,
};

function getInstalledDays(installedAt: string) {
  const installedDate = new Date(installedAt);
  const today = new Date();
  const diffTime = today.getTime() - installedDate.getTime();

  return Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
}

export default function ProfileEditPage() {
  const [currentUser, setCurrentUser] = useState<AppUser>(emptyProfile);
  const [nickname, setNickname] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [profileImage, setProfileImage] = useState<AppUser['profile_image']>(emptyProfile.profile_image);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isImageMenuOpen, setIsImageMenuOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const carouselRef = useRef<FlatList<Whale>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const installedDays = getInstalledDays(currentUser.installed_at);

  useEffect(() => {
    let isMounted = true;

    fetchCurrentUser()
      .then((user) => {
        if (!isMounted || !user) {
          return;
        }

        setCurrentUser(user);
        setNickname(user.name);
        setTag(user.tag);
        setDescription(user.description);
        setProfileImage(user.profile_image);
        setSelectedLevel(user.whale_id || DEFAULT_WHALE_ID);
      })
      .catch((error) => {
        console.warn('[profile-edit] Failed to load profile', error);
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

  const handleSave = useCallback(async () => {
    if (isSaving) {
      return;
    }

    if (!currentUser.id) {
      router.back();
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await updateUserProfile(currentUser.id, {
        name: nickname,
        tag,
        description,
      });

      if (selectedLevel !== currentUser.whale_id) {
        await updateSelectedWhaleId(currentUser.id, selectedLevel);
      }

      router.back();
    } catch (error) {
      const message = error instanceof Error ? error.message : '프로필 저장 중 문제가 발생했습니다.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [currentUser.id, currentUser.whale_id, description, isSaving, nickname, selectedLevel, tag]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void handleSave();
      return true;
    });

    return () => subscription.remove();
  }, [handleSave]);

  const pickAndUpload = useCallback(
    async (kind: 'profile' | 'cover') => {
      setIsImageMenuOpen(false);

      if (!currentUser.id || isUploadingImage) {
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const localUri = result.assets[0].uri;
      setIsUploadingImage(true);

      try {
        if (kind === 'profile') {
          const url = await saveProfileImage(currentUser.id, localUri);
          setProfileImage({ uri: url });
        } else {
          await saveCoverImage(currentUser.id, localUri);
        }
      } catch (error) {
        console.warn('[profile-edit] Failed to upload image', error);
        Alert.alert('업로드 실패', '이미지를 저장하지 못했어요. 다시 시도해 주세요.');
      } finally {
        setIsUploadingImage(false);
      }
    },
    [currentUser.id, isUploadingImage],
  );

  const handleCarouselScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / ITEM_WIDTH);
    if (index !== activeIndex) {
      setActiveIndex(Math.max(0, Math.min(index, CHARACTERS.length - 1)));
    }
  };

  const scrollToIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(index, CHARACTERS.length - 1));
    carouselRef.current?.scrollToOffset({ offset: clamped * ITEM_WIDTH, animated: true });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centered]} edges={['top']}>
        <ActivityIndicator color={gray} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
            hitSlop={10}
            disabled={isSaving}
            onPress={() => {
              void handleSave();
            }}
            style={({ pressed }) => [styles.headerSide, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={26} color={darkGray} />
          </Pressable>
          <Text style={styles.title}>프로필 편집</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="저장"
            hitSlop={10}
            disabled={isSaving}
            onPress={() => {
              void handleSave();
            }}
            style={({ pressed }) => [styles.headerSide, styles.headerSaveSide, pressed && styles.pressed]}>
            {isSaving ? (
              <ActivityIndicator color={darkGray} size="small" />
            ) : (
              <Text style={styles.saveText}>저장</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => setIsImageMenuOpen(false)}>
          <View style={styles.profileImageArea}>
            <Image source={profileImage} style={styles.profileImage} contentFit="cover" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="사진 변경"
              onPress={() => setIsImageMenuOpen((open) => !open)}
              style={({ pressed }) => [styles.cameraButton, pressed && styles.pressed]}>
              {isUploadingImage ? (
                <ActivityIndicator color={white} size="small" />
              ) : (
                <Ionicons name="camera" size={16} color={white} />
              )}
            </Pressable>

            {isImageMenuOpen ? (
              <View style={styles.imageMenu}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void pickAndUpload('profile')}
                  style={({ pressed }) => [styles.imageMenuItem, pressed && styles.imageMenuItemPressed]}>
                  <Text style={styles.imageMenuText}>프로필</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void pickAndUpload('cover')}
                  style={({ pressed }) => [styles.imageMenuItem, pressed && styles.imageMenuItemPressed]}>
                  <Text style={styles.imageMenuText}>배경</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.form}>
            <FieldRow label="닉네임" count={`(${nickname.length}/${MAX_NICKNAME_LENGTH})`}>
              <TextInput
                value={nickname}
                onChangeText={(text) => setNickname(text.slice(0, MAX_NICKNAME_LENGTH))}
                style={styles.input}
                placeholder="닉네임"
                placeholderTextColor={gray}
                maxLength={MAX_NICKNAME_LENGTH}
              />
            </FieldRow>

            <FieldRow label="소개" count={`(${description.length}/${MAX_DESCRIPTION_LENGTH})`} multiline>
              <TextInput
                value={description}
                onChangeText={(text) => setDescription(text.slice(0, MAX_DESCRIPTION_LENGTH))}
                style={[styles.input, styles.descriptionInput]}
                placeholder="소개를 입력하세요"
                placeholderTextColor={gray}
                multiline
                textAlignVertical="top"
                maxLength={MAX_DESCRIPTION_LENGTH}
              />
            </FieldRow>
          </View>

          <Text style={styles.characterTitle}>캐릭터</Text>

          <View style={styles.carouselWrap}>
            <FlatList
              ref={carouselRef}
              data={CHARACTERS}
              keyExtractor={(item) => String(item.id)}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={ITEM_WIDTH}
              decelerationRate="fast"
              contentContainerStyle={[styles.carouselContent, { paddingHorizontal: SIDE_PADDING }]}
              scrollEventThrottle={16}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                useNativeDriver: false,
              })}
              onMomentumScrollEnd={handleCarouselScroll}
              extraData={selectedLevel}
              renderItem={({ item, index }) => {
                const unlocked = installedDays >= item.unlockDay;
                const selected = selectedLevel === item.id;
                const inputRange = [
                  (index - 1) * ITEM_WIDTH,
                  index * ITEM_WIDTH,
                  (index + 1) * ITEM_WIDTH,
                ];
                const scale = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.84, 1, 0.84],
                  extrapolate: 'clamp',
                });

                return (
                  <Animated.View style={[styles.cardWrap, { transform: [{ scale }] }]}>
                    <CharacterCard
                      character={item}
                      unlocked={unlocked}
                      selected={selected}
                      onSelect={() => setSelectedLevel(item.id)}
                    />
                  </Animated.View>
                );
              }}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 캐릭터"
              hitSlop={8}
              onPress={() => scrollToIndex(activeIndex - 1)}
              style={[styles.arrow, styles.arrowLeft]}>
              <ArrowIcon size={22} direction="left" color={activeIndex === 0 ? '#DADDE1' : gray} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 캐릭터"
              hitSlop={8}
              onPress={() => scrollToIndex(activeIndex + 1)}
              style={[styles.arrow, styles.arrowRight]}>
              <ArrowIcon
                size={22}
                direction="right"
                color={activeIndex === CHARACTERS.length - 1 ? '#DADDE1' : gray}
              />
            </Pressable>
          </View>

          <View style={styles.dots}>
            {CHARACTERS.map((character, index) => (
              <View key={character.id} style={[styles.dot, index === activeIndex && styles.dotActive]} />
            ))}
          </View>

          {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CharacterCard({
  character,
  unlocked,
  selected,
  onSelect,
}: {
  character: Whale;
  unlocked: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardImageWrap, !unlocked && styles.cardImageWrapLocked]}>
        {unlocked ? (
          <Image source={character.image} style={styles.cardWhale} contentFit="contain" />
        ) : (
          <>
            <Image source={LOCKED_WHALE_IMAGE} style={styles.cardWhale} contentFit="contain" tintColor="#D2D5DA" />
            <View style={styles.lockIconWrap}>
              <Ionicons name="lock-closed" size={44} color="#7A7E85" />
            </View>
          </>
        )}
      </View>

      <View style={styles.cardLevelRow}>
        <Text style={styles.cardLevelLabel}>친밀도</Text>
        <Text style={styles.cardLevelValue}>{character.id}단계</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unlocked ? `${character.id}단계 캐릭터 선택` : '잠긴 캐릭터'}
        disabled={!unlocked}
        onPress={onSelect}
        style={({ pressed }) => [
          styles.selectButton,
          !unlocked && styles.selectButtonLocked,
          unlocked && selected && styles.selectButtonSelected,
          pressed && unlocked && styles.pressed,
        ]}>
        <Text
          style={[
            styles.selectButtonText,
            !unlocked && styles.selectButtonTextLocked,
            unlocked && selected && styles.selectButtonTextSelected,
          ]}>
          {selected && unlocked ? '선택됨' : '선택하기'}
        </Text>
      </Pressable>
    </View>
  );
}

function FieldRow({
  label,
  count,
  multiline = false,
  children,
}: {
  label: string;
  count: string;
  multiline?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.fieldRow, multiline && styles.multilineFieldRow]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.fieldBox, multiline && styles.descriptionBox]}>
        {children}
        <Text style={styles.countText}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardAvoiding: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: background,
  },
  content: {
    paddingBottom: 112,
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  headerSide: {
    minWidth: 48,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerSaveSide: {
    alignItems: 'flex-end',
  },
  title: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  saveText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  profileImageArea: {
    marginTop: 26,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  profileImage: {
    width: 84,
    height: 84,
    borderRadius: 48,
    backgroundColor: lightGray,
  },
  cameraButton: {
    position: 'absolute',
    right: '50%',
    bottom: 0,
    marginRight: -48,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#B7BBC2',
    borderWidth: 2,
    borderColor: white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageMenu: {
    position: 'absolute',
    top: 90,
    left: '50%',
    marginLeft: 20,
    minWidth: 86,
    backgroundColor: white,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 30,
  },
  imageMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  imageMenuItemPressed: {
    backgroundColor: background,
  },
  imageMenuText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    marginTop: 30,
    paddingHorizontal: 24,
    gap: 10,
  },
  fieldRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  multilineFieldRow: {
    alignItems: 'flex-start',
  },
  label: {
    width: 44,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldBox: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: white,
    justifyContent: 'center',
    paddingLeft: 14,
    paddingRight: 12,
  },
  descriptionBox: {
    height: 120,
    paddingTop: 12,
    justifyContent: 'flex-start',
  },
  input: {
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 18,
    padding: 0,
  },
  descriptionInput: {
    minHeight: 72,
    paddingRight: 40,
  },
  countText: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  characterTitle: {
    marginTop: 26,
    paddingHorizontal: 24,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  carouselWrap: {
    marginTop: 16,
    justifyContent: 'center',
  },
  carouselContent: {
    alignItems: 'flex-end',
  },
  cardWrap: {
    transformOrigin: '50% 100%',
  },
  card: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_SPACING,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: white,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    shadowColor: '#3C4446',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardImageWrap: {
    width: '100%',
    height: 130,
    borderRadius: 10,
    backgroundColor: background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageWrapLocked: {
    backgroundColor: lightGray,
  },
  cardWhale: {
    width: '72%',
    height: '72%',
  },
  lockIconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLevelRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cardLevelLabel: {
    color: gray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  cardLevelValue: {
    color: darkGray,
    fontFamily: FontFamily.pretendardBold,
    fontSize: 17,
    lineHeight: 22,
  },
  selectButton: {
    marginTop: 16,
    width: 90,
    height: 40,
    borderRadius: 23,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectButtonSelected: {
    backgroundColor: primary,
  },
  selectButtonLocked: {
    backgroundColor: '#C4C4C4',
  },
  selectButtonText: {
    color: white,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 20,
  },
  selectButtonTextSelected: {
    color: white,
  },
  selectButtonTextLocked: {
    color: white,
  },
  arrow: {
    position: 'absolute',
    top: 88,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: 56,
  },
  arrowRight: {
    right: 56,
  },
  dots: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#DADDE1',
  },
  dotActive: {
    backgroundColor: primary,
  },
  errorText: {
    marginTop: 16,
    paddingHorizontal: 24,
    color: '#D04444',
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
