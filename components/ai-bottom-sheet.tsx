import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CrisisResource } from '@/src/services/ai';
import {
  background,
  darkGray,
  FontFamily,
  gray,
  lightGray,
  primary,
  white,
} from '@/constants/theme';

type Props = {
  visible: boolean;
  content: string;
  aiResponse: string;
  onClose: () => void;
  onRefresh: () => void;
  onApply: (text: string) => void;
  /** 한마디를 받아오는 중 */
  isLoading?: boolean;
  /** 실패했을 때 말풍선에 대신 띄울 문구 */
  errorMessage?: string | null;
  /** 자해·자살 신호가 잡힌 글이면 상담 전화 안내를 띄운다 (safety.risk_type === "self_harm") */
  showCrisisNotice?: boolean;
  /** 서버가 내려준 상담 기관. 비어 있으면 앱이 가진 기본 번호를 쓴다 */
  crisisResources?: CrisisResource[];
  /** 평가 저장 API를 연결할 때 사용한다. */
  onFeedbackSubmit?: (feedback: FeedbackPayload) => void | Promise<void>;
};

type FeedbackType = 'positive' | 'negative';
type FeedbackScreen = 'main' | FeedbackType;

export type FeedbackPayload = {
  type: FeedbackType;
  reasons: string[];
  comment: string;
};

const aiPrimary = '#69C5F1';

/**
 * 서버가 상담 기관을 안 내려줬을 때 쓰는 기본값.
 * 자살예방 상담전화는 2024년부터 109 로 통합됐고 24시간 무료다.
 */
const FALLBACK_RESOURCE: CrisisResource = {
  label: '자살예방 상담전화 109',
  phone: '109',
  url: null,
};

/** 안내가 너무 길어지지 않게 보여 줄 기관 수를 제한한다. */
const MAX_CRISIS_RESOURCES = 3;
const positiveReasons = ['듣고 싶던 말', '생각의 변화', '위안이 됨', '다정한 어조', '기타'];
const negativeReasons = ['한국어 서툶', '엉뚱한 답변', '상투적임', '사실이 아님', '불쾌함', '기타'];
const feedbackDisclaimer =
  '보내주신 피드백은 AI 모델 개선에 활용됩니다. 감사합니다.';

