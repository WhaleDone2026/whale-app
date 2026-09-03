import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePostHog } from 'posthog-react-native';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AIBottomSheet, type FeedbackPayload } from '@/components/ai-bottom-sheet';
import { CustomImagePicker } from '@/components/custom-image-picker';
import AIIcon from '@/components/icons/ai-icon';
import UnorderedListIcon from '@/components/icons/unordered-list-icon';
import UploadIcon from '@/components/icons/upload-icon';
import { ImageGrid } from '@/components/image-grid';
import { NoticeModal } from '@/components/notice-modal';
import { PostSettingsBottomSheet } from '@/components/post-settings-bottom-sheet';
import { ThemedButton } from '@/components/themed-button';
import { ThemedView } from '@/components/themed-view';
import {
  darkGray,
  FontFamily,
  FontSize,
  gray,
  lightGray,
  primary,
  white,
} from '@/constants/theme';
import {
  createDraftId,
  fetchWhaleMessage,
  finalizeWhaleMemory,
  saveWhaleMemory,
  type CrisisResource,
} from '@/src/services/ai';
import { submitAIFeedback } from '@/src/services/ai-feedback';
import { createPost, fetchPostForEdit, updatePost, type EditablePost } from '@/src/services/posts';
import type { PostVisibility } from '@/src/types/api/feed-post';

/**
 * 화면에서 다루는 이미지 한 장.
 * - uri:       표시·업로드에 쓰는 값. 새 이미지는 file://, 기존 이미지는 공개 URL.
 * - sourceUri: 피커에 되돌려 재선택을 복원하기 위한 원본 에셋 URI.
 * - path:      이미 업로드된 이미지의 스토리지 경로. 있으면 다시 올리지 않는다.
 */
type DraftImage = { uri: string; sourceUri: string; path?: string };

