import { useRef, useState } from 'react';
import {
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

import { AIBottomSheet } from '@/components/ai-bottom-sheet';
import { CustomImagePicker } from '@/components/custom-image-picker';
import { ImageGrid } from '@/components/image-grid';
import { PostSettingsBottomSheet } from '@/components/post-settings-bottom-sheet';
import AIIcon from '@/components/icons/ai-icon';
import UnorderedListIcon from '@/components/icons/unordered-list-icon';
import UploadIcon from '@/components/icons/upload-icon';
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

const SAMPLE_RESPONSES = [
  '마음이 많이 힘들었나봐. 하지만 지난 주에 많이 과로 하지 않았어? 가끔은 쉬어가는 것도 필요하다구~',
  '오늘 정말 수고했어! 매일 이렇게 노력하는 모습이 너무 대단해. 앞으로도 이렇게만 해줘~',
  '너는 정말 대단한 사람이야. 오늘도 열심히 살아줘서 고마워!',
];

export default function WritePage() {

  const [text, setText] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [responseIndex, setResponseIndex] = useState(0);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  const currentResponse = SAMPLE_RESPONSES[responseIndex];

  const handleAIPress = () => {
    Keyboard.dismiss();
    setIsSheetVisible(true);
  };

  const handleRefresh = () => {
    setResponseIndex((prev) => (prev + 1) % SAMPLE_RESPONSES.length);
  };

  const handleApply = (appliedText: string) => {
    setText(appliedText);
    setIsSheetVisible(false);
  };

  const handlePickerConfirm = (uris: string[]) => {
    setSelectedImages(uris.slice(0, 6));
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
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ThemedView style={styles.container}>
          {/* Topbar */}
          <View style={styles.topBar}>
            <ThemedButton
              label="등록"
              variant="dark"
              onPress={() => {
                Keyboard.dismiss();
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
            {selectedImages.length > 0 && (
              <View style={styles.gridWrapper}>
                <ImageGrid uris={selectedImages} onRemove={removeImage} />
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
            <ThemedButton label="저장" variant="ghost" />
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
          initialSelectedUris={selectedImages}
        />
      </Modal>

      <PostSettingsBottomSheet
        visible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        onSubmit={(_category, _visibility) => {
          setIsSettingsVisible(false);
          // TODO: 실제 등록 API 연결
        }}
      />

      <AIBottomSheet
        visible={isSheetVisible}
        content={text}
        aiResponse={currentResponse}
        onClose={() => setIsSheetVisible(false)}
        onRefresh={handleRefresh}
        onApply={handleApply}
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
