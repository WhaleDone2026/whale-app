import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NotificationBellIcon } from '@/components/notification-bell-icon';
import { background, darkGray, FontFamily, primary, white } from '@/constants/theme';
import { useUnseenNotifications } from '@/hooks/use-unseen-notifications';

function Segment({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segmentPill, selected && styles.segmentPillSelected]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}>
      <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function HomeHeader({ active }: { active: 'feed' | 'group' }) {
  const router = useRouter();
  const hasUnseen = useUnseenNotifications();

  const go = (tab: 'feed' | 'group') => {
    if (tab === 'feed') {
      router.replace('/(tabs)/home');
      return;
    }
    router.replace('/(tabs)/home/group');
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.iconsRow}>
        <View style={styles.iconRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="알림"
            onPress={() => router.push('/(tabs)/home/notifications')}
            hitSlop={8}
            style={styles.iconHit}>
            <NotificationBellIcon hasUnseen={hasUnseen} color={darkGray} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="설정"
            hitSlop={8}
            onPress={() => router.push('/(tabs)/profile/settings')}
            style={styles.iconHit}>
            <Ionicons name="settings-outline" size={22} color={darkGray} />
          </Pressable>
        </View>
      </View>
      <View style={styles.segmentSection}>
        <View style={styles.segmentRow}>
          <Segment label="친구" selected={active === 'group'} onPress={() => go('group')} />
          <Segment label="피드" selected={active === 'feed'} onPress={() => go('feed')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: background,
    zIndex: 10,
  },
  iconsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  segmentSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  segmentPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  segmentPillSelected: {
    backgroundColor: primary,
  },
  segmentLabel: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 12,
    color: darkGray,
  },
  segmentLabelSelected: {
    color: white,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconHit: {
    padding: 4,
  },
});
