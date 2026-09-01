import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmModal } from "@/components/confirm-modal";
import { InquiryBottomSheet } from "@/components/inquiry-bottom-sheet";
import { SettingIcon, type SettingIconName } from "@/components/setting-icons";
import {
  background,
  darkGray,
  FontFamily,
  gray,
  lightGray,
  red,
  white,
} from "@/constants/theme";
import { fetchAccountEmail, submitInquiry } from "@/src/services/inquiries";
import { signOutUser } from "@/src/services/onboarding";
import type { TermType } from "@/src/services/terms";
import { fetchCurrentUser, type AppUser } from "@/src/services/users";

const cryingWhaleImage = require("../../../assets/icons/crying_whale.png");

type SettingRow = {
  icon: SettingIconName;
  label: string;
  /** 이동할 화면. 없으면 아직 만들지 않은 항목이라 '준비 중' 안내만 띄운다 */
  go?: () => void;
};

const goToTerm = (type: TermType, title: string) =>
  router.push({
    pathname: "/(tabs)/profile/settings/term",
    params: { type, title },
  });

const APP_SETTING_ROWS: SettingRow[] = [
  {
    icon: "notification",
    label: "알림",
    go: () => router.push("/(tabs)/profile/settings/notifications"),
  },
  {
    icon: "block",
    label: "차단한 계정",
    go: () => router.push("/(tabs)/profile/settings/blocked"),
  },
  {
    icon: "privacy",
    label: "개인정보 설정",
    go: () => router.push("/(tabs)/profile/settings/privacy"),
  },
];

// 문의하기는 화면 이동이 아니라 하단 시트를 열어서, 핸들러를 받아 만든다.
const buildSupportRows = (onInquiry: () => void): SettingRow[] => [
  {
    icon: "broadcast",
    label: "공지사항",
    go: () => router.push("/(tabs)/profile/settings/notices"),
  },
  { icon: "ask", label: "문의하기", go: onInquiry },
  {
    icon: "siren",
    label: "신고내역",
    go: () => router.push("/(tabs)/profile/settings/reports"),
  },
];

const LEGAL_ROWS: SettingRow[] = [
  {
    icon: "terms",
    label: "서비스 이용약관",
    go: () => goToTerm("service", "서비스 이용약관"),
  },
  {
    icon: "privacyPolicy",
    label: "개인정보처리방침",
    go: () => goToTerm("privacy", "개인정보처리방침"),
  },
];

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