export default function WritePage() {
  const router = useRouter();
  const posthog = usePostHog();

  const [text, setText] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [isEmptyDiaryNoticeVisible, setIsEmptyDiaryNoticeVisible] = useState(false);
  const [images, setImages] = useState<DraftImage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // 수정 모드 — 피드에서 "수정"을 눌러 들어오면 postId 가 넘어온다.
  const { postId } = useLocalSearchParams<{ postId?: string }>();
  const [editingPost, setEditingPost] = useState<EditablePost | null>(null);
  const isEditing = editingPost != null;

  // AI 버튼을 누른 시점의 원문과 초안 id 를 고정해 둔다. 시트 안에서 글을 고쳐도
  // 재생성·저장에는 항상 이 원문을 쓴다. (고친 글은 이미 긍정적으로 재구성돼 있어
  // 나중에 비슷한 감정을 찾을 때 원래 감정과 멀어진다)
  const draftRef = useRef<{ original: string; draftId: string } | null>(null);
  const [whaleMessage, setWhaleMessage] = useState('');
  const [isWhaleLoading, setIsWhaleLoading] = useState(false);
  const [whaleError, setWhaleError] = useState<string | null>(null);
  // 서버(safety 블록)가 위험 신호를 붙여 보낸 한마디인지. 시트에 상담 전화 안내를 띄운다.
  const [showCrisisNotice, setShowCrisisNotice] = useState(false);
  const [crisisResources, setCrisisResources] = useState<CrisisResource[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const aiCoachAppliedRef = useRef(false);
  const aiCoachRetryCountRef = useRef(0);

  // 이 draft 안에서 지금까지 받은 한마디 전부(성공한 것만). 마지막 항목이 곧
  // 현재 whaleMessage와 같다 — "적용하기" 시점에 마지막을 뺀 나머지가 거절된 제안들이다.
  const suggestionHistoryRef = useRef<{ whaleMessage: string; retryCount: number }[]>([]);

  // "적용하기"를 누른 draftId. 등록이 성공하면 이 draft 행에 최종 텍스트를 채운다.
  // 세션 중 AI 버튼을 여러 번 눌러도 마지막으로 적용된 draft만 최종본과 연결한다.
  const appliedDraftIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSheetVisible) {
      return;
    }

    return () => {
      if (!aiCoachAppliedRef.current) {
        posthog.capture('ai_coach_abandoned', {
          retry_count: aiCoachRetryCountRef.current,
        });
      }
    };
  }, [isSheetVisible, posthog]);

  const resetForm = useCallback(() => {
    setText('');
    setImages([]);
    setEditingPost(null);
    draftRef.current = null;
    suggestionHistoryRef.current = [];
    appliedDraftIdRef.current = null;
    setWhaleMessage('');
    setWhaleError(null);
    setShowCrisisNotice(false);
    setCrisisResources([]);
    setRetryCount(0);
  }, []);

  // 수정 진입 시 원본을 불러와 화면을 채운다.
  useEffect(() => {
    if (!postId) {
      // 등록을 마치고 파라미터를 지웠거나, 탭으로 새로 들어온 경우.
      setEditingPost(null);
      return;
    }

    let isMounted = true;
    fetchPostForEdit(postId)
      .then((post) => {
        if (!isMounted) {
          return;
        }
        setEditingPost(post);
        setText(post.contents);
        setImages(
          post.images.map((image) => ({ uri: image.url, sourceUri: image.url, path: image.path })),
        );
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        Alert.alert(error instanceof Error ? error.message : '게시글을 불러오지 못했습니다.');
        router.back();
      });

    return () => {
      isMounted = false;
    };
  }, [postId, router]);

  const requestWhaleMessage = async (nextRetryCount: number) => {
    const draft = draftRef.current;
    if (!draft) {
      return;
    }

    setIsWhaleLoading(true);
    setWhaleError(null);
    try {
      const whale = await fetchWhaleMessage({
        diary: draft.original,
        draftId: draft.draftId,
        retryCount: nextRetryCount,
      });
      setWhaleMessage(whale.message);
      // 상담 전화 안내는 자해·자살 신호일 때만 띄운다. is_risky 는 폭력·혐오 같은
      // 정책 위반(risk_type "policy")에도 true 라서 그것만으로는 판단할 수 없다.
      setShowCrisisNotice(whale.isRisky && whale.riskType === 'self_harm');
      setCrisisResources(whale.resources);
      suggestionHistoryRef.current.push({ whaleMessage: whale.message, retryCount: nextRetryCount });
    } catch (error) {
      setWhaleError(error instanceof Error ? error.message : '한마디를 받아오지 못했어요.');
    } finally {
      setIsWhaleLoading(false);
    }
  };

  const handleAIPress = () => {
    Keyboard.dismiss();

    if (!text.trim()) {
      setIsEmptyDiaryNoticeVisible(true);
      return;
    }

    draftRef.current = { original: text, draftId: createDraftId() };
    aiCoachAppliedRef.current = false;
    aiCoachRetryCountRef.current = 0;
    suggestionHistoryRef.current = [];
    setWhaleMessage('');
    setShowCrisisNotice(false);
    setCrisisResources([]);
    setRetryCount(0);
    setIsSheetVisible(true);
    posthog.capture('ai_coach_requested', { char_count: text.trim().length });
    void requestWhaleMessage(0);
  };

  const handleRefresh = () => {
    const next = retryCount + 1;
    setRetryCount(next);
    aiCoachRetryCountRef.current = next;
    posthog.capture('ai_coach_retried', { retry_count: next });
    void requestWhaleMessage(next);
  };

  const handleSubmitPost = async (category: string, visibility: PostVisibility) => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      // 시트의 "전체"는 특정 카테고리가 아니라 기본값이다. 보관함에서 '전체'는 모든 글을
      // 모아 보는 자리라, 그대로 저장하면 같은 이름의 실제 카테고리가 하나 더 생긴다.
      // null 로 넣으면 분류 없는 글로 '전체'에만 들어간다.
      const categoryValue = category === '전체' ? null : category;

      if (editingPost) {
        await updatePost({
          postId: editingPost.id,
          contents: text,
          category: categoryValue,
          visibility,
          images: images.map((image) => ({ uri: image.uri, path: image.path })),
        });
      } else {
        await createPost({
          contents: text,
          category: categoryValue,
          visibility,
          imageUris: images.map((image) => image.uri),
        });
        posthog.capture('post_created', {
          used_ai: appliedDraftIdRef.current !== null,
          char_count: text.trim().length,
          photo_count: images.length,
          is_public: visibility === 'public',
        });
      }

      // 등록 성공 시점에만 최종 수정본을 기록한다. resetForm이 ref를 지우기 전에
      // 여기서 먼저 읽어야 한다.
      const appliedDraftId = appliedDraftIdRef.current;
      if (appliedDraftId) {
        finalizeWhaleMemory({ draftId: appliedDraftId, editedText: text }).catch((error) => {
          console.warn('[ai] 장기기억 최종본 저장 실패', error);
        });
      }

      setIsSettingsVisible(false);
      resetForm();
      // 수정 모드로 다시 들어오지 않도록 파라미터를 지운다 (탭은 계속 살아 있다).
      router.replace('/(tabs)/home');
    } catch (error) {
      const fallback = editingPost ? '게시글 수정에 실패했습니다.' : '게시글 등록에 실패했습니다.';
      Alert.alert(error instanceof Error ? error.message : fallback);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApply = (appliedText: string) => {
    aiCoachAppliedRef.current = true;
    posthog.capture('ai_coach_applied', {
      retry_count: aiCoachRetryCountRef.current,
      // 이 시트에서 적용하는 원문은 AI를 열 당시의 일기다. 실제 텍스트는 보내지 않는다.
      edited: appliedText !== draftRef.current?.original,
    });
    setText(appliedText);
    setIsSheetVisible(false);

    // 저장은 "적용하기" 시점에 한 번만. 실패해도 글쓰기를 막지 않는다 —
    // 장기기억은 다음 한마디의 품질을 위한 부가 기능이다.
    const draft = draftRef.current;
    if (draft) {
      appliedDraftIdRef.current = draft.draftId;
      // 마지막 항목이 곧 지금 적용하는 whaleMessage이므로, 그 앞의 것들만 "거절된 제안"이다.
      const rejectedMessages = suggestionHistoryRef.current.slice(0, -1);
      saveWhaleMemory({
        originalText: draft.original,
        draftId: draft.draftId,
        whaleMessage,
        retryCount,
        rejectedMessages,
      }).catch((error) => {
        console.warn('[ai] 장기기억 저장 실패', error);
      });
    }
  };

  /**
   * 고래 한마디 평가 제출.
   *
   * 시트는 제출을 기다리지 않고 바로 메인 화면으로 돌아간다. 그래서 결과를 알리지
   * 않으면 보내진 건지 알 수 없다 — 성공·실패 모두 알린다.
   */
  const handleFeedbackSubmit = async (feedback: FeedbackPayload) => {
    try {
      await submitAIFeedback({
        type: feedback.type,
        reasons: feedback.reasons,
        comment: feedback.comment,
        whaleMessage,
        draftId: draftRef.current?.draftId ?? null,
        retryCount,
      });
      Alert.alert('평가를 보냈어요.', '더 좋은 한마디를 만드는 데 쓸게요. 고맙습니다!');
    } catch (error) {
      Alert.alert(error instanceof Error ? error.message : '평가를 보내지 못했습니다.');
    }
  };

  const handlePickerConfirm = (uris: string[], sourceUris: string[]) => {
    const picked = uris.map((uri, index) => ({ uri, sourceUri: sourceUris[index] ?? uri }));

    // 수정 화면의 기존 이미지(path 가 있는 것)는 피커 목록에 없으므로 그대로 두고,
    // 피커에서 고른 것만 교체한다. 기존 이미지를 빼려면 그리드의 X 로 지우면 된다.
    setImages((prev) => [...prev.filter((image) => image.path), ...picked].slice(0, 6));
    setIsPickerVisible(false);
  };

  const handleBulletList = () => {
    const cursor = selection.start;
    const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
    const lineEnd = text.indexOf('\n', cursor);
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

    let newText: string;
    let newCursor: number;

    if (line.startsWith('• ')) {
      newText = text.slice(0, lineStart) + line.slice(2) + text.slice(lineStart + line.length);
      newCursor = Math.max(lineStart, cursor - 2);
    } else {
      newText = text.slice(0, lineStart) + '• ' + line + text.slice(lineStart + line.length);
      newCursor = cursor + 2;
    }

    setText(newText);
    setSelection({ start: newCursor, end: newCursor });
    inputRef.current?.focus();
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        // Android의 padding은 창 크기를 줄이지 않아 하단 입력 도구막대와 본문이
        // 키보드 뒤로 겹친다. Android에서는 남은 높이만큼 화면을 줄여 준다.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ThemedView style={styles.container}>
          {/* Topbar */}
          <View style={styles.topBar}>
            <ThemedButton
              label={isEditing ? '수정' : '등록'}
              variant="dark"
              onPress={() => {
                Keyboard.dismiss();

                if (!text.trim()) {
                  Alert.alert('내용을 입력해 주세요.');
                  return;
                }

                setIsSettingsVisible(true);
              }}
            />
          </View>

          <View style={styles.divider} />

          {/* 사진 그리드 + 텍스트 입력 영역 */}
          <ScrollView
            style={styles.contentArea}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
            {images.length > 0 && (
              <View style={styles.gridWrapper}>
                <ImageGrid uris={images.map((image) => image.uri)} onRemove={removeImage} />
              </View>
            )}
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="내용을 입력하세요. (최대 400자)"
              placeholderTextColor={gray}
              multiline
              maxLength={400}
              textAlignVertical="top"
              value={text}
              onChangeText={setText}
              selection={selection}
              onSelectionChange={e => setSelection(e.nativeEvent.selection)}
            />
          </ScrollView>

          <View style={styles.divider} />

          {/* Bottombar */}
          <View style={styles.bottomBar}>
            <View style={styles.bottomBarLeft}>
              <Pressable onPress={() => setIsPickerVisible(true)} hitSlop={8}>
                <UploadIcon width={20} height={20} fill={primary} />
              </Pressable>
              <Pressable onPress={handleBulletList} hitSlop={8}>
                <UnorderedListIcon width={20} height={20} fill={primary} />
              </Pressable>
              <Pressable onPress={handleAIPress} hitSlop={8}>
                <AIIcon width={34} height={20} fill={primary} />
              </Pressable>
            </View>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>

      {/* 사진 선택 피커 (전체화면 모달) */}
      <Modal
        visible={isPickerVisible}
        animationType="slide"
        onRequestClose={() => setIsPickerVisible(false)}>
        <CustomImagePicker
          onConfirm={handlePickerConfirm}
          onClose={() => setIsPickerVisible(false)}
          maxSelect={6}
          initialSelectedUris={images.map((image) => image.sourceUri)}
          resolveLocalUri
        />
      </Modal>

      <PostSettingsBottomSheet
        visible={isSettingsVisible}
        isSubmitting={isSubmitting}
        initialCategory={editingPost?.category ?? null}
        initialVisibility={editingPost?.visibility ?? 'public'}
        submitLabel={isEditing ? '수정하기' : '등록하기'}
        onClose={() => setIsSettingsVisible(false)}
        onSubmit={handleSubmitPost}
      />

      <AIBottomSheet
        visible={isSheetVisible}
        content={text}
        aiResponse={whaleMessage}
        isLoading={isWhaleLoading}
        errorMessage={whaleError}
        showCrisisNotice={showCrisisNotice}
        crisisResources={crisisResources}
        onClose={() => setIsSheetVisible(false)}
        onRefresh={handleRefresh}
        onApply={handleApply}
        onFeedbackSubmit={handleFeedbackSubmit}
      />

      <NoticeModal
        visible={isEmptyDiaryNoticeVisible}
        title="일기를 먼저 작성해 주세요."
        onConfirm={() => setIsEmptyDiaryNoticeVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: white,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: white,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 70,
  },
  divider: {
    height: 1,
    backgroundColor: lightGray,
    marginVertical: 10,
  },
  contentArea: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  gridWrapper: {
    paddingHorizontal: 20,
  },
  input: {
    flexGrow: 1,
    minHeight: 180,
    paddingHorizontal: 20,
    paddingTop: 10,
    fontSize: FontSize.base,
    fontFamily: FontFamily.pretendardRegular,
    color: darkGray,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  bottomBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
});
