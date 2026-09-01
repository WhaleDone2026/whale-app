import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  background,
  darkGray,
  FontFamily,
  gray,
  lightGray,
  primary,
  white,
} from "@/constants/theme";

const CONTENT_MAX_LENGTH = 2000;
const CONTENT_MIN_LENGTH = 5;

type Props = {
  visible: boolean;
  /** 이메일 칸 기본값 — 계정 이메일. 소셜 로그인이면 없을 수 있다. */
  defaultEmail?: string | null;
  /** 보내는 중 — 버튼을 잠가 중복 발송을 막는다 */
  isPending?: boolean;
  onSubmit: (values: { content: string; email: string | null }) => void;
  onClose: () => void;
};

/** 설정 > 문의하기. 화면을 따로 만들 만큼 입력이 많지 않아 하단 시트로 받는다. */
export function InquiryBottomSheet({
  visible,
  defaultEmail = null,
  isPending = false,
  onSubmit,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // 닫는 애니메이션이 끝난 뒤에 Modal 을 내려야 시트가 툭 사라지지 않는다.
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [content, setContent] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (visible) {
      setContent("");
      setEmail(defaultEmail ?? "");
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
      return;
    }

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsModalVisible(false);
      }
    });
  }, [defaultEmail, fadeAnim, slideAnim, visible]);

  const trimmed = content.trim();
  const canSubmit = trimmed.length >= CONTENT_MIN_LENGTH && !isPending;

  const handleClose = () => {
    if (isPending) {
      return;
    }
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal
      transparent
      visible={isModalVisible}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fadeAnim }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessible={false}
          />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                paddingBottom: insets.bottom + 16,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.grabber} />

            <View style={styles.header}>
              <Text style={styles.title}>문의하기</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="닫기"
                hitSlop={10}
                onPress={handleClose}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={darkGray} />
              </Pressable>
            </View>

            <Text style={styles.description}>
              불편한 점이나 궁금한 점을 남겨 주세요. 확인 후 이메일로 답변드릴게요.
            </Text>

            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              placeholder="어떤 점이 궁금하신가요?"
              placeholderTextColor={gray}
              multiline
              maxLength={CONTENT_MAX_LENGTH}
              textAlignVertical="top"
              editable={!isPending}
            />
            <Text style={styles.counter}>
              {content.length}/{CONTENT_MAX_LENGTH}
            </Text>

            <Text style={styles.label}>답변 받을 이메일</Text>
            <TextInput
              style={styles.emailInput}
              value={email}
              onChangeText={setEmail}
              placeholder="answer@example.com"
              placeholderTextColor={gray}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!isPending}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="문의 보내기"
              disabled={!canSubmit}
              onPress={() => {
                Keyboard.dismiss();
                onSubmit({ content: trimmed, email: email.trim() || null });
              }}
              style={({ pressed }) => [
                styles.submitButton,
                !canSubmit && styles.submitButtonDisabled,
                pressed && canSubmit && styles.pressed,
              ]}
            >
              {isPending ? (
                <ActivityIndicator size="small" color={white} />
              ) : (
                <Text style={styles.submitText}>보내기</Text>
              )}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    backgroundColor: white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightGray,
  },
  header: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    flex: 1,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  closeButton: {
    marginLeft: 12,
  },
  description: {
    marginTop: 6,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  contentInput: {
    marginTop: 14,
    minHeight: 120,
    maxHeight: 200,
    borderRadius: 10,
    backgroundColor: background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 20,
  },
  counter: {
    marginTop: 6,
    alignSelf: "flex-end",
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
  },
  label: {
    marginTop: 6,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  emailInput: {
    marginTop: 8,
    height: 46,
    borderRadius: 10,
    backgroundColor: background,
    paddingHorizontal: 14,
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
  },
  submitButton: {
    marginTop: 18,
    height: 50,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: primary,
  },
  submitButtonDisabled: {
    backgroundColor: lightGray,
  },
  submitText: {
    color: white,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.6,
  },
});
