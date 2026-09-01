import { Image, type ImageSource } from "expo-image";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  darkGray,
  FontFamily,
  gray,
  lightGray,
  primary,
  red,
  white,
} from "@/constants/theme";

type Props = {
  visible: boolean;
  title: string;
  /** 제목 아래 보조 설명. 되돌릴 수 없는 동작이면 그 사실을 적는다 */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제처럼 되돌릴 수 없는 동작이면 true — 확인 버튼이 빨간색이 된다 */
  destructive?: boolean;
  /**
   * 제목 위에 띄울 일러스트. 넘기면 카드가 일러스트 레이아웃(둥근 카드 + 알약 버튼)으로
   * 바뀐다. 넘기지 않으면 기존의 담백한 확인 모달 그대로다.
   */
  image?: ImageSource | number;
  /** 처리 중 — 두 버튼을 잠가 중복 실행을 막는다 */
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 되돌릴 수 없는 동작 앞에 한 번 더 확인받는 모달. */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  destructive = false,
  image,
  isPending = false,
  onConfirm,
  onCancel,
}: Props) {
  if (image) {
    return (
      <IllustratedConfirmModal
        visible={visible}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive={destructive}
        image={image}
        isPending={isPending}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isPending ? undefined : onCancel}
    >
      <View style={styles.backdrop}>
        {/* 처리 중에는 배경을 눌러도 닫히지 않는다 */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={isPending ? undefined : onCancel}
          accessible={false}
        />
        <View style={styles.card}>
          <View style={styles.textBox}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
              disabled={isPending}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>

            <View style={styles.buttonDivider} />

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
              disabled={isPending}
              onPress={onConfirm}
            >
              {isPending ? (
                <ActivityIndicator
                  size="small"
                  color={destructive ? red : primary}
                />
              ) : (
                <Text
                  style={[
                    styles.confirmText,
                    destructive && styles.confirmTextDestructive,
                  ]}
                >
                  {confirmLabel}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** 일러스트가 들어가는 확인 모달 — 차단처럼 관계를 끊는 동작에 쓴다. */
function IllustratedConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  image,
  isPending,
  onConfirm,
  onCancel,
}: Required<
  Pick<
    Props,
    | "visible"
    | "title"
    | "confirmLabel"
    | "cancelLabel"
    | "destructive"
    | "image"
    | "isPending"
    | "onConfirm"
    | "onCancel"
  >
> &
  Pick<Props, "message">) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isPending ? undefined : onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={isPending ? undefined : onCancel}
          accessible={false}
        />
        <View style={illustrated.card}>
          <Image
            source={image}
            style={illustrated.image}
            contentFit="contain"
          />

          <Text style={illustrated.title}>{title}</Text>
          {message ? <Text style={illustrated.message}>{message}</Text> : null}

          <View style={illustrated.buttonRow}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                illustrated.button,
                illustrated.cancelButton,
                pressed && styles.buttonPressed,
              ]}
              disabled={isPending}
              onPress={onCancel}
            >
              <Text style={illustrated.cancelText}>{cancelLabel}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                illustrated.button,
                destructive
                  ? illustrated.confirmButtonDestructive
                  : illustrated.confirmButton,
                pressed && styles.buttonPressed,
              ]}
              disabled={isPending}
              onPress={onConfirm}
            >
              {isPending ? (
                <ActivityIndicator size="small" color={white} />
              ) : (
                <Text style={illustrated.confirmText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const illustrated = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 300,
    backgroundColor: white,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: "center",
  },
  image: {
    width: 132,
    height: 104,
  },
  title: {
    marginTop: 18,
    textAlign: "center",
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 22,
    color: darkGray,
  },
  message: {
    marginTop: 8,
    textAlign: "center",
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 18,
    color: gray,
  },
  buttonRow: {
    marginTop: 20,
    flexDirection: "row",
    alignSelf: "stretch",
    gap: 10,
  },
  button: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: lightGray,
  },
  confirmButton: {
    backgroundColor: primary,
  },
  confirmButtonDestructive: {
    backgroundColor: red,
  },
  cancelText: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 14,
    color: darkGray,
  },
  confirmText: {
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    color: white,
  },
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    paddingHorizontal: 40,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: white,
    borderRadius: 12,
    overflow: "hidden",
  },
  textBox: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  title: {
    textAlign: "center",
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 15,
    color: darkGray,
  },
  message: {
    textAlign: "center",
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
    color: gray,
  },
  divider: {
    height: 1,
    backgroundColor: lightGray,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  button: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonDivider: {
    width: 1,
    backgroundColor: lightGray,
  },
  cancelText: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 14,
    color: gray,
  },
  confirmText: {
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    color: primary,
  },
  confirmTextDestructive: {
    color: red,
  },
});
