import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  background,
  darkGray,
  FontFamily,
  gray,
  lightGray,
  primary,
  white,
} from "@/constants/theme";
import { SettingsHeader } from "@/src/pages/settings/shared";
import {
  createReport,
  REPORT_REASONS,
  REPORT_TARGET_LABEL,
  type ReportReasonCode,
  type ReportTargetType,
} from "@/src/services/reports";

const DETAIL_MAX_LENGTH = 500;

/**
 * 신고 사유 선택 화면.
 *
 * 루트 스택(app/report.tsx)에 두는 이유: 신고 진입점(피드·친구 프로필·친구 목록)이
 * home 과 profile 두 스택에 나뉘어 있다. 루트에 한 장만 두면 어디서든 부를 수 있다.
 */
export default function ReportPage() {
  const params = useLocalSearchParams<{
    targetType: ReportTargetType;
    targetId: string;
    targetName?: string;
  }>();

  const [reason, setReason] = useState<ReportReasonCode | null>(null);
  const [detail, setDetail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const targetLabel = REPORT_TARGET_LABEL[params.targetType] ?? "게시물";
  // '기타'는 무엇이 문제인지 알 수 없어서 상세 내용을 받아야 처리할 수 있다.
  const isDetailRequired = reason === "etc";
  const canSubmit =
    reason !== null && (!isDetailRequired || detail.trim().length > 0);

  const handleSubmit = async () => {
    if (!reason || isSubmitting || !params.targetId) {
      return;
    }

    if (isDetailRequired && !detail.trim()) {
      Alert.alert("어떤 문제인지 적어 주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      await createReport({
        targetType: params.targetType,
        targetId: params.targetId,
        reason,
        detail: detail.trim() || null,
      });

      Alert.alert(
        "신고가 접수되었어요.",
        "운영팀이 확인한 뒤 조치할게요. 처리 상태는 설정 > 신고내역에서 볼 수 있어요.",
      );
      router.back();
    } catch (error) {
      Alert.alert(
        error instanceof Error
          ? error.message
          : "신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <SettingsHeader title="신고하기" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Text style={styles.title}>
              {params.targetName
                ? `${params.targetName}님의 ${targetLabel}을(를) 신고하는 이유는 무엇인가요?`
                : `이 ${targetLabel}을(를) 신고하는 이유는 무엇인가요?`}
            </Text>
            <Text style={styles.subtitle}>
              신고한 사실은 상대방에게 알리지 않아요.
            </Text>
          </View>

          <View style={styles.reasonList}>
            {REPORT_REASONS.map((item) => {
              const isSelected = reason === item.code;

              return (
                <Pressable
                  key={item.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={item.label}
                  onPress={() => setReason(item.code)}
                  style={({ pressed }) => [
                    styles.reasonRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.reasonText}>
                    <Text
                      style={[
                        styles.reasonLabel,
                        isSelected && styles.reasonLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text style={styles.reasonDescription}>
                      {item.description}
                    </Text>
                  </View>
                  <Ionicons
                    name={isSelected ? "radio-button-on" : "radio-button-off"}
                    size={22}
                    color={isSelected ? primary : gray}
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.detailBox}>
            <Text style={styles.detailTitle}>
              자세한 내용{isDetailRequired ? "" : " (선택)"}
            </Text>
            <TextInput
              style={styles.detailInput}
              value={detail}
              onChangeText={setDetail}
              placeholder="운영팀이 확인할 때 도움이 될 내용을 적어 주세요."
              placeholderTextColor={gray}
              multiline
              maxLength={DETAIL_MAX_LENGTH}
              textAlignVertical="top"
            />
            <Text style={styles.counter}>
              {detail.length}/{DETAIL_MAX_LENGTH}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="신고 제출하기"
            disabled={!canSubmit || isSubmitting}
            onPress={() => {
              void handleSubmit();
            }}
            style={({ pressed }) => [
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
              pressed && canSubmit && styles.pressed,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={white} />
            ) : (
              <Text style={styles.submitText}>제출하기</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: white,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  intro: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 17,
    lineHeight: 24,
  },
  subtitle: {
    marginTop: 6,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  reasonList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightGray,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightGray,
  },
  reasonText: {
    flex: 1,
    minWidth: 0,
  },
  reasonLabel: {
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  reasonLabelSelected: {
    fontFamily: FontFamily.pretendardSemiBold,
  },
  reasonDescription: {
    marginTop: 2,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  detailBox: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  detailTitle: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  detailInput: {
    marginTop: 8,
    minHeight: 110,
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
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: white,
  },
  submitButton: {
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
