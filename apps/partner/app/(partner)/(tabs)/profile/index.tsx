import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { signOutPartner } from "@/src/actions/authActions";
import {
  deleteStorageFile,
  listStoragePhotos,
  pickImages,
  setStoragePrimaryPhoto,
  StoragePhotoItem,
  uploadImage,
} from "@/src/actions/storageActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { autoRecompress, createThumb } from "@/src/lib/imageCompress";
import { createUploadQueue } from "@/src/lib/uploadQueue";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { usePartnerEntitlement } from "@/src/lib/usePartnerEntitlement";
import { usePartnerUser } from "@/src/lib/usePartnerUser";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, radius, spacing } from "@/src/ui/tokens";

const MAX_PARTNER_PHOTOS = 20;
const PHOTO_MAX_SIZE = 1280;
const PHOTO_QUALITY = 0.7;
const THUMB_MAX_SIZE = 320;
const THUMB_QUALITY = 0.55;

type UploadItem = {
  id: string;
  uri: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  mimeType?: string | null;
  isPrimary?: boolean;
  status: "queued" | "uploading" | "error";
  errorMessage?: string;
};

function formatNumberSafe(value: unknown, suffix?: string) {
  let out: string | null = null;

  if (typeof value === "number" && Number.isFinite(value)) {
    out = value.toLocaleString("ko-KR");
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) out = parsed.toLocaleString("ko-KR");
    }
  }

  if (!out) return "-";
  return suffix ? `${out}${suffix}` : out;
}

