import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  ListRenderItemInfo,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { FontFamily } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GAP = 2;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - GAP * 2) / 3);
const PAGE_SIZE = 60;

interface Props {
  /**
   * @param uris        확정된 이미지 URI. resolveLocalUri 를 켜면 읽기 가능한 file:// 로 변환된 값이다.
   * @param sourceUris  변환 전 원본 에셋 URI. initialSelectedUris 로 다시 넘기면 재선택이 복원된다.
   */
  onConfirm: (uris: string[], sourceUris: string[]) => void;
  onClose: () => void;
  maxSelect?: number;
  /** 원본 에셋 URI 목록 (onConfirm 의 sourceUris) */
  initialSelectedUris?: string[];
  /**
   * true 면 확정 시 미디어 라이브러리 에셋을 읽기 가능한 로컬 파일(file://) URI 로 변환해 전달한다.
   * (iOS 의 ph:// URI 는 파일 시스템/업로드에서 직접 읽을 수 없으므로 업로드가 필요한 화면에서 사용)
   */
  resolveLocalUri?: boolean;
}

type PhotoItem = { uri: string; id: string };
type GridItem = { type: 'camera' } | { type: 'photo'; item: PhotoItem };

export function CustomImagePicker({
  onConfirm,
  onClose,
  maxSelect = 10,
  initialSelectedUris = [],
  resolveLocalUri = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [mediaPermission, requestMediaPermission, getMediaPermission] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const endCursorRef = useRef<string | undefined>(undefined);
  const hasNextPageRef = useRef(true);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    // 이미 권한이 있으면 다시 요청하지 않음.
    // Android 14에서 requestPermissionsAsync를 재호출하면 시스템 다이얼로그가 다시 뜨고,
    // 사용자가 "일부만 허용"을 누르면 권한이 제한으로 바뀌는 문제가 생김.
    const init = async () => {
      const current = await getMediaPermission();
      // granted(limited 포함)이면 다이얼로그 스킵 → 각 상태에 맞는 화면 표시.
      // Android 14에서 limited→all 업그레이드는 시스템 다이얼로그가 아닌 설정 앱으로 유도해야 함.
      if (current.granted) return;
      await requestMediaPermission();
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // limited 상태는 getAssetsAsync가 READ_MEDIA_IMAGES 권한 없음으로 실패하므로 스킵.
    if (mediaPermission?.accessPrivileges !== 'all') return;
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaPermission?.accessPrivileges]);

  const loadInitial = async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        mediaType: MediaLibrary.MediaType.photo,
      });
      setPhotos(result.assets.map(a => ({ uri: a.uri, id: a.id })));
      endCursorRef.current = result.endCursor;
      hasNextPageRef.current = result.hasNextPage;
      if (initialSelectedUris.length > 0) {
        const restoredIds = result.assets
          .filter(a => initialSelectedUris.includes(a.uri))
          .map(a => a.id);
        if (restoredIds.length > 0) setSelectedIds(restoredIds);
      }
    } catch (e) {
      console.warn('[CustomImagePicker] loadInitial error', e);
    } finally {
      isLoadingRef.current = false;
    }
  };

  const loadMore = async () => {
    if (isLoadingRef.current || !hasNextPageRef.current) return;
    isLoadingRef.current = true;
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        after: endCursorRef.current,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        mediaType: MediaLibrary.MediaType.photo,
      });
      setPhotos(prev => [...prev, ...result.assets.map(a => ({ uri: a.uri, id: a.id }))]);
      endCursorRef.current = result.endCursor;
      hasNextPageRef.current = result.hasNextPage;
    } catch (e) {
      console.warn('[CustomImagePicker] loadMore error', e);
    } finally {
      isLoadingRef.current = false;
    }
  };

  const handleCameraPress = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    const id = `cam_${Date.now()}`;
    setPhotos(prev => [{ uri, id }, ...prev]);
    // Auto-select the captured photo
    setSelectedIds(prev => {
      if (prev.length >= maxSelect) return prev;
      return [...prev, id];
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id);
      if (prev.length >= maxSelect) {
        Alert.alert('선택 초과', `최대 ${maxSelect}장까지 선택할 수 있습니다.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleConfirm = async () => {
    const selected = selectedIds
      .map(id => ({ id, uri: photos.find(p => p.id === id)?.uri }))
      .filter((s): s is { id: string; uri: string } => !!s.uri);

    const sourceUris = selected.map(s => s.uri);

    if (!resolveLocalUri) {
      onConfirm(sourceUris, sourceUris);
      return;
    }

    // 라이브러리 에셋(ph://)은 getAssetInfoAsync 로 읽기 가능한 localUri(file://)로 변환한다.
    // 카메라 촬영본(cam_*)은 이미 file:// 이므로 그대로 사용.
    const resolved = await Promise.all(
      selected.map(async ({ id, uri }) => {
        if (id.startsWith('cam_')) {
          return uri;
        }
        try {
          const info = await MediaLibrary.getAssetInfoAsync(id);
          return info.localUri ?? uri;
        } catch (e) {
          console.warn('[CustomImagePicker] getAssetInfoAsync error', e);
          return uri;
        }
      }),
    );

    onConfirm(resolved, sourceUris);
  };

  if (!mediaPermission) return null;

  if (!mediaPermission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <PickerHeader onClose={onClose} onConfirm={handleConfirm} count={selectedIds.length} />
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>사진첩 접근 권한이 필요합니다.</Text>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => void Linking.openSettings()}>
            <Text style={styles.settingsBtnText}>설정 열기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (mediaPermission.accessPrivileges === 'limited') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <PickerHeader onClose={onClose} onConfirm={handleConfirm} count={selectedIds.length} />
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>
            사진첩에 접근하려면{'\n'}‘모든 사진 허용’이 필요합니다.
          </Text>
          <Text style={styles.permissionSubText}>
            설정 → 앱 → whale-app → 권한 → 사진 및 동영상{'\n'}→ ‘모두 허용’ 선택
          </Text>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => void Linking.openSettings()}>
            <Text style={styles.settingsBtnText}>설정 열기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const data: GridItem[] = [
    { type: 'camera' },
    ...photos.map(item => ({ type: 'photo' as const, item })),
  ];

  const renderItem = ({ item, index }: ListRenderItemInfo<GridItem>) => {
    const col = index % 3;
    const gapStyle = col > 0 && styles.cellGapLeft;

    if (item.type === 'camera') {
      return (
        <TouchableOpacity
          style={[styles.cell, styles.cameraCell, gapStyle]}
          onPress={() => void handleCameraPress()}
          activeOpacity={0.7}>
          <CameraIcon />
        </TouchableOpacity>
      );
    }

    const { item: photo } = item;
    const selIdx = selectedIds.indexOf(photo.id);
    const isSelected = selIdx !== -1;

    return (
      <TouchableOpacity
        style={[styles.cell, gapStyle]}
        onPress={() => toggleSelect(photo.id)}
        activeOpacity={0.85}>
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {isSelected && (
          <View style={styles.checkOverlay}>
            <View style={styles.checkBadge}>
              <Text style={styles.checkNum}>{selIdx + 1}</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PickerHeader onClose={onClose} onConfirm={handleConfirm} count={selectedIds.length} />
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={item => (item.type === 'camera' ? '__cam__' : item.item.id)}
        numColumns={3}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
      />
    </View>
  );
}

function PickerHeader({
  onClose,
  onConfirm,
  count,
}: {
  onClose: () => void;
  onConfirm: () => void;
  count: number;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} hitSlop={12}>
        <Text style={styles.cancelText}>취소</Text>
      </TouchableOpacity>
      <Text style={styles.titleText}>사진 선택</Text>
      <TouchableOpacity onPress={onConfirm} disabled={count === 0} hitSlop={12}>
        <Text style={[styles.confirmText, count === 0 && styles.confirmTextOff]}>
          완료{count > 0 ? ` (${count})` : ''}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function CameraIcon() {
  return (
    <Svg width={32} height={28} viewBox="0 0 32 28" fill="none">
      {/* 카메라 바디 */}
      <Rect x="1" y="6" width="30" height="21" rx="3" stroke="#888" strokeWidth="1.8" />
      {/* 렌즈 */}
      <Path
        d="M16 22a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"
        stroke="#888"
        strokeWidth="1.8"
      />
      {/* 뷰파인더 돌출부 */}
      <Path d="M11 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" stroke="#888" strokeWidth="1.8" />
      {/* 플래시 점 */}
      <Rect x="25" y="10" width="3" height="3" rx="1.5" fill="#888" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  header: {
    height: 52,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  cancelText: {
    fontSize: 14,
    color: '#333',
    fontFamily: FontFamily.pretendardRegular,
  },
  titleText: {
    fontSize: 16,
    color: '#111',
    fontFamily: FontFamily.pretendardSemiBold,
  },
  confirmText: {
    fontSize: 14,
    color: '#007AFF',
    fontFamily: FontFamily.pretendardSemiBold,
  },
  confirmTextOff: {
    color: '#aaa',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#fff',
  },
  permissionText: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    paddingHorizontal: 32,
    fontFamily: FontFamily.pretendardRegular,
  },
  settingsBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  settingsBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FontFamily.pretendardSemiBold,
  },
  permissionSubText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 18,
    fontFamily: FontFamily.pretendardRegular,
  },
  listContent: {
    gap: GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    overflow: 'hidden',
    marginBottom: GAP,
  },
  cameraCell: {
    backgroundColor: '#c8c8c8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellGapLeft: {
    marginLeft: GAP,
  },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'flex-end',
    padding: 5,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkNum: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FontFamily.pretendardSemiBold,
  },
});
