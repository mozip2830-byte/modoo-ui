import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { deleteStorageFile, pickImages, uploadImage } from "@/src/actions/storageActions";
import { buildTrustDoc } from "@/src/actions/trustActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { autoRecompress, createThumb } from "@/src/lib/imageCompress";
import { createUploadQueue } from "@/src/lib/uploadQueue";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { usePartnerEntitlement } from "@/src/lib/usePartnerEntitlement";
import { usePartnerUser } from "@/src/lib/usePartnerUser";
import { PartnerPhotoDoc } from "@/src/types/models";
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

export default function PartnerProfileTab() {
  const router = useRouter();
  const partnerId = useAuthUid();
  const { partner, pointsBalance, subscriptionActive } = usePartnerEntitlement(partnerId);
  const { user } = usePartnerUser(partnerId);
  const target = partnerId ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  const [photos, setPhotos] = useState<PartnerPhotoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploadQueue = useMemo(() => createUploadQueue(2), []);

  useEffect(() => {
    if (!partnerId) {
      setError(LABELS.messages.loginRequired);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "partners", partnerId, "photos"),
      orderBy("isPrimary", "desc"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPhotos(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<PartnerPhotoDoc, "id">),
          }))
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("[partner][photos] load error", err);
        setError("사진을 불러오지 못했습니다.");
        setLoading(false);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  const totalCount = photos.length + uploads.length;

  const updateUploadStatus = useCallback((id: string, updates: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  const uploadPhoto = useCallback(
    async (item: UploadItem) => {
      if (!partnerId) return;
      updateUploadStatus(item.id, { status: "uploading", errorMessage: undefined });

      const photoRef = doc(db, "partners", partnerId, "photos", item.id);
      const storagePath = `partners/${partnerId}/photos/${item.id}.jpg`;
      const thumbPath = `partners/${partnerId}/photos/thumbs/${item.id}.jpg`;

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

        const uploaded = await uploadImage({
          uri: prepared.uri,
          storagePath,
          contentType: "image/jpeg",
        });
        const thumbUploaded = await uploadImage({
          uri: thumb.uri,
          storagePath: thumbPath,
          contentType: "image/jpeg",
        });

        await setDoc(
          photoRef,
          {
            url: uploaded.url,
            thumbUrl: thumbUploaded.url,
            storagePath,
            thumbPath,
            width: prepared.width ?? item.width,
            height: prepared.height ?? item.height,
            sizeBytes: prepared.sizeBytes ?? uploaded.sizeBytes ?? item.sizeBytes,
            createdAt: serverTimestamp(),
            isPrimary: item.isPrimary ?? false,
          },
          { merge: true }
        );
        await updateDoc(doc(db, "partners", partnerId), {
          photoCount: increment(1),
          updatedAt: serverTimestamp(),
        });
        setUploads((prev) => prev.filter((upload) => upload.id !== item.id));
      } catch (uploadError: any) {
        updateUploadStatus(item.id, {
          status: "error",
          errorMessage: uploadError?.message ?? "업로드에 실패했습니다.",
        });
      }
    },
    [partnerId, updateUploadStatus]
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

      const hasPrimary = photos.some((photo) => photo.isPrimary) || uploads.some((item) => item.isPrimary);
      let primaryAssigned = hasPrimary;

      const nextUploads: UploadItem[] = assets.slice(0, remaining).map((asset) => {
        const photoId = doc(collection(db, "partners", partnerId, "photos")).id;
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
  }, [partnerId, photos, totalCount, uploadPhoto, uploadQueue, uploads]);

  const handleRetry = useCallback(
    async (item: UploadItem) => {
      if (!partnerId) return;
      updateUploadStatus(item.id, { status: "queued", errorMessage: undefined });
      await uploadQueue.enqueue(() => uploadPhoto(item));
    },
    [partnerId, updateUploadStatus, uploadPhoto, uploadQueue]
  );

  const handleDelete = useCallback(
    (photo: PartnerPhotoDoc) => {
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
                await deleteStorageFile(photo.thumbPath);
              }
              await deleteDoc(doc(db, "partners", partnerId, "photos", photo.id));
              await updateDoc(doc(db, "partners", partnerId), {
                photoCount: increment(-1),
                updatedAt: serverTimestamp(),
              });
            } catch (err) {
              console.error("[partner][photos] delete error", err);
              setError("사진 삭제에 실패했습니다.");
            }
          },
        },
      ]);
    },
    [partnerId]
  );

  const handleSetPrimary = useCallback(
    async (photo: PartnerPhotoDoc) => {
      if (!partnerId) return;
      try {
        const batch = writeBatch(db);
        photos.forEach((item) => {
          const ref = doc(db, "partners", partnerId, "photos", item.id);
          batch.update(ref, { isPrimary: item.id === photo.id });
        });
        await batch.commit();
      } catch (err) {
        console.error("[partner][photos] primary error", err);
        setError("대표 사진을 변경하지 못했습니다.");
      }
    },
    [partnerId, photos]
  );

  const combinedItems = useMemo(() => {
    const uploadItems = uploads.map((item) => ({
      id: item.id,
      url: item.uri,
      thumbUrl: item.uri,
      storagePath: `partners/${partnerId ?? ""}/photos/${item.id}.jpg`,
      createdAt: null,
      isPrimary: item.isPrimary ?? false,
      __upload: item,
    }));

    return [...uploadItems, ...photos];
  }, [partnerId, photos, uploads]);

  const trust =
    partner?.trust ??
    buildTrustDoc({
      businessVerified: partner?.businessVerified ?? false,
      profilePhotosCount: photos.length,
      reviewCount: partner?.trust?.factors?.reviewCount ?? 0,
      reviewAvg: partner?.trust?.factors?.reviewAvg ?? 0,
      responseRate7d: partner?.trust?.factors?.responseRate7d ?? 0,
      responseTimeMedianMin7d: partner?.trust?.factors?.responseTimeMedianMin7d ?? 0,
      reportCount90d: partner?.trust?.factors?.reportCount90d ?? 0,
    });

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
            <Text style={styles.balanceLabel}>보유 포인트</Text>
            <Text style={styles.balanceValue}>{pointsBalance.toLocaleString()}p</Text>
            <Chip label={subscriptionActive ? "구독 활성" : "포인트 이용"} />
          </Card>
          <PrimaryButton label="포인트 충전" onPress={() => router.push("/(partner)/billing")} />
        </View>

        <Card style={styles.verifyCard}>
          <View style={styles.verifyHeader}>
            <Text style={styles.verifyTitle}>사업자 인증</Text>
            <Chip
              label={user?.verificationStatus ?? "미제출"}
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

        <Card style={styles.trustCard}>
          <View style={styles.trustHeader}>
            <Text style={styles.trustTitle}>신뢰도</Text>
            <Chip label={trust.badge} tone="success" />
          </View>
          <Text style={styles.trustScore}>{trust.score}점</Text>
          <Text style={styles.trustTier}>등급 {trust.tier}</Text>
          <Text style={styles.trustGuide}>
            사업자 인증, 프로필 사진, 응답률 관리로 신뢰도를 높일 수 있습니다.
          </Text>
        </Card>

        <Card style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>서비스 설정</Text>
          <TouchableOpacity style={styles.settingsRow} onPress={() => router.push("/(partner)/settings/services")}>
            <Text style={styles.settingsLabel}>서비스 품목 설정</Text>
            <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsRow} onPress={() => router.push("/(partner)/settings/regions")}>
            <Text style={styles.settingsLabel}>서비스 지역 설정</Text>
            <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
          </TouchableOpacity>
        </Card>

        <AppHeader
          title={LABELS.headers.photos}
          subtitle="업체 사진으로 신뢰도를 높여보세요."
          rightAction={<Text style={styles.counter}>{photos.length}/{MAX_PARTNER_PHOTOS}</Text>}
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
    handlePick,
    loading,
    photos.length,
    pointsBalance,
    router,
    subscriptionActive,
    target,
    trust.badge,
    trust.score,
    trust.tier,
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
        ListEmptyComponent={
          loading ? null : <Text style={styles.muted}>사진이 없습니다.</Text>
        }
        renderItem={({ item }) => {
          const upload = (item as any).__upload as UploadItem | undefined;
          const isPrimary = Boolean((item as PartnerPhotoDoc).isPrimary);

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
                      onPress={() => handleSetPrimary(item as PartnerPhotoDoc)}
                    >
                      <Text style={styles.primaryBtnText}>{LABELS.actions.setPrimary}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(item as PartnerPhotoDoc)}
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

  trustCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.xs },
  verifyCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  verifyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  verifyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  verifyDesc: { color: colors.subtext, fontSize: 12 },

  trustHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  trustTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  trustScore: { fontSize: 22, fontWeight: "800", color: colors.primary },
  trustTier: { color: colors.subtext, fontSize: 12, fontWeight: "600" },
  trustGuide: { color: colors.subtext, fontSize: 12 },

  settingsCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
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
});
