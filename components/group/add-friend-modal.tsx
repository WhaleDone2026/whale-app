import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { usePostHog } from 'posthog-react-native';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { background, darkGray, FontFamily, gray, lightGray, primary, white } from '@/constants/theme';
import {
  cancelFriendRequest,
  fetchRelationStatuses,
  searchUsersByKeyword,
  sendFriendRequest,
  type FriendRelationStatus,
} from '@/src/services/friends';
import type { AppUser } from '@/src/services/users';

type AddFriendModalProps = {
  visible: boolean;
  currentUserId: string | null;
  onClose: () => void;
};

const SEARCH_DEBOUNCE_MS = 300;

export function AddFriendModal({ visible, currentUserId, onClose }: AddFriendModalProps) {
  const posthog = usePostHog();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AppUser[]>([]);
  const [statuses, setStatuses] = useState<Record<string, FriendRelationStatus>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});

  // 모달을 닫을 때 상태 초기화
  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setStatuses({});
      setPendingIds({});
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !currentUserId) {
      return;
    }

    const keyword = query.trim();

    if (!keyword) {
      setResults([]);
      setStatuses({});
      setIsSearching(false);
      return;
    }

    let isActive = true;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const users = await searchUsersByKeyword(keyword, currentUserId);

        if (!isActive) {
          return;
        }

        setResults(users);

        const relation = await fetchRelationStatuses(
          currentUserId,
          users.map((user) => user.id),
        );

        if (isActive) {
          setStatuses(relation);
        }
      } catch (error) {
        console.warn('[add-friend] Failed to search', error);
        if (isActive) {
          setResults([]);
          setStatuses({});
        }
      } finally {
        if (isActive) {
          setIsSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [query, visible, currentUserId]);

  const handleAdd = async (userId: string) => {
    if (!currentUserId || pendingIds[userId]) {
      return;
    }

    setPendingIds((current) => ({ ...current, [userId]: true }));
    // 낙관적 업데이트: 버튼을 즉시 '요청됨'으로 전환
    setStatuses((current) => ({ ...current, [userId]: 'requested' }));

    try {
      await sendFriendRequest(currentUserId, userId);
      posthog.capture('friend_request_sent');
    } catch (error) {
      console.warn('[add-friend] Failed to send request', error);
      // 실패 시 원상 복구
      setStatuses((current) => ({ ...current, [userId]: 'none' }));
    } finally {
      setPendingIds((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
    }
  };

  const handleCancel = async (userId: string) => {
    if (!currentUserId || pendingIds[userId]) {
      return;
    }

    setPendingIds((current) => ({ ...current, [userId]: true }));
    // 낙관적 업데이트: 버튼을 즉시 '추가' 가능 상태로 되돌린다.
    setStatuses((current) => ({ ...current, [userId]: 'none' }));

    try {
      await cancelFriendRequest(currentUserId, userId);
    } catch (error) {
      console.warn('[add-friend] Failed to cancel request', error);
      // 실패 시 원상 복구
      setStatuses((current) => ({ ...current, [userId]: 'requested' }));
    } finally {
      setPendingIds((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
    }
  };

  const renderItem = ({ item }: { item: AppUser }) => {
    const status = statuses[item.id] ?? 'none';

    return (
      <View style={styles.resultRow}>
        <Image source={item.profile_image} style={styles.avatar} contentFit="cover" />
        <View style={styles.resultInfo}>
          <Text style={styles.resultName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.resultTag} numberOfLines={1}>
            @{item.tag}
          </Text>
        </View>
        <ActionButton
          status={status}
          onAdd={() => handleAdd(item.id)}
          onCancel={() => handleCancel(item.id)}
        />
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>친구 추가하기</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={onClose}
              hitSlop={8}
              style={styles.closeButton}>
              <Ionicons name="close" size={24} color={darkGray} />
            </Pressable>
          </View>
          <View style={styles.divider} />

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={gray} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="이름 또는 아이디 검색"
              placeholderTextColor={gray}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                {isSearching ? (
                  <ActivityIndicator color={primary} size="small" />
                ) : query.trim().length > 0 ? (
                  <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
                ) : (
                  <Text style={styles.emptyText}>이름 또는 아이디로 친구를 검색해 보세요.</Text>
                )}
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({
  status,
  onAdd,
  onCancel,
}: {
  status: FriendRelationStatus;
  onAdd: () => void;
  onCancel: () => void;
}) {
  if (status === 'friend') {
    return (
      <View style={[styles.actionButton, styles.friendButton]}>
        <Text style={[styles.actionText, styles.friendText]}>친구</Text>
      </View>
    );
  }

  if (status === 'requested') {
    // '요청됨' 상태에서 한 번 더 누르면 보낸 친구 요청을 취소한다.
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="친구 요청 취소"
        onPress={onCancel}
        style={({ pressed }) => [styles.actionButton, styles.requestedButton, pressed && styles.pressed]}>
        <Text style={[styles.actionText, styles.requestedText]}>요청됨</Text>
      </Pressable>
    );
  }

  if (status === 'incoming') {
    return (
      <View style={[styles.actionButton, styles.requestedButton]}>
        <Text style={[styles.actionText, styles.requestedText]}>요청받음</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="친구 추가"
      onPress={onAdd}
      style={({ pressed }) => [styles.actionButton, styles.addButton, pressed && styles.pressed]}>
      <Text style={[styles.actionText, styles.addText]}>추가</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.20)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
    borderRadius: 12,
    backgroundColor: white,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
  },
  title: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 22,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    marginTop: 16,
    height: 1,
    backgroundColor: lightGray,
  },
  searchBar: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 21,
    backgroundColor: background,
  },
  searchInput: {
    flex: 1,
    color: darkGray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 14,
    lineHeight: 18,
    padding: 0,
  },
  list: {
    marginTop: 8,
  },
  listContent: {
    paddingVertical: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightGray,
  },
  resultInfo: {
    flex: 1,
    marginLeft: 12,
  },
  resultName: {
    color: darkGray,
    fontFamily: FontFamily.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  resultTag: {
    marginTop: 2,
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  actionButton: {
    minWidth: 56,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: FontFamily.pretendardMedium,
    fontSize: 14,
    lineHeight: 16,
  },
  addButton: {
    backgroundColor: primary,
  },
  addText: {
    color: white,
  },
  friendButton: {
    backgroundColor: white,
    borderWidth: 1,
    borderColor: primary,
  },
  friendText: {
    color: primary,
  },
  requestedButton: {
    backgroundColor: background,
  },
  requestedText: {
    color: darkGray,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: gray,
    fontFamily: FontFamily.pretendardRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
