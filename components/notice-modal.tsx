import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { darkGray, FontFamily, primary, white } from '@/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

/** 한 가지 안내만 전달할 때 쓰는 앱 내부 확인 모달. */
export function NoticeModal({
  visible,
  title,
  confirmLabel = '확인',
  onConfirm,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onConfirm}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onConfirm}
          accessible={false}
        />
        <View style={styles.card}>
          <Ionicons name="alert-circle" size={28} color={primary} />
          <Text style={styles.title}>{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            onPress={onConfirm}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.20)',
    paddingHorizontal: 40,
  },
  card: {
    width: '100%',
    maxWidth: 285,
    minHeight: 132,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: white,
    paddingTop: 22,
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 10,
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginTop: 4,
    marginRight: -10,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonText: {
    color: primary,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 14,
    lineHeight: 20,
  },
});
