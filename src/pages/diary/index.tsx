import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { ConfirmModal } from '@/components/confirm-modal';
import { background, darkGray, FontFamily, FontSize, gray, lightGray, primary, red, white } from '@/constants/theme';
import {
  createDiaryCategory,
  deleteDiaryCategory,
  fetchDiaryCategoriesWithStatsByUserId,
  fetchDiaryEntriesByUserId,
  updateDiaryCategory,
  type DiaryCategory,
  type DiaryEntry,
} from '@/src/services/diary';
import { fetchCurrentUser } from '@/src/services/users';

const MAX_CATEGORY_NAME_LENGTH = 20;

/** 폴더에 걸린 대표 이미지의 uri. 수정 시트에서 기존 썸네일을 보여주는 데 쓴다. */
function getCategoryImageUri(image: DiaryCategory['image']): string | null {
  if (image && typeof image === 'object' && 'uri' in image && typeof image.uri === 'string') {
    return image.uri;
  }

  return null;
}

const WEEK_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

type CalendarDay = number | null;

function getCalendarWeeks(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: CalendarDay[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
}

function CalendarIcon() {
  return (
    <Svg width={16} height={17} viewBox="0 0 16 17" fill="none">
      <Path
        d="M11.75 0.5V4.05556M4.25 0.5V4.05556M0.5 7.61111H15.5M2.375 2.27778H13.625C14.6605 2.27778 15.5 3.07372 15.5 4.05556V14.7222C15.5 15.7041 14.6605 16.5 13.625 16.5H2.375C1.33947 16.5 0.5 15.7041 0.5 14.7222V4.05556C0.5 3.07372 1.33947 2.27778 2.375 2.27778Z"
        stroke={gray}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 카테고리 썸네일 자리(빈 상태)에 놓는 이미지 업로드 아이콘. */
function ImageUploadIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 20 20" fill="none">
      <Path
        d="M16.186 11.4265C15.9335 11.4265 15.6913 11.5269 15.5128 11.7055C15.3342 11.8842 15.2339 12.1265 15.2339 12.3791V12.7411L13.8248 11.3313C13.3272 10.8374 12.6547 10.5603 11.9538 10.5603C11.253 10.5603 10.5805 10.8374 10.0829 11.3313L9.41645 11.9981L7.0552 9.63563C6.55069 9.15514 5.88082 8.88716 5.18428 8.88716C4.48775 8.88716 3.81788 9.15514 3.31337 9.63563L1.90424 11.0455V5.71089C1.90424 5.45825 2.00455 5.21595 2.18311 5.0373C2.36166 4.85865 2.60384 4.75829 2.85635 4.75829H9.52118C9.7737 4.75829 10.0159 4.65792 10.1944 4.47927C10.373 4.30062 10.4733 4.05833 10.4733 3.80568C10.4733 3.55303 10.373 3.31073 10.1944 3.13208C10.0159 2.95343 9.7737 2.85307 9.52118 2.85307H2.85635C2.0988 2.85307 1.37228 3.15416 0.836607 3.69011C0.300937 4.22605 0 4.95295 0 5.71089V17.1422C0 17.9001 0.300937 18.627 0.836607 19.163C1.37228 19.6989 2.0988 20 2.85635 20H14.2818C15.0393 20 15.7658 19.6989 16.3015 19.163C16.8372 18.627 17.1381 17.9001 17.1381 17.1422V12.3791C17.1381 12.1265 17.0378 11.8842 16.8593 11.7055C16.6807 11.5269 16.4385 11.4265 16.186 11.4265ZM2.85635 18.0948C2.60384 18.0948 2.36166 17.9944 2.18311 17.8158C2.00455 17.6371 1.90424 17.3948 1.90424 17.1422V13.7414L4.66538 10.9788C4.80526 10.8454 4.99106 10.7711 5.18428 10.7711C5.3775 10.7711 5.56331 10.8454 5.70319 10.9788L8.7214 13.9986L12.8155 18.0948H2.85635ZM15.2339 17.1422C15.2325 17.3245 15.1724 17.5016 15.0625 17.6471L10.7685 13.3317L11.4349 12.6649C11.5032 12.5952 11.5847 12.5398 11.6746 12.502C11.7645 12.4642 11.8611 12.4448 11.9586 12.4448C12.0561 12.4448 12.1527 12.4642 12.2426 12.502C12.3325 12.5398 12.414 12.5952 12.4823 12.6649L15.2339 15.437V17.1422ZM19.7184 3.12933L16.862 0.271506C16.7715 0.18478 16.6647 0.116797 16.5478 0.0714584C16.316 -0.0238195 16.056 -0.0238195 15.8242 0.0714584C15.7073 0.116797 15.6006 0.18478 15.51 0.271506L12.6536 3.12933C12.5649 3.21815 12.4945 3.32359 12.4464 3.43964C12.3984 3.55569 12.3736 3.68007 12.3736 3.80568C12.3736 4.05936 12.4744 4.30265 12.6536 4.48203C12.8329 4.66141 13.0761 4.76218 13.3297 4.76218C13.5832 4.76218 13.8264 4.66141 14.0057 4.48203L15.2339 3.24364V8.56871C15.2339 8.82136 15.3342 9.06366 15.5128 9.24231C15.6913 9.42096 15.9335 9.52132 16.186 9.52132C16.4385 9.52132 16.6807 9.42096 16.8593 9.24231C17.0378 9.06366 17.1381 8.82136 17.1381 8.56871V3.24364L18.3664 4.48203C18.4549 4.57132 18.5602 4.64218 18.6762 4.69055C18.7922 4.73891 18.9167 4.76381 19.0424 4.76381C19.1681 4.76381 19.2925 4.73891 19.4085 4.69055C19.5245 4.64218 19.6299 4.57132 19.7184 4.48203C19.8076 4.39347 19.8784 4.28811 19.9268 4.17203C19.9751 4.05594 20 3.93143 20 3.80568C20 3.67992 19.9751 3.55541 19.9268 3.43933C19.8784 3.32324 19.8076 3.21788 19.7184 3.12933Z"
        fill={gray}
      />
    </Svg>
  );
}

function FolderIcon() {
  return (
    <Svg width={72} height={40} viewBox="0 0 72 40" fill="none">
      <Path
        d="M0 3.52564C0 1.57849 1.57848 0 3.52564 0H29.154C29.9797 0 30.7793 0.289836 31.4132 0.818969L37.4866 5.88832C38.1205 6.41745 38.92 6.70729 39.7458 6.70729H68.4744C70.4215 6.70729 72 8.28577 72 10.2329V36.4744C72 38.4215 70.4215 40 68.4744 40H3.52564C1.57848 40 0 38.4215 0 36.4744L0 3.52564Z"
        fill="url(#folderGradient)"
      />
      <Defs>
        <LinearGradient id="folderGradient" x1="36" y1="0" x2="36" y2="31.2727" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#B1E6FF" stopOpacity={0.6} />
          <Stop offset="1" stopColor="#B1E6FF" />
        </LinearGradient>
      </Defs>
    </Svg>
  );
}

export default function DiaryPage() {
  const router = useRouter();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [failedDiaryImages, setFailedDiaryImages] = useState<Record<number, boolean>>({});
  // 사진이 실제로 그려졌는지. 그려지기 전까지는 날짜 글씨가 흰 배경에 흰색으로 겹쳐
  // 보이지 않으므로, 로드 완료 전에는 셀에 배경색을 깔아 둔다.
  const [loadedDiaryImages, setLoadedDiaryImages] = useState<Record<number, boolean>>({});
  const [failedCategoryImages, setFailedCategoryImages] = useState<Record<string, boolean>>({});
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [diaryCategories, setDiaryCategories] = useState<DiaryCategory[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryImage, setNewCategoryImage] = useState<string | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  /** 수정 중인 카테고리. null 이면 시트는 '새 카테고리'로 동작한다. */
  const [editingCategory, setEditingCategory] = useState<DiaryCategory | null>(null);
  // 수정 시트는 기존 썸네일을 미리 보여준다. 새로 고르지 않았으면 다시 올리지 않는다.
  const [isCategoryImageChanged, setIsCategoryImageChanged] = useState(false);
  const [menuCategory, setMenuCategory] = useState<DiaryCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiaryCategory | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  const weeks = useMemo(() => getCalendarWeeks(selectedYear, selectedMonth), [selectedMonth, selectedYear]);
  const entriesByDay = useMemo(() => new Map(diaryEntries.map((entry) => [entry.day, entry])), [diaryEntries]);

  // 탭 화면은 한 번 뜨면 계속 마운트된 채로 남는다. 글을 쓰고 보관함 탭을 눌러
  // 돌아왔을 때 방금 쓴 글이 달력에 찍히도록, 포커스될 때마다 다시 받아온다.
  useFocusEffect(
    useCallback(() => {
      setReloadKey((key) => key + 1);
    }, []),
  );

  // 달을 옮길 때만 비운다. 포커스마다 비우면 탭을 옮길 때마다 달력이 한 번씩
  // 깜빡이므로, 다시 받아온 결과로 통째로 교체한다.
  useEffect(() => {
    setDiaryEntries([]);
    setFailedDiaryImages({});
    setLoadedDiaryImages({});
  }, [selectedMonth, selectedYear]);

  // 카테고리는 전체 기간 기준이라 월을 바꿀 때는 다시 요청하지 않는다. 화면에
  // 돌아오거나 카테고리를 바꾼 경우(reloadKey)에만 최신 목록·게시물 수를 받는다.
  useEffect(() => {
    let isMounted = true;

    fetchCurrentUser()
      .then((user) => {
        if (!isMounted || !user) {
          return;
        }

        setUserId(user.id);
        return fetchDiaryCategoriesWithStatsByUserId(user.id);
      })
      .then((categories) => {
        if (!isMounted || !categories) {
          return;
        }

        setFailedCategoryImages({});
        setDiaryCategories(categories);
      })
      .catch((error) => {
        console.warn('[diary] Failed to load categories', error);
      });

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  // 달력 칸은 선택한 월에 맞춰 별도로 갱신한다.
  useEffect(() => {
    if (!userId) {
      return;
    }

    let isMounted = true;

    fetchDiaryEntriesByUserId(userId, selectedYear, selectedMonth)
      .then((entries) => {
        if (isMounted) {
          setDiaryEntries(entries);
        }
      })
      .catch((error) => {
        console.warn('[diary] Failed to load calendar entries', error);
      });

    return () => {
      isMounted = false;
    };
  }, [userId, selectedMonth, selectedYear, reloadKey]);

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setNewCategoryName('');
    setNewCategoryImage(null);
    setEditingCategory(null);
    setIsCategoryImageChanged(false);
  };

  const openCreateCategory = () => {
    setEditingCategory(null);
    setNewCategoryName('');
    setNewCategoryImage(null);
    setIsCategoryImageChanged(false);
    setIsCategoryModalOpen(true);
  };

  const openEditCategory = (category: DiaryCategory) => {
    setMenuCategory(null);
    setEditingCategory(category);
    setNewCategoryName(category.title);
    setNewCategoryImage(getCategoryImageUri(category.image));
    setIsCategoryImageChanged(false);
    setIsCategoryModalOpen(true);
  };

  const handlePickCategoryImage = async () => {
    if (isCreatingCategory) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    // 폴더 안에 정사각형에 가깝게 들어가므로 1:1 로 잘라 받는다.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    setNewCategoryImage(result.assets[0].uri);
    setIsCategoryImageChanged(true);
  };

  const handleSubmitCategory = async () => {
    const title = newCategoryName.trim();
    if (!title || !userId || isCreatingCategory) {
      return;
    }

    setIsCreatingCategory(true);

    try {
      if (editingCategory) {
        await updateDiaryCategory(
          userId,
          editingCategory.title,
          title,
          // 사진을 새로 고르지 않았으면 기존 썸네일을 그대로 둔다.
          isCategoryImageChanged ? newCategoryImage : null,
        );
      } else {
        await createDiaryCategory(userId, title, newCategoryImage);
      }

      closeCategoryModal();
      setReloadKey((key) => key + 1);
    } catch (error) {
      const fallback = editingCategory ? '카테고리를 수정하지 못했어요.' : '카테고리를 추가하지 못했어요.';
      Alert.alert(editingCategory ? '수정 실패' : '등록 실패', error instanceof Error ? error.message : fallback);
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteTarget || isDeletingCategory) {
      return;
    }

    setIsDeletingCategory(true);

    try {
      await deleteDiaryCategory(deleteTarget.title);
      setDeleteTarget(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      setDeleteTarget(null);
      Alert.alert('삭제 실패', error instanceof Error ? error.message : '카테고리를 삭제하지 못했어요.');
    } finally {
      setIsDeletingCategory(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.calendarHeader}>
          <Text style={styles.yearText}>{selectedYear}</Text>
          <View style={styles.monthRow}>
            <Text style={styles.monthText}>{MONTH_LABELS[selectedMonth]}</Text>
            <Pressable
              style={styles.calendarButton}
              accessibilityRole="button"
              accessibilityLabel="월 선택"
              onPress={() => setIsMonthPickerOpen(true)}>
              <CalendarIcon />
            </Pressable>
          </View>
        </View>

        <View style={styles.weekRow}>
          {WEEK_DAYS.map((day) => (
            <Text key={day} style={styles.weekText}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {weeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.calendarWeek}>
              {week.map((day, dayIndex) => {
                const entry = day ? entriesByDay.get(day) : undefined;
                const hasFailedDiaryImage = day ? failedDiaryImages[day] : false;
                const photoSource = entry?.hasPhoto && entry.image && !hasFailedDiaryImage ? entry.image : undefined;
                // 사진 칸인데 아직 안 그려졌으면(로딩·실패) 배경을 깔아 날짜가 보이게 한다.
                const needsPhotoBackdrop = Boolean(entry?.hasPhoto) && !(day && loadedDiaryImages[day]);

                return (
                  <View key={`${day ?? 'empty'}-${weekIndex}-${dayIndex}`} style={styles.dayCell}>
                    {day ? (
                      // 글을 쓴 날만 눌린다. 누르면 피드에서 그 글로 데려간다.
                      <Pressable
                        accessibilityRole={entry ? 'button' : undefined}
                        accessibilityLabel={entry ? `${selectedMonth + 1}월 ${day}일 기록 보기` : undefined}
                        disabled={!entry}
                        onPress={() =>
                          entry &&
                          router.navigate({
                            pathname: '/(tabs)/home',
                            params: { postId: entry.postId },
                          })
                        }
                        style={({ pressed }) => [
                          styles.dayContent,
                          entry && !entry.hasPhoto ? styles.textDiaryCell : undefined,
                          needsPhotoBackdrop ? styles.photoFallbackCell : undefined,
                          pressed && entry ? styles.pressed : undefined,
                        ]}>
                        {photoSource ? (
                          <Image
                            source={photoSource}
                            style={styles.dayImage}
                            blurRadius={8}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={120}
                            onLoad={() => setLoadedDiaryImages((prev) => ({ ...prev, [day]: true }))}
                            onError={() => setFailedDiaryImages((prev) => ({ ...prev, [day]: true }))}
                          />
                        ) : null}
                        <Text style={[styles.dayText, entry ? styles.activeDayText : undefined]}>{day}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
              </View>
          ))}
        </View>

        <View style={styles.categorySection}>
          <View style={styles.categoryHeaderRow}>
            <Text style={styles.categoryTitle}>Category</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="새 카테고리 추가"
              hitSlop={10}
              onPress={openCreateCategory}
              style={({ pressed }) => [styles.addCategoryButton, pressed && styles.pressed]}>
              <Ionicons name="add" size={24} color={darkGray} />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            contentContainerStyle={styles.categoryList}
            showsHorizontalScrollIndicator={false}>
            {diaryCategories.map((category) => {
              const showImage = category.image && !failedCategoryImages[category.id];

              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${category.title} 카테고리`}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/diary/category',
                      params: {
                        categoryId: category.id,
                        categoryTitle: category.title,
                      },
                    })
                  }
                  // '전체'는 실제 폴더가 아니라 모아 보기라서 고치거나 지울 수 없다.
                  onLongPress={category.id === 'all' ? undefined : () => setMenuCategory(category)}
                  delayLongPress={300}
                  style={styles.categoryItem}>
                  <View style={styles.folderStack}>
                    <View style={styles.folderBack} />
                    {showImage ? (
                      <Image
                        source={category.image}
                        style={styles.folderImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={120}
                        onError={() => setFailedCategoryImages((prev) => ({ ...prev, [category.id]: true }))}
                      />
                    ) : (
                      // 대표 사진이 없으면(글이 없거나 사진 없는 글만 있는 경우)
                      // 회색 사각형 대신 아무것도 그리지 않아 빈 폴더처럼 보이게 한다.
                      null
                    )}
                    <View style={styles.folderOverlay}>
                      <FolderIcon />
                    </View>
                  </View>
                  <Text style={styles.categoryName} numberOfLines={1}>
                    {category.title}
                  </Text>
                  <Text style={styles.postCount}>{category.postCount} posts</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>

      <Modal
        visible={isMonthPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMonthPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setIsMonthPickerOpen(false)}>
          <Pressable style={styles.monthPickerCard}>
            <View style={styles.monthPickerHeader}>
              <Pressable
                style={styles.yearButton}
                accessibilityRole="button"
                accessibilityLabel="이전 연도"
                onPress={() => setSelectedYear((prev) => prev - 1)}>
                <Text style={styles.yearButtonText}>‹</Text>
              </Pressable>
              <Text style={styles.monthPickerYear}>{selectedYear}</Text>
              <Pressable
                style={styles.yearButton}
                accessibilityRole="button"
                accessibilityLabel="다음 연도"
                onPress={() => setSelectedYear((prev) => prev + 1)}>
                <Text style={styles.yearButtonText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.monthPickerGrid}>
              {MONTH_LABELS.map((month, index) => (
                <Pressable
                  key={month}
                  style={[styles.monthOption, index === selectedMonth ? styles.selectedMonthOption : undefined]}
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedMonth(index);
                    setIsMonthPickerOpen(false);
                  }}>
                  <Text style={[styles.monthOptionText, index === selectedMonth ? styles.selectedMonthOptionText : undefined]}>
                    {month}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isCategoryModalOpen}
        transparent
        animationType="slide"
        onRequestClose={closeCategoryModal}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={closeCategoryModal} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetKeyboardAvoiding}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="닫기"
                  hitSlop={10}
                  onPress={closeCategoryModal}
                  style={styles.sheetBackButton}>
                  <Ionicons name="arrow-back" size={24} color={darkGray} />
                </Pressable>
                <Text style={styles.sheetTitle}>{editingCategory ? '카테고리 수정' : '새 카테고리'}</Text>
                <View style={styles.sheetHeaderSpacer} />
              </View>
              <View style={styles.sheetDivider} />

              <View style={styles.sheetBody}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    newCategoryImage ? '카테고리 이미지 변경' : '카테고리 이미지 선택'
                  }
                  disabled={isCreatingCategory}
                  onPress={() => {
                    void handlePickCategoryImage();
                  }}
                  style={({ pressed }) => [styles.thumbnailPicker, pressed && styles.pressed]}>
                  {newCategoryImage ? (
                    <Image
                      source={{ uri: newCategoryImage }}
                      style={styles.thumbnailImage}
                      contentFit="cover"
                      transition={120}
                    />
                  ) : (
                    <ImageUploadIcon />
                  )}
                </Pressable>

                <TextInput
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="카테고리명"
                  placeholderTextColor={gray}
                  style={styles.categoryInput}
                  maxLength={MAX_CATEGORY_NAME_LENGTH}
                  returnKeyType="done"
                  autoFocus
                  onSubmitEditing={() => {
                    void handleSubmitCategory();
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={editingCategory ? '수정하기' : '등록하기'}
                  disabled={!newCategoryName.trim() || isCreatingCategory}
                  onPress={() => {
                    void handleSubmitCategory();
                  }}
                  style={({ pressed }) => [
                    styles.submitButton,
                    (!newCategoryName.trim() || isCreatingCategory) && styles.submitButtonDisabled,
                    pressed && styles.pressed,
                  ]}>
                  {isCreatingCategory ? (
                    <ActivityIndicator color={white} />
                  ) : (
                    <Text style={styles.submitButtonText}>{editingCategory ? '수정하기' : '등록하기'}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 폴더를 길게 누르면 뜨는 수정·삭제 메뉴 */}
      <Modal
        visible={menuCategory !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuCategory(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuCategory(null)}>
          <Pressable style={styles.categoryMenuCard}>
            <Text style={styles.categoryMenuTitle} numberOfLines={1}>
              {menuCategory?.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="카테고리 수정"
              onPress={() => menuCategory && openEditCategory(menuCategory)}
              style={({ pressed }) => [styles.categoryMenuItem, pressed && styles.pressed]}>
              <Text style={styles.categoryMenuText}>수정</Text>
            </Pressable>
            <View style={styles.categoryMenuDivider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="카테고리 삭제"
              onPress={() => {
                setDeleteTarget(menuCategory);
                setMenuCategory(null);
              }}
              style={({ pressed }) => [styles.categoryMenuItem, pressed && styles.pressed]}>
              <Text style={[styles.categoryMenuText, styles.categoryMenuTextDanger]}>삭제</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={deleteTarget !== null}
        title={`'${deleteTarget?.title ?? ''}' 카테고리를 삭제할까요?`}
        message="폴더만 없어지고, 안에 있던 글은 '전체'에 그대로 남아요."
        confirmLabel="삭제"
        destructive
        isPending={isDeletingCategory}
        onConfirm={() => {
          void handleDeleteCategory();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  categoryMenuCard: {
    width: 220,
    borderRadius: 12,
    backgroundColor: white,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  categoryMenuTitle: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    color: gray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  categoryMenuItem: {
    height: 46,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  categoryMenuText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 15,
  },
  categoryMenuTextDanger: {
    color: red,
  },
  categoryMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: lightGray,
  },
  safeArea: {
    flex: 1,
    backgroundColor: background,
  },
  screen: {
    flex: 1,
    backgroundColor: background,
  },
  content: {
    paddingBottom: 96,
  },
  calendarHeader: {
    alignItems: 'center',
    paddingTop: 78,
    paddingBottom: 22,
  },
  yearText: {
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 10,
    lineHeight: 12,
  },
  monthRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  monthText: {
    color: '#000000',
    fontFamily: FontFamily.pretendardBold,
    fontSize: 20,
    lineHeight: 24,
  },
  calendarButton: {
    position: 'absolute',
    left: '50%',
    marginLeft: 28,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekText: {
    width: `${100 / 7}%`,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
    paddingVertical: 4,
    backgroundColor: white,
  },
  calendarGrid: {
    backgroundColor: white,
  },
  calendarWeek: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
  },
  dayContent: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#EDF1F3',
    borderRadius: 12,
    backgroundColor: white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textDiaryCell: {
    borderWidth: 0,
    backgroundColor: primary,
  },
  photoFallbackCell: {
    borderWidth: 0,
    backgroundColor: '#B1B1B1',
  },
  dayImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    borderRadius: 12,
    opacity: 1,
  },
  dayText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: FontSize.base,
    lineHeight: 14,
  },
  activeDayText: {
    color: white,
    // 밝은 사진 위에서도 날짜가 묻히지 않게 한다.
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  categorySection: {
    marginTop: 30,
    paddingTop: 24,
    paddingBottom: 30,
    backgroundColor: background,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  categoryTitle: {
    color: darkGray,
    fontFamily: FontFamily.pretendardBold,
    fontSize: 16,
    lineHeight: 20,
  },
  addCategoryButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  sheetKeyboardAvoiding: {
    width: '100%',
  },
  sheet: {
    backgroundColor: white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  sheetHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  sheetBackButton: {
    width: 32,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sheetTitle: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  sheetHeaderSpacer: {
    width: 32,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E8ECEE',
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 20,
  },
  thumbnailPicker: {
    width: 132,
    height: 132,
    borderRadius: 12,
    backgroundColor: lightGray,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  categoryInput: {
    height: 44,
    borderRadius: 26,
    backgroundColor: background,
    paddingHorizontal: 22,
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 15,
  },
  submitButton: {
    height: 36,
    borderRadius: 6,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: white,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 20,
  },
  categoryList: {
    gap: 32,
    paddingHorizontal: 22,
    paddingTop: 26,
  },
  categoryItem: {
    width: 72,
    alignItems: 'center',
  },
  folderStack: {
    width: 72,
    height: 58,
  },
  folderBack: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 72,
    height: 52,
    borderRadius: 4,
    backgroundColor: '#B1E6FF',
  },
  folderImage: {
    position: 'absolute',
    top: 0,
    left: 9,
    width: 55,
    height: 52,
    borderRadius: 5,
  },
  folderOverlay: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    borderRadius: 3.53,
    shadowColor: '#557788',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  categoryName: {
    width: 86,
    marginTop: 10,
    color: '#111111',
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    lineHeight: 12,
    textAlign: 'center',
  },
  postCount: {
    marginTop: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
    backgroundColor: lightGray,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 8,
    lineHeight: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  monthPickerCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    backgroundColor: white,
    padding: 20,
  },
  monthPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  yearButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearButtonText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardBold,
    fontSize: 24,
    lineHeight: 28,
  },
  monthPickerYear: {
    color: darkGray,
    fontFamily: FontFamily.pretendardBold,
    fontSize: 18,
    lineHeight: 22,
  },
  monthPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthOption: {
    width: '30.8%',
    height: 42,
    borderRadius: 12,
    backgroundColor: background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedMonthOption: {
    backgroundColor: primary,
  },
  monthOptionText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 13,
    lineHeight: 16,
  },
  selectedMonthOptionText: {
    color: white,
  },
});
