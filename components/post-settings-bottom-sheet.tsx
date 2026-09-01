import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  darkGray,
  FontFamily,
  gray,
  lightGray,
  primary,
  white,
} from '@/constants/theme';
import { useCurrentUserId } from '@/hooks/use-current-user-id';
import { fetchDiaryCategories } from '@/src/services/diary';

/** 카테고리를 고르지 않은 상태. 저장 시 null 로 들어가 '전체'에만 묶인다. */
const NO_CATEGORY = '전체';
const CATEGORY_SELECTED_BG = '#D4F1FF';
const ITEM_HEIGHT = 31;

type Visibility = 'public' | 'private';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (category: string, visibility: Visibility) => void;
  /** 등록 처리 중 — 버튼을 잠가 중복 등록을 막는다 */
  isSubmitting?: boolean;
  /** 수정 화면에서 기존 값을 채워 넣을 때 사용 */
  initialCategory?: string | null;
  initialVisibility?: Visibility;
  submitLabel?: string;
};

export function PostSettingsBottomSheet({
  visible,
  onClose,
  onSubmit,
  isSubmitting = false,
  initialCategory = null,
  initialVisibility = 'public',
  submitLabel = '등록하기',
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDropdownMounted, setIsDropdownMounted] = useState(false);
  const dropdownAnim = useRef(new Animated.Value(0)).current;

  const currentUserId = useCurrentUserId();
  const [myCategories, setMyCategories] = useState<string[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // 내가 만든 카테고리(diary_categories)를 시트가 열릴 때마다 새로 받아온다.
  // 보관함에서 카테고리를 추가하고 바로 글을 쓰는 흐름을 지원해야 한다.
  useEffect(() => {
    if (!visible || !currentUserId) {
      return;
    }

    let isMounted = true;
    setIsLoadingCategories(true);

    fetchDiaryCategories(currentUserId)
      .then((titles) => {
        if (isMounted) {
          setMyCategories(titles);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingCategories(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [visible, currentUserId]);

  // 수정 중인 글의 카테고리가 목록에서 사라졌더라도 선택지에는 남겨 둔다.
  // (그렇지 않으면 저장할 때 조용히 다른 값으로 바뀐다)
  const categoryOptions = useMemo(() => {
    const existing = initialCategory?.trim();
    const titles = existing && !myCategories.includes(existing)
      ? [...myCategories, existing]
      : myCategories;

    return [NO_CATEGORY, ...titles.filter((title) => title !== NO_CATEGORY)];
  }, [initialCategory, myCategories]);

  const openDropdown = () => {
    setIsDropdownMounted(true);
    setIsDropdownOpen(true);
    Animated.timing(dropdownAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  };

  const closeDropdown = (callback?: () => void) => {
    setIsDropdownOpen(false);
    Animated.timing(dropdownAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) {
          setIsDropdownMounted(false);
          callback?.();
        }
      }
    );
  };

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    closeDropdown();
  };

  useEffect(() => {
    if (visible) {
      // 열릴 때마다 기존 값으로 맞춘다. 수정 화면에서 저장된 설정이 보여야 한다.
      // (카테고리 없음 = '전체')
      setSelectedCategory(initialCategory?.trim() || NO_CATEGORY);
      setVisibility(initialVisibility);
      setIsModalVisible(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      setIsDropdownOpen(false);
      setIsDropdownMounted(false);
      dropdownAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 600,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setIsModalVisible(false);
      });
    }
  }, [visible]);

  return (
    <Modal transparent visible={isModalVisible} animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 30, transform: [{ translateY: slideAnim }] },
          ]}>

          {/* Header: 뒤로가기 + "게시글 설정" */}
          <View style={styles.headerSection}>
            <View style={styles.header}>
              <Pressable onPress={onClose} hitSlop={8}>
                <BackArrowIcon />
              </Pressable>
              <Text style={styles.title}>게시글 설정</Text>
            </View>
            <View style={styles.divider} />
          </View>

          {/* 설정 영역 */}
          <View style={styles.settingsSection}>

            {/* 카테고리 */}
            <View style={[styles.settingRow, styles.dropdownRow]}>
              <Text style={styles.settingLabel}>카테고리</Text>
              <View style={styles.dropdownContainer}>
                <Pressable
                  style={styles.dropdownTrigger}
                  onPress={() => (isDropdownOpen ? closeDropdown() : openDropdown())}>
                  <Text style={styles.dropdownValue}>{selectedCategory}</Text>
                  <ChevronIcon rotated={isDropdownOpen} />
                </Pressable>
                {isDropdownMounted && (
                  <Animated.View style={[styles.dropdownList, { opacity: dropdownAnim }]}>
                    {isLoadingCategories && myCategories.length === 0 ? (
                      <View style={styles.dropdownItem}>
                        <ActivityIndicator size="small" color={primary} />
                      </View>
                    ) : null}
                    {categoryOptions.map((cat) => (
                      <Pressable
                        key={cat}
                        style={[
                          styles.dropdownItem,
                          selectedCategory === cat && styles.dropdownItemSelected,
                        ]}
                        onPress={() => handleCategorySelect(cat)}>
                        <Text style={styles.dropdownItemText}>{cat}</Text>
                      </Pressable>
                    ))}
                  </Animated.View>
                )}
              </View>
            </View>

            {/* 공개설정 */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>공개설정</Text>
              <View style={styles.radioGroup}>
                <Pressable style={styles.radioOption} onPress={() => setVisibility('public')}>
                  <RadioButton selected={visibility === 'public'} />
                  <Text style={styles.radioLabel}>전체공개</Text>
                </Pressable>
                <Pressable style={styles.radioOption} onPress={() => setVisibility('private')}>
                  <RadioButton selected={visibility === 'private'} />
                  <Text style={styles.radioLabel}>비공개</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* 등록하기 버튼 */}
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              (pressed || isSubmitting) && styles.submitButtonPressed,
            ]}
            disabled={isSubmitting}
            onPress={() => onSubmit(selectedCategory, visibility)}>
            {isSubmitting ? (
              <ActivityIndicator size="small" color={white} />
            ) : (
              <Text style={styles.submitText}>{submitLabel}</Text>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function RadioButton({ selected }: { selected: boolean }) {
  return (
    <View style={styles.radioOuter}>
      {selected && <View style={styles.radioInner} />}
    </View>
  );
}

function BackArrowIcon() {
  return (
    <Svg width={16} height={12} viewBox="0 0 16 12" fill="none">
      <Path
        d="M15 6H1M1 6L6 1M1 6L6 11"
        stroke={darkGray}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronIcon({ rotated }: { rotated: boolean }) {
  return (
    <View style={rotated ? styles.chevronRotated : undefined}>
      <Svg width={10} height={6} viewBox="0 0 10 6" fill="none">
        <Path
          d="M1 1L5 5L9 1"
          stroke={gray}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 20,
    gap: 40,
    shadowColor: gray,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  headerSection: {
    gap: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    color: darkGray,
    marginRight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: lightGray,
  },
  settingsSection: {
    paddingHorizontal: 10,
    gap: 30,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
  },
  dropdownRow: {
    zIndex: 10,
  },
  // 고정 width 제거 → 텍스트 자연 너비 + flex shrink 방지
  settingLabel: {
    flexShrink: 0,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    color: darkGray,
  },
  dropdownContainer: {
    flex: 1,
    zIndex: 10,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: ITEM_HEIGHT,           // 아이템 높이와 동일하게
    borderWidth: 1,
    borderColor: gray,
    borderRadius: 2,
    paddingHorizontal: 10,
    backgroundColor: white,
  },
  dropdownValue: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    color: darkGray,
  },
  dropdownList: {
    position: 'absolute',
    top: ITEM_HEIGHT,              // 트리거 바로 아래
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: gray,
    borderTopWidth: 0,             // 트리거와 이어지도록
    borderRadius: 2,
    backgroundColor: white,
    zIndex: 20,
    elevation: 5,
  },
  dropdownItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: white,
  },
  dropdownItemSelected: {
    backgroundColor: CATEGORY_SELECTED_BG,
  },
  dropdownItemText: {
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    color: darkGray,
  },

  radioGroup: {
    flexDirection: 'row',
    gap: 50,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioOuter: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1,
    borderColor: gray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: primary,
  },
  radioLabel: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    color: darkGray,
  },
  submitButton: {
    marginHorizontal: 10,
    height: 32,
    backgroundColor: primary,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonPressed: {
    opacity: 0.8,
  },
  submitText: {
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    color: white,
  },
  chevronRotated: {
    transform: [{ rotate: '180deg' }],
  },
});