export function AIBottomSheet({
  visible,
  content,
  aiResponse,
  onClose,
  onRefresh,
  onApply,
  onFeedbackSubmit,
  isLoading = false,
  errorMessage = null,
  showCrisisNotice = false,
  crisisResources = [],
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(700)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const positiveButtonScale = useRef(new Animated.Value(1)).current;
  const negativeButtonScale = useRef(new Animated.Value(1)).current;
  const isContentTransitioning = useRef(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [localContent, setLocalContent] = useState(content);
  const [feedbackScreen, setFeedbackScreen] = useState<FeedbackScreen>('main');
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackType | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState('');

  useEffect(() => {
    if (visible) {
      setLocalContent(content);
      setFeedbackScreen('main');
      setSelectedFeedback(null);
      setSelectedReasons([]);
      setFeedbackComment('');
      contentOpacity.setValue(1);
      contentTranslateX.setValue(0);
      isContentTransitioning.current = false;
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
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 700,
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
  }, [content, contentOpacity, contentTranslateX, fadeAnim, slideAnim, visible]);

  const transitionContent = (nextScreen: FeedbackScreen, direction: 1 | -1) => {
    if (isContentTransitioning.current || nextScreen === feedbackScreen) return;

    isContentTransitioning.current = true;
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateX, {
        toValue: -12 * direction,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        isContentTransitioning.current = false;
        return;
      }

      setFeedbackScreen(nextScreen);
      contentOpacity.setValue(0);
      contentTranslateX.setValue(12 * direction);

      // 새 콘텐츠가 실제 네이티브 뷰에 반영된 다음 페이드인을 시작한다.
      // 두 프레임을 기다리면 TextInput과 그림자 레이어의 잔상이 남지 않는다.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          Animated.parallel([
            Animated.timing(contentOpacity, {
              toValue: 1,
              duration: 160,
              useNativeDriver: true,
            }),
            Animated.spring(contentTranslateX, {
              toValue: 0,
              tension: 100,
              friction: 14,
              useNativeDriver: true,
            }),
          ]).start(() => {
            isContentTransitioning.current = false;
          });
        });
      });
    });
  };

  const handleFeedbackPress = (type: FeedbackType) => {
    const scale = type === 'positive' ? positiveButtonScale : negativeButtonScale;
    setSelectedFeedback(type);

    Animated.sequence([
      Animated.timing(scale, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1.18, tension: 180, friction: 5, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 160, friction: 7, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setSelectedReasons([]);
      setFeedbackComment('');
      transitionContent(type, 1);
    });
  };

  const toggleReason = (reason: string) => {
    setSelectedReasons((current) =>
      current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason],
    );
  };

  const handleFeedbackSubmit = () => {
    if (feedbackScreen === 'main') return;

    const result = onFeedbackSubmit?.({
      type: feedbackScreen,
      reasons: selectedReasons,
      comment: feedbackComment.trim(),
    });

    if (result instanceof Promise) {
      result.catch((error) => console.warn('[ai] 평가 저장 실패', error));
    }

    transitionContent('main', -1);
  };

  const feedbackReasons = feedbackScreen === 'positive' ? positiveReasons : negativeReasons;
  const canSubmitFeedback = selectedReasons.length > 0 || feedbackComment.trim().length > 0;
  return (
    <Modal
      transparent
      visible={isModalVisible}
      animationType="none"
      onRequestClose={() =>
        feedbackScreen === 'main' ? onClose() : transitionContent('main', -1)
      }>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 20, transform: [{ translateY: slideAnim }] },
          ]}>
          <Animated.View
            needsOffscreenAlphaCompositing
            renderToHardwareTextureAndroid
            style={[
              styles.sheetContent,
              { opacity: contentOpacity, transform: [{ translateX: contentTranslateX }] },
            ]}>
            {/*
              시트 안 아무 데나 누르면 키보드를 내린다.

              예전에는 콘텐츠 뒤에 absoluteFill Pressable 을 깔아 뒀는데, 그러면 글자나
              여백 위를 눌렀을 때는 콘텐츠가 먼저 터치를 받아 키보드가 그대로 남았다.
              콘텐츠를 통째로 감싸면 버튼·입력창처럼 스스로 터치를 처리하는 자식은
              그대로 동작하고, 나머지 영역은 전부 이쪽으로 떨어진다.

              accessible={false} 는 이 래퍼가 스크린리더에서 하나의 버튼처럼 읽히지
              않게 하려는 것이다.
            */}
            <Pressable style={styles.dismissArea} onPress={Keyboard.dismiss} accessible={false}>
            {feedbackScreen === 'main' ? (
              <>
                {/* Header: 뒤로가기 + "고래에게 물어보기" */}
                <View style={styles.header}>
                  <Pressable onPress={onClose} hitSlop={8}>
                    <BackArrowIcon />
                  </Pressable>
                  <Text style={styles.title}>고래에게 물어보기</Text>
                </View>

                {/* 구분선 */}
                <View style={styles.divider} />

          {/* AI 응답 영역: 고래 캐릭터 + 말풍선 */}
          <View style={styles.responseSection}>
            <View style={styles.responseRow}>
              <View style={styles.characterColumn}>
                <Image
                  source={require('@/assets/icons/whale2.png')}
                  style={styles.character}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.bubbleWrapper}>
                <View style={styles.speechBubbleWrapper}>
                  <View style={styles.speechBubble}>
                    {isLoading ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color={primary} />
                        <Text style={styles.responseText}>고래가 생각하는 중이에요...</Text>
                      </View>
                    ) : (
                      <Text style={[styles.responseText, errorMessage && styles.errorText]}>
                        {errorMessage ?? aiResponse}
                      </Text>
                    )}
                  </View>
                  <Svg
                    pointerEvents="none"
                    width={16}
                    height={18}
                    viewBox="0 0 16 18"
                    style={styles.speechBubbleTail}>
                    <Path
                      d="M14.29 0.23C14.29 0.33 14.26 0.42 14.21 0.5L4.08 16.1C3.83 16.5 4.21 16.99 4.65 16.85L13.64 14C13.96 13.89 14.29 14.13 14.29 14.47V0.23Z"
                      fill="#FFF"
                    />
                  </Svg>
                </View>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Text style={styles.generatedText}>AI가 생성한 문장입니다</Text>
              <View style={styles.actionRightGroup}>
                <View style={styles.feedbackButtons}>
                  <Animated.View style={{ transform: [{ scale: positiveButtonScale }] }}>
                    <Pressable
                      style={[
                        styles.feedbackButton,
                        selectedFeedback === 'positive' && styles.feedbackButtonActive,
                      ]}
                      onPress={() => handleFeedbackPress('positive')}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="좋아요">
                      <ThumbIcon direction="up" />
                    </Pressable>
                  </Animated.View>
                  <Animated.View style={{ transform: [{ scale: negativeButtonScale }] }}>
                    <Pressable
                      style={[
                        styles.feedbackButton,
                        selectedFeedback === 'negative' && styles.feedbackButtonActive,
                      ]}
                      onPress={() => handleFeedbackPress('negative')}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="싫어요">
                      <ThumbIcon direction="down" />
                    </Pressable>
                  </Animated.View>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.refreshButton, (isLoading || pressed) && styles.dimmed]}
                  onPress={onRefresh}
                  disabled={isLoading}
                  hitSlop={8}>
                  <RefreshIcon />
                  <Text style={styles.refreshText}>{errorMessage ? '다시 시도' : '다른 한마디'}</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.actionDivider} />
          </View>

                {/* 자해·자살 신호가 잡힌 글이면 상담 전화를 안내한다 */}
                {showCrisisNotice ? <CrisisNotice resources={crisisResources} /> : null}

                {/* 작성 내용 (수정 가능, 적용하기 누를 때만 반영) */}
                <TextInput
                  style={styles.contentInput}
                  textAlignVertical="top"
                  multiline
                  maxLength={400}
                  placeholder="내용을 입력하세요."
                  placeholderTextColor={gray}
                  value={localContent}
                  onChangeText={setLocalContent}
                />

                {/* 적용하기 버튼 */}
                <Pressable
                  style={({ pressed }) => [styles.applyButton, pressed && styles.applyButtonPressed]}
                  onPress={() => onApply(localContent)}>
                  <Text style={styles.applyText}>적용하기</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.header}>
                  <Pressable
                    onPress={() => transitionContent('main', -1)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="평가 화면에서 뒤로가기">
                    <BackArrowIcon />
                  </Pressable>
                  <Text style={styles.title}>
                    {feedbackScreen === 'positive' ? '좋아요 평가' : '싫어요 평가'}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.feedbackReasonContent}>
                  <Text style={styles.feedbackQuestion}>이렇게 평가하신 이유는 무엇인가요?</Text>

                  <View style={styles.reasonChips}>
                    {feedbackReasons.map((reason) => {
                      const isSelected = selectedReasons.includes(reason);
                      return (
                        <Pressable
                          key={reason}
                          style={({ pressed }) => [
                            styles.reasonChip,
                            isSelected && styles.reasonChipSelected,
                            pressed && styles.reasonChipPressed,
                          ]}
                          onPress={() => toggleReason(reason)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}>
                          <Text style={[styles.reasonChipText, isSelected && styles.reasonChipTextSelected]}>
                            {reason}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <TextInput
                    style={styles.feedbackInput}
                    multiline
                    maxLength={400}
                    textAlignVertical="top"
                    placeholder="추가 의견 제공"
                    placeholderTextColor={gray}
                    value={feedbackComment}
                    onChangeText={setFeedbackComment}
                  />

                  <Pressable
                    style={({ pressed }) => [
                      styles.feedbackSubmitButton,
                      !canSubmitFeedback && styles.feedbackSubmitButtonDisabled,
                      pressed && canSubmitFeedback && styles.applyButtonPressed,
                    ]}
                    onPress={handleFeedbackSubmit}
                    disabled={!canSubmitFeedback}>
                    <Text
                      style={[
                        styles.feedbackSubmitText,
                        !canSubmitFeedback && styles.feedbackSubmitTextDisabled,
                      ]}>
                      제출
                    </Text>
                  </Pressable>

                  <View style={styles.feedbackDisclaimerDivider} />
                  <Text style={styles.feedbackDisclaimer}>{feedbackDisclaimer}</Text>
                </View>
              </>
            )}
            </Pressable>
          </Animated.View>
        </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * 위험 신호가 감지됐을 때 말풍선 아래에 붙는 안내.
 *
 * 앱이 할 수 있는 건 사람에게 연결해 주는 것까지다. 누르면 바로 전화가 걸리도록
 * tel: 링크를 연다 — 위급할 때 번호를 받아 적게 하면 안 된다.
 */
function CrisisNotice({ resources }: { resources: CrisisResource[] }) {
  const list = (resources.length > 0 ? resources : [FALLBACK_RESOURCE]).slice(0, MAX_CRISIS_RESOURCES);

  const open = async (resource: CrisisResource) => {
    // 전화가 먼저다. 번호가 없는 기관은 안내 페이지라도 열어 준다.
    const url = resource.phone ? `tel:${resource.phone}` : resource.url;
    if (!url) {
      return;
    }

    try {
      await Linking.openURL(url);
    } catch {
      // 전화 앱이 없는 기기(태블릿·시뮬레이터)에서도 번호는 알 수 있어야 한다.
      Alert.alert(
        '연결할 수 없어요',
        resource.phone ? `${resource.label} ${resource.phone} 로 연락해 주세요.` : resource.label,
      );
    }
  };

  return (
    <View style={styles.crisisBox}>
      <Text style={styles.crisisBody}>
        지금 많이 힘드신 것 같아요. 24시간 이야기를 들어 주는 곳이 있어요.
      </Text>
      {list.map((resource) => (
        <Pressable
          key={`${resource.label}-${resource.phone ?? resource.url}`}
          accessibilityRole="button"
          accessibilityLabel={
            resource.phone ? `${resource.label} 전화 걸기` : `${resource.label} 열기`
          }
          onPress={() => {
            void open(resource);
          }}
          style={({ pressed }) => [styles.crisisButton, pressed && styles.dimmed]}>
          <Text style={styles.crisisButtonText}>
            {resource.phone ? `${resource.label} ${resource.phone}` : resource.label}
          </Text>
        </Pressable>
      ))}
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

function RefreshIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill={aiPrimary}>
      <Path d="M17.65 6.35C16.2 4.9 14.21 4 12 4a8 8 0 0 0-8 8 8 8 0 0 0 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18a6 6 0 0 1-6-6 6 6 0 0 1 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </Svg>
  );
}

function ThumbIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path
        d="M4.66671 6.66671V14.6667M10 3.92004L9.33337 6.66671H13.22C13.427 6.66671 13.6312 6.7149 13.8163 6.80747C14.0015 6.90004 14.1625 7.03445 14.2867 7.20004C14.4109 7.36564 14.4948 7.55787 14.5319 7.76153C14.5689 7.96518 14.558 8.17466 14.5 8.37337L12.9467 13.7067C12.8659 13.9837 12.6977 14.2269 12.4667 14.4C12.2359 14.5731 11.9552 14.6667 11.6667 14.6667H2.66671C2.31309 14.6667 1.97395 14.5262 1.7239 14.2762C1.47385 14.0262 1.33337 13.687 1.33337 13.3334V8.00004C1.33337 7.64642 1.47385 7.30728 1.7239 7.05723C1.97395 6.80718 2.31309 6.66671 2.66671 6.66671H4.50671C4.75476 6.66658 4.99786 6.59725 5.20868 6.46652C5.41949 6.33579 5.58966 6.14885 5.70004 5.92671L8.00004 1.33337C8.31443 1.33727 8.62387 1.41215 8.90524 1.55244C9.18662 1.69272 9.43266 1.89478 9.62498 2.14351C9.81729 2.39224 9.95092 2.68121 10.0159 2.98884C10.0808 3.29647 10.0754 3.6148 10 3.92004Z"
        stroke={aiPrimary}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={direction === 'down' ? 'rotate(180 8 8)' : undefined}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  crisisBox: {
    borderRadius: 12,
    backgroundColor: '#FFF1F1',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  crisisBody: {
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 17,
    color: gray,
  },
  crisisButton: {
    marginTop: 4,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crisisButtonText: {
    fontFamily: FontFamily.pretendardBold,
    fontSize: 14,
    color: darkGray,
  },
  overlay: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    position: 'absolute',
    top: 248,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 20,
    gap: 15,
    shadowColor: gray,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  sheetContent: {
    flex: 1,
    gap: 15,
  },
  // 콘텐츠를 감싸는 키보드 내리기용 래퍼. 원래 sheetContent 가 하던 레이아웃을
  // 그대로 이어받아야 간격이 틀어지지 않는다.
  dismissArea: {
    flex: 1,
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
  responseRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    gap: 15,
  },
  responseSection: {
    alignSelf: 'stretch',
    gap: 15,
  },
  characterColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    width: 72,
  },
  character: {
    width: 72,
    height: 48,
  },
  bubbleWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  speechBubbleWrapper: {
    alignSelf: 'flex-start',
    position: 'relative',
    marginBottom: 10,
    maxWidth: 280,
  },
  speechBubble: {
    alignSelf: 'flex-start',
    maxWidth: 280,
    backgroundColor: '#FFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#3C4446',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  speechBubbleTail: {
    position: 'absolute',
    // SVG의 오른쪽 끝을 말풍선 왼쪽 경계에 맞춘다.
    left: -14,
    bottom: 0,
  },
  responseText: {
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    color: darkGray,
    lineHeight: 18,
  },
  errorText: {
    color: gray,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dimmed: {
    opacity: 0.4,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  refreshText: {
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    color: aiPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    minHeight: 20,
  },
  actionRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  actionDivider: {
    width: 335,
    maxWidth: '100%',
    height: 1,
    alignSelf: 'center',
    backgroundColor: lightGray,
  },
  generatedText: {
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 14,
    color: gray,
  },
  feedbackButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 20,
  },
  feedbackButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  feedbackButtonActive: {
    backgroundColor: 'rgba(105, 197, 241, 0.18)',
  },
  contentInput: {
    height: 212,
    backgroundColor: background,
    borderRadius: 5,
    padding: 10,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    color: darkGray,
    lineHeight: 18,
  },
  applyButton: {
    backgroundColor: primary,
    borderRadius: 5,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonPressed: {
    opacity: 0.8,
  },
  applyText: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    color: white,
  },
  feedbackReasonContent: {
    flex: 1,
    gap: 15,
  },
  feedbackQuestion: {
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 22,
    color: darkGray,
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: lightGray,
    backgroundColor: background,
  },
  reasonChipSelected: {
    borderColor: aiPrimary,
    backgroundColor: 'rgba(105, 197, 241, 0.12)',
  },
  reasonChipPressed: {
    opacity: 0.7,
  },
  reasonChipText: {
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    color: darkGray,
  },
  reasonChipTextSelected: {
    fontFamily: FontFamily.pretendardMedium,
    color: aiPrimary,
  },
  feedbackInput: {
    height: 100,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: background,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 18,
    color: darkGray,
  },
  feedbackSubmitButton: {
    minWidth: 64,
    height: 32,
    alignSelf: 'flex-end',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: primary,
  },
  feedbackSubmitButtonDisabled: {
    backgroundColor: lightGray,
  },
  feedbackSubmitText: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    color: white,
  },
  feedbackSubmitTextDisabled: {
    color: gray,
  },
  feedbackDisclaimerDivider: {
    height: 1,
    backgroundColor: lightGray,
  },
  feedbackDisclaimer: {
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 10,
    lineHeight: 16,
    color: gray,
  },
});
