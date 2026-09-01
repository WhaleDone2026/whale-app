import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { red, white } from '@/constants/theme';

type Props = {
  hasUnseen: boolean;
  size?: number;
  color: string;
};

/**
 * 알림 종 아이콘 + 확인하지 않은 알림이 있을 때의 레드닷.
 *
 * Pressable 은 감싸지 않는다 — 홈 헤더와 프로필 화면이 각각 다른 히트 영역·눌림
 * 스타일을 쓰고 있어서, 아이콘만 교체할 수 있게 두는 편이 덜 침습적이다.
 */
export function NotificationBellIcon({ hasUnseen, size = 22, color }: Props) {
  return (
    <View>
      <Ionicons name="notifications-outline" size={size} color={color} />
      {hasUnseen ? (
        // 배경색과 같은 테두리를 둘러야 아이콘 선과 겹쳐도 점이 뭉개지지 않는다.
        <View style={styles.dot} accessibilityLabel="확인하지 않은 알림 있음" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: red,
    borderWidth: 1.5,
    borderColor: white,
  },
});
