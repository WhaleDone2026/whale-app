import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmModal } from '@/components/confirm-modal';
import { darkGray, FontFamily, gray, lightGray, red, white } from '@/constants/theme';
import { SettingsHeader } from '@/src/pages/settings/shared';
import { fetchBlockedUsers, unblockUser, type BlockedUser } from '@/src/services/blocks';

export default function BlockedAccountsPage() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unblockTarget, setUnblockTarget] = useState<BlockedUser | null>(null);
  const [isUnblocking, setIsUnblocking] = useState(false);

  useEffect(() => {
    let isMounted = true;

    fetchBlockedUsers()
      .then((users) => {
        if (isMounted) {
          setBlockedUsers(users);
        }
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

  const handleUnblock = async (user: BlockedUser) => {
    setIsUnblocking(true);

    try {
      await unblockUser(user.id);
      setUnblockTarget(null);
      // 해제하면 더 이상 이 목록에 있을 이유가 없다. 친구 관계는 복구되지 않는다.
      setBlockedUsers((current) => current.filter((blocked) => blocked.id !== user.id));
    } catch (error) {
      setUnblockTarget(null);
      Alert.alert(error instanceof Error ? error.message : '차단을 해제하지 못했습니다.');
    } finally {
      setIsUnblocking(false);
    }
  };

  const renderItem: ListRenderItem<BlockedUser> = ({ item }) => (
    <View style={styles.row}>
      {item.profileImageUrl ? (
        <Image source={{ uri: item.profileImageUrl }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]} />
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.tag} numberOfLines={1}>
          @{item.tag ?? ''}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name} 차단 해제`}
        onPress={() => setUnblockTarget(item)}
        style={({ pressed }) => [styles.blockedButton, pressed && styles.pressed]}>
        <Text style={styles.blockedButtonText}>차단됨</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <SettingsHeader title="차단한 계정" />

      <FlatList
        data={blockedUsers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          isLoading ? null : <Text style={styles.countLabel}>{blockedUsers.length}명</Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            {isLoading ? (
              <ActivityIndicator color={gray} />
            ) : (
              <Text style={styles.emptyText}>차단한 계정이 없어요.</Text>
            )}
          </View>
        }
      />

      <ConfirmModal
        visible={unblockTarget != null}
        title={`${unblockTarget?.name ?? ''}님의 차단을 해제할까요?`}
        message="해제해도 친구 관계는 돌아오지 않아요. 다시 친구 요청을 보낼 수 있게 돼요."
        confirmLabel="해제"
        isPending={isUnblocking}
        onConfirm={() => {
          if (unblockTarget) {
            void handleUnblock(unblockTarget);
          }
        }}
        onCancel={() => setUnblockTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: white,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  countLabel: {
    paddingTop: 8,
    paddingBottom: 10,
    color: darkGray,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightGray,
  },
  avatarPlaceholder: {
    backgroundColor: lightGray,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  name: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  tag: {
    marginTop: 2,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  blockedButton: {
    minWidth: 64,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedButtonText: {
    color: red,
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  emptyBox: {
    paddingTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.6,
  },
});