export default function PartnerProfileTab() {
  const router = useRouter();
  const { uid: partnerId } = useAuthUid();
  const { partnerUser, generalTickets, serviceTickets, subscriptionActive } =
    usePartnerEntitlement(partnerId);
  const { user } = usePartnerUser(partnerId);
  const target = partnerId ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  const [photos, setPhotos] = useState<StoragePhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [intro, setIntro] = useState("");
  const [introSaving, setIntroSaving] = useState(false);
  const uploadQueue = useMemo(() => createUploadQueue(2), []);

  // Load photos from Storage (not Firestore)
  const loadPhotos = useCallback(async () => {
    if (!partnerId) {
      setError(LABELS.messages.loginRequired);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const storagePhotos = await listStoragePhotos(partnerId);
      setPhotos(storagePhotos);
      setError(null);
    } catch (err) {
      console.error("[partner][photos] load error", err);
      setError("사진을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    const nextIntro =
      (partnerUser as any)?.description ??
      (partnerUser as any)?.intro ??
      (user as any)?.description ??
      (user as any)?.intro ??
      "";
    setIntro(typeof nextIntro === "string" ? nextIntro : "");
  }, [partnerUser, user]);

  const totalCount = photos.length + uploads.length;

  const updateUploadStatus = useCallback((id: string, updates: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  // Upload photo to Storage only (no Firestore)
  const uploadPhoto = useCallback(
    async (item: UploadItem) => {
      if (!partnerId) return;
      updateUploadStatus(item.id, { status: "uploading", errorMessage: undefined });

      // Use "profile" as filename for primary, otherwise use unique ID
      const filename = item.isPrimary ? "profile" : item.id;
      const storagePath = `partners/${partnerId}/photos/${filename}.jpg`;
      const thumbPath = `partners/${partnerId}/photos/thumbs/${filename}.jpg`;

      try {
        const prepared = await autoRecompress(
          {
            uri: item.uri,
            maxSize: PHOTO_MAX_SIZE,
            quality: PHOTO_QUALITY,
          },
          1024 * 1024
        );
        const thumb = await createThumb(prepared.uri, THUMB_MAX_SIZE, THUMB_QUALITY);

        // Upload to Storage only
        await uploadImage({
          uri: prepared.uri,
          storagePath,
          contentType: "image/jpeg",
        });
        await uploadImage({
          uri: thumb.uri,
          storagePath: thumbPath,
          contentType: "image/jpeg",
        });

        // Remove from uploads and refresh list
        setUploads((prev) => prev.filter((upload) => upload.id !== item.id));
        await loadPhotos();
      } catch (uploadError: any) {
        updateUploadStatus(item.id, {
          status: "error",
          errorMessage: uploadError?.message ?? "업로드에 실패했습니다.",
        });
      }
    },
    [partnerId, updateUploadStatus, loadPhotos]
  );

  const handlePick = useCallback(async () => {
    if (!partnerId) {
      setError(LABELS.messages.loginRequired);
      return;
    }

    const remaining = MAX_PARTNER_PHOTOS - totalCount;
    if (remaining <= 0) {
      Alert.alert("업로드 제한", "사진은 최대 20장까지 업로드할 수 있습니다.");
      return;
    }

    try {
      const assets = await pickImages({ maxCount: remaining });
      if (!assets.length) return;

      if (assets.length > remaining) {
        Alert.alert("업로드 제한", "최대 20장까지만 업로드됩니다.");
      }

      // Check if primary photo exists (either in photos or pending uploads)
      const hasPrimary =
        photos.some((photo) => photo.isPrimary) || uploads.some((item) => item.isPrimary);
      let primaryAssigned = hasPrimary;

      const nextUploads: UploadItem[] = assets.slice(0, remaining).map((asset) => {
        // Generate unique ID using timestamp + random
        const photoId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const isPrimary = !primaryAssigned;
        if (!primaryAssigned) {
          primaryAssigned = true;
        }
        return {
          id: photoId,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          sizeBytes: asset.fileSize ?? undefined,
          mimeType: asset.mimeType ?? undefined,
          isPrimary,
          status: "queued",
        };
      });

      setUploads((prev) => [...prev, ...nextUploads]);
      nextUploads.forEach((item) => {
        uploadQueue.enqueue(() => uploadPhoto(item));
      });
    } catch (err: any) {
      setError(err?.message ?? "사진을 선택하지 못했습니다.");
    }
  }, [partnerId, totalCount, photos, uploads, uploadPhoto, uploadQueue]);

  const handleRetry = useCallback(
    async (item: UploadItem) => {
      if (!partnerId) return;
      updateUploadStatus(item.id, { status: "queued", errorMessage: undefined });
      await uploadQueue.enqueue(() => uploadPhoto(item));
    },
    [partnerId, updateUploadStatus, uploadPhoto, uploadQueue]
  );

  // Delete from Storage only
  const handleDelete = useCallback(
    (photo: StoragePhotoItem) => {
      if (!partnerId) return;
      Alert.alert("사진 삭제", "이 사진을 삭제할까요?", [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteStorageFile(photo.storagePath);
              if (photo.thumbPath) {
                await deleteStorageFile(photo.thumbPath).catch(() => {});
              }
              await loadPhotos();
            } catch (err) {
              console.error("[partner][photos] delete error", err);
              setError("사진 삭제에 실패했습니다.");
            }
          },
        },
      ]);
    },
    [partnerId, loadPhotos]
  );

  // Set primary by copying to profile.jpg (Storage-only)
  const handleSetPrimary = useCallback(
    async (photo: StoragePhotoItem) => {
      if (!partnerId) return;
      try {
        setLoading(true);
        await setStoragePrimaryPhoto(partnerId, photo.url);
        await loadPhotos();
      } catch (err) {
        console.error("[partner][photos] primary error", err);
        setError("대표 사진을 변경하지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [partnerId, loadPhotos]
  );

  const handleLogout = useCallback(() => {
    Alert.alert("로그아웃", "정말 로그아웃할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          try {
            await signOutPartner();
            router.replace("/(partner)/auth/login");
          } catch (err) {
            const message = err instanceof Error ? err.message : "로그아웃에 실패했습니다.";
            Alert.alert("로그아웃 실패", message);
          }
        },
      },
    ]);
  }, [router]);

  const handleSaveIntro = useCallback(async () => {
    if (!partnerId) return;
    const trimmed = intro.trim();
    if (trimmed.length > 2000) {
      Alert.alert("업체소개", "최대 2000자까지 입력할 수 있습니다.");
      return;
    }
    setIntroSaving(true);
    try {
      await updateDoc(doc(db, "partners", partnerId), { description: trimmed });
      Alert.alert("업체소개 저장", "업체 소개가 저장되었습니다.");
    } catch (err) {
      console.error("[partner][profile] intro save error", err);
      Alert.alert("저장 실패", "업체 소개 저장에 실패했습니다.");
    } finally {
      setIntroSaving(false);
    }
  }, [intro, partnerId]);

  const combinedItems = useMemo(() => {
    const uploadItems: (StoragePhotoItem & { __upload?: UploadItem })[] = uploads.map((item) => ({
      id: item.id,
      url: item.uri,
      thumbUrl: item.uri,
      storagePath: `partners/${partnerId ?? ""}/photos/${item.id}.jpg`,
      thumbPath: null,
      isPrimary: item.isPrimary ?? false,
      timeCreated: null,
      __upload: item,
    }));

    return [...uploadItems, ...photos];
  }, [partnerId, photos, uploads]);


  const Header = useMemo(() => {
    return (
      <View>
        <AppHeader
          title={LABELS.headers.profile}
          subtitle="업체 프로필을 관리해요."
          rightAction={
            <View style={styles.headerActions}>
              <NotificationBell href="/(partner)/notifications" />
              <TouchableOpacity onPress={() => router.push(target)} style={styles.iconBtn}>
                <FontAwesome name="user" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          }
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.summaryRow}>
          <Card style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>보유 입찰권</Text>
            <Text style={styles.balanceValue}>{formatNumberSafe(generalTickets, "장")}</Text>
            <Text style={styles.balanceMeta}>
              서비스 {formatNumberSafe(serviceTickets, "장")}
            </Text>
            <Chip label={subscriptionActive ? "구독 활성" : "입찰권 이용"} />
          </Card>
          <PrimaryButton label="입찰권 충전" onPress={() => router.push("/(partner)/billing")} />
        </View>

        <Card style={styles.verifyCard}>
          <View style={styles.verifyHeader}>
            <Text style={styles.verifyTitle}>사업자 인증</Text>
            <Chip
              label={user?.verificationStatus ?? "승인"}
              tone={user?.verificationStatus === "승인" ? "success" : "warning"}
            />
          </View>
          {user?.verificationStatus === "검수중" ? (
            <Text style={styles.verifyDesc}>
              서류 확인 중입니다. 보통 1~12시간(영업시간 기준) 내 완료됩니다.
            </Text>
          ) : user?.verificationStatus === "승인" ? (
            <Text style={styles.verifyDesc}>인증이 완료되어 견적 제안을 진행할 수 있습니다.</Text>
          ) : user?.verificationStatus === "반려" ? (
            <Text style={styles.verifyDesc}>반려되었습니다. 서류를 다시 제출해 주세요.</Text>
          ) : (
            <Text style={styles.verifyDesc}>사업자등록증 제출 후 견적 제안이 가능합니다.</Text>
          )}
          {user?.verificationStatus !== "승인" ? (
            <PrimaryButton
              label="사업자등록증 제출하기"
              onPress={() => router.push("/(partner)/verification")}
            />
          ) : null}
        </Card>

        <Card style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>서비스 설정</Text>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push("/(partner)/settings/services")}
          >
            <Text style={styles.settingsLabel}>서비스 품목 설정</Text>
            <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push("/(partner)/settings/regions")}
          >
            <Text style={styles.settingsLabel}>서비스 지역 설정</Text>
            <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
          </TouchableOpacity>
          <SecondaryButton label="로그아웃" onPress={handleLogout} style={styles.logoutBtn} />
        </Card>

        <Card style={styles.introCard}>
          <Text style={styles.introTitle}>업체 소개</Text>
          <TextInput
            value={intro}
            onChangeText={setIntro}
            placeholder="업체를 소개해 주세요."
            maxLength={2000}
            multiline
            style={styles.introInput}
            textAlignVertical="top"
          />
          <View style={styles.introFooter}>
            <Text style={styles.introCount}>{intro.length}/2000</Text>
            <PrimaryButton
              label={introSaving ? "저장 중..." : "저장"}
              onPress={handleSaveIntro}
              disabled={introSaving}
            />
          </View>
        </Card>

        <AppHeader
          title={LABELS.headers.photos}
          subtitle="업체 사진으로 신뢰도를 높여보세요."
          rightAction={
            <Text style={styles.counter}>
              {photos.length}/{MAX_PARTNER_PHOTOS}
            </Text>
          }
        />

        <View style={styles.actionRow}>
          <PrimaryButton label={LABELS.actions.addPhotos} onPress={handlePick} />
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator />
            <Text style={styles.muted}>{LABELS.messages.loading}</Text>
          </View>
        ) : null}
      </View>
    );
  }, [
    error,
    handleLogout,
    handlePick,
    handleSaveIntro,
    intro,
    introSaving,
    loading,
    photos.length,
    generalTickets,
    router,
    serviceTickets,
    subscriptionActive,
    target,
    user?.verificationStatus,
  ]);

  return (
    <Screen scroll={false} style={styles.container}>
      <FlatList
        data={loading ? [] : combinedItems}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={Header}
        ListEmptyComponent={loading ? null : <Text style={styles.muted}>사진이 없습니다.</Text>}
        renderItem={({ item }) => {
          const upload = (item as any).__upload as UploadItem | undefined;
          const isPrimary = Boolean(item.isPrimary);

          return (
            <Card style={styles.photoWrap}>
              <Image source={{ uri: item.thumbUrl ?? item.url }} style={styles.photo} />
              {isPrimary ? (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryText}>대표</Text>
                </View>
              ) : null}

              {upload ? (
                <View style={styles.overlay}>
                  {upload.status === "uploading" || upload.status === "queued" ? (
                    <View style={styles.overlayActions}>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.overlayText}>
                        {upload.status === "queued" ? "대기중" : "업로드중"}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.overlayActions}>
                      <Text style={styles.overlayText}>실패</Text>
                      <SecondaryButton
                        label={LABELS.actions.retry}
                        onPress={() => handleRetry(upload)}
                        style={styles.retryBtn}
                      />
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.photoActions}>
                  {!isPrimary ? (
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={() => handleSetPrimary(item as StoragePhotoItem)}
                    >
                      <Text style={styles.primaryBtnText}>{LABELS.actions.setPrimary}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(item as StoragePhotoItem)}
                  >
                    <Text style={styles.deleteText}>{LABELS.actions.delete}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  counter: { color: colors.subtext, fontSize: 12 },

  summaryRow: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  balanceCard: { flex: 1, gap: spacing.xs },
  balanceLabel: { color: colors.subtext, fontSize: 12 },
  balanceValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  balanceMeta: { color: colors.subtext, fontSize: 12 },

  verifyCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  verifyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  verifyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  verifyDesc: { color: colors.subtext, fontSize: 12 },


  settingsCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  introCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  introTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  introInput: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.card,
    color: colors.text,
  },
  introFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  introCount: { color: colors.subtext, fontSize: 12 },
  settingsTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  settingsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingsLabel: { color: colors.text, fontSize: 14 },

  actionRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  loadingBox: { padding: spacing.lg, alignItems: "center", gap: spacing.sm },
  muted: { color: colors.subtext, paddingTop: spacing.md, paddingHorizontal: spacing.lg },
  error: { color: colors.danger, marginTop: spacing.sm, paddingHorizontal: spacing.lg },

  // FlatList 전체 컨텐츠용 (헤더 + 그리드 포함)
  listContent: {
    paddingBottom: spacing.xxl,
  },

  // 그리드 전용
  gridRow: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  photoWrap: { width: "31%", aspectRatio: 1, marginBottom: spacing.sm, padding: 0 },
  photo: { width: "100%", height: "100%", borderRadius: radius.sm },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayActions: { alignItems: "center", gap: 6 },
  overlayText: { color: "#FFFFFF", fontSize: 12 },
  retryBtn: { marginTop: spacing.xs },

  photoActions: {
    position: "absolute",
    bottom: 6,
    right: 6,
    left: 6,
    flexDirection: "column",
    gap: 6,
    alignItems: "flex-end",
  },
  primaryBtn: {
    backgroundColor: "rgba(0,199,174,0.9)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 10 },
  deleteBtn: {
    backgroundColor: "rgba(239,68,68,0.9)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  deleteText: { color: "#FFFFFF", fontSize: 10 },

  primaryBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,199,174,0.9)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.lg,
  },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },

  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },

  // Optional style referenced in JSX
  logoutBtn: {},
});