export default function SettingsPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** 열려 있는 확인 모달. 둘이 동시에 뜰 일은 없어서 한 상태로 둔다 */
  const [confirmAction, setConfirmAction] = useState<
    "logout" | "withdraw" | null
  >(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isInquiryOpen, setIsInquiryOpen] = useState(false);
  const [isSendingInquiry, setIsSendingInquiry] = useState(false);
  /** 문의 폼의 이메일 기본값. 소셜 로그인이면 계정 이메일이 없을 수 있다. */
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchCurrentUser()
      .then((currentUser) => {
        if (isMounted) {
          setUser(currentUser);
        }
      })
      .catch((error) => {
        console.warn("[settings] Failed to load user", error);
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

  useEffect(() => {
    let isMounted = true;

    fetchAccountEmail().then((email) => {
      if (isMounted) {
        setAccountEmail(email);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // 아직 화면이 없는 항목. 디자인이 나오는 대로 하나씩 연결한다.
  const showComingSoon = (label: string) => {
    Alert.alert(label, "준비 중이에요.");
  };

  const handleInquiry = async (values: {
    content: string;
    email: string | null;
  }) => {
    if (isSendingInquiry) {
      return;
    }

    setIsSendingInquiry(true);

    try {
      await submitInquiry({ content: values.content, replyEmail: values.email });
      setIsInquiryOpen(false);
      Alert.alert(
        "문의를 보냈어요.",
        "확인 후 남겨 주신 이메일로 답변드릴게요.",
      );
    } catch (error) {
      // 글자 수·발송 제한 안내는 시트를 열어 둔 채로 보여 줘야 고쳐 쓸 수 있다.
      Alert.alert(
        error instanceof Error ? error.message : "문의를 보내지 못했습니다.",
      );
    } finally {
      setIsSendingInquiry(false);
    }
  };

  const handleLogout = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOutUser();
      setConfirmAction(null);
      router.replace("/");
    } catch (error) {
      console.warn("[settings] Failed to sign out", error);
      setConfirmAction(null);
      Alert.alert("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          hitSlop={10}
          onPress={() => router.back()}
          style={styles.headerSide}
        >
          <Ionicons name="chevron-back" size={26} color={darkGray} />
        </Pressable>
        <Text style={styles.headerTitle}>설정</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>계정 관리</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="프로필 편집"
            onPress={() => router.push("/(tabs)/profile/edit")}
            style={({ pressed }) => [
              styles.profileRow,
              pressed && styles.pressed,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={gray} />
            ) : (
              <>
                {user ? (
                  <Image
                    source={user.profile_image}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]} />
                )}
                <View style={styles.profileText}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {user?.name ?? ""}
                  </Text>
                  <Text style={styles.profileTag} numberOfLines={1}>
                    @{user?.tag ?? ""}
                  </Text>
                </View>
              </>
            )}
          </Pressable>
        </View>

        <SettingSection
          title="앱 설정"
          rows={APP_SETTING_ROWS}
          onUnavailable={showComingSoon}
        />
        <SettingSection
          title="고객지원"
          rows={buildSupportRows(() => setIsInquiryOpen(true))}
          onUnavailable={showComingSoon}
        />
        <SettingSection
          title="법적고지"
          rows={LEGAL_ROWS}
          onUnavailable={showComingSoon}
        />

        <View style={styles.section}>
          {/* 앱 버전은 이동하는 곳이 없으므로 값만 오른쪽에 보여 준다 */}
          <View style={styles.row}>
            <SettingIcon name="version" />
            <Text style={styles.rowLabel}>앱 버전</Text>
            <Text style={styles.rowValue}>{APP_VERSION}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="로그아웃"
            disabled={isSigningOut}
            onPress={() => setConfirmAction("logout")}
            style={({ pressed }) => [
              styles.plainRow,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="회원탈퇴"
            onPress={() => setConfirmAction("withdraw")}
            style={({ pressed }) => [
              styles.plainRow,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.withdrawText}>회원탈퇴</Text>
          </Pressable>
        </View>
      </ScrollView>

      <InquiryBottomSheet
        visible={isInquiryOpen}
        defaultEmail={accountEmail}
        isPending={isSendingInquiry}
        onSubmit={(values) => {
          void handleInquiry(values);
        }}
        onClose={() => setIsInquiryOpen(false)}
      />

      <ConfirmModal
        visible={confirmAction === "logout"}
        title="정말 로그아웃하시겠습니까?"
        message="다시 로그인하면 그대로 이어서 쓸 수 있어요."
        confirmLabel="로그아웃"
        image={cryingWhaleImage}
        destructive
        isPending={isSigningOut}
        onConfirm={() => {
          void handleLogout();
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* 탈퇴 처리 API가 아직 없어서 확인까지만 받고 안내를 띄운다 */}
      <ConfirmModal
        visible={confirmAction === "withdraw"}
        title="정말 탈퇴하시겠습니까?"
        message="탈퇴하면 작성한 글과 친구 관계가 모두 사라지고 되돌릴 수 없어요."
        confirmLabel="탈퇴"
        image={cryingWhaleImage}
        destructive
        onConfirm={() => {
          setConfirmAction(null);
          showComingSoon("회원탈퇴");
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </SafeAreaView>
  );
}

function SettingSection({
  title,
  rows,
  onUnavailable,
}: {
  title: string;
  rows: SettingRow[];
  onUnavailable: (label: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.map((row) => (
        <Pressable
          key={row.label}
          accessibilityRole="button"
          accessibilityLabel={row.label}
          onPress={() => (row.go ? row.go() : onUnavailable(row.label))}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <SettingIcon name={row.icon} />
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Ionicons name="chevron-forward" size={18} color="#000000" />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: white,
  },
  screen: {
    flex: 1,
    backgroundColor: background,
  },
  content: {
    paddingBottom: 60,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: white,
  },
  headerSide: {
    width: 40,
    alignItems: "flex-start",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  // 섹션은 흰 카드, 사이 간격은 배경색이 그대로 비쳐 구분선처럼 보인다.
  section: {
    marginTop: 8,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: white,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  profileRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightGray,
  },
  avatarPlaceholder: {
    backgroundColor: lightGray,
  },
  profileText: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  profileName: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  profileTag: {
    marginTop: 2,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 16,
  },
  row: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 15,
    lineHeight: 20,
  },
  rowValue: {
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 18,
  },
  plainRow: {
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  logoutText: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  withdrawText: {
    color: red,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 15,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.6,
  },
});
