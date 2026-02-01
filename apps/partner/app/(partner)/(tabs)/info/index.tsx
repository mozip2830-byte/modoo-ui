import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
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

export default function PartnerInfoTab() {
  const router = useRouter();
  const { uid: partnerId } = useAuthUid();
  const { user } = usePartnerUser(partnerId);

  const [photos, setPhotos] = useState<StoragePhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [partnerName, setPartnerName] = useState("");
  const [partnerDraft, setPartnerDraft] = useState("");
  const [partnerEditing, setPartnerEditing] = useState(false);
  const [partnerSaving, setPartnerSaving] = useState(false);
  const [intro, setIntro] = useState("");
  const [introSaving, setIntroSaving] = useState(false);
  const uploadQueue = useMemo(() => createUploadQueue(2), []);

  // Load photos from Storage (not Firestore)
  const loadPhotos = useCallback(async () => {
    if (!partnerId) {
      return;
    }

    try {
      setLoading(true);
      const storagePhotos = await listStoragePhotos(partnerId);
      setPhotos(storagePhotos);
      if (storagePhotos.length) {
        const primary = storagePhotos.find((photo) => photo.isPrimary) ?? storagePhotos[0];
        try {
          await updateDoc(doc(db, "partners", partnerId), {
            photoUrl: primary?.url ?? null,
            profileImages: storagePhotos.map((photo) => photo.url),
            updatedAt: new Date(),
          });
        } catch (err) {
          console.warn("[partner][photos] profile sync error", err);
        }
      }
      setError(null);
    } catch (err) {
      console.error("[partner][photos] load error", err);
      setError("사진을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    if (!partnerId) return;
    loadPhotos();
  }, [partnerId, loadPhotos]);

  useEffect(() => {
    const nextIntro =
      (user as any)?.description ??
      (user as any)?.intro ??
      "";
    setIntro(typeof nextIntro === "string" ? nextIntro : "");
  }, [user]);

  useEffect(() => {
    const run = async () => {
      if (!partnerId) return;
      try {
        const snap = await getDoc(doc(db, "partners", partnerId));
        if (!snap.exists()) return;
        const data = snap.data() as { companyName?: string; name?: string };
        const next = data.companyName ?? data.name ?? "";
        const value = typeof next === "string" ? next : "";
        setPartnerName(value);
        setPartnerDraft(value);
      } catch (err) {
        console.error("[partner][info] partner load error", err);
      }
    };
    run();
  }, [partnerId]);

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
        const uploaded = await uploadImage({
          uri: prepared.uri,
          storagePath,
          contentType: "image/jpeg",
        });
        await uploadImage({
          uri: thumb.uri,
          storagePath: thumbPath,
          contentType: "image/jpeg",
        });

        const updates: Record<string, unknown> = {
          profileImages: arrayUnion(uploaded.url),
        };
        if (item.isPrimary) {
          updates.photoUrl = uploaded.url;
        }
        await updateDoc(doc(db, "partners", partnerId), updates);

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
      if (!partnerId || !photo.storagePath) return;

      try {
        await setStoragePrimaryPhoto(partnerId, photo.storagePath);
        await loadPhotos();
      } catch (err) {
        console.error("[partner][photos] set primary error", err);
        setError("대표 사진 설정에 실패했습니다.");
      }
    },
    [partnerId, loadPhotos]
  );

  const handleSaveIntro = useCallback(async () => {
    if (!partnerId) return;

    setIntroSaving(true);
    try {
      const trimmed = intro.trim();
      await updateDoc(doc(db, "partners", partnerId), { description: trimmed });
      Alert.alert("파트너 소개 저장", "파트너 소개가 저장되었습니다.");
    } catch (err) {
      console.error("[partner][info] intro save error", err);
      Alert.alert("저장 실패", "파트너 소개 저장에 실패했습니다.");
    } finally {
      setIntroSaving(false);
    }
  }, [intro, partnerId]);

  const handleSavePartnerName = useCallback(async () => {
    if (!partnerId) return;
    const trimmed = partnerDraft.trim();
    if (!trimmed) {
      Alert.alert("파트너명", "파트너명을 입력해 주세요.");
      return;
    }
    setPartnerSaving(true);
    try {
      await updateDoc(doc(db, "partners", partnerId), {
        name: trimmed,
        nameLower: trimmed.toLowerCase(),
        companyName: trimmed,
        updatedAt: new Date(),
      });
      setPartnerName(trimmed);
      setPartnerDraft(trimmed);
      setPartnerEditing(false);
      Alert.alert("파트너명 저장", "파트너명이 저장되었습니다.");
    } catch (err) {
      console.error("[partner][info] partner save error", err);
      Alert.alert("저장 실패", "파트너명 저장에 실패했습니다.");
    } finally {
      setPartnerSaving(false);
    }
  }, [partnerDraft, partnerId]);

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
          title="내정보"
          subtitle="파트너 정보를 관리해요."
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.profileButtonRow}>
          <PrimaryButton
            label="내 프로필 보기"
            onPress={() => {
              if (!partnerId) return;
              router.push("/(partner)/profile/view");
            }}
          />
        </View>

        <Card style={styles.partnerCard}>
          <View style={styles.partnerHeader}>
            <Text style={styles.partnerTitle}>파트너명</Text>
            {!partnerEditing ? (
              <TouchableOpacity
                style={styles.partnerEditBtn}
                onPress={() => setPartnerEditing(true)}
              >
                <Text style={styles.partnerEditText}>편집</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {partnerEditing ? (
            <>
              <TextInput
                value={partnerDraft}
                onChangeText={setPartnerDraft}
                placeholder="파트너명을 입력해 주세요."
                maxLength={40}
                style={styles.partnerInput}
              />
              <View style={styles.partnerFooter}>
                <SecondaryButton
                  label="취소"
                  onPress={() => {
                    setPartnerDraft(partnerName);
                    setPartnerEditing(false);
                  }}
                  disabled={partnerSaving}
                />
                <PrimaryButton
                  label={partnerSaving ? "저장 중..." : "저장"}
                  onPress={handleSavePartnerName}
                  disabled={partnerSaving}
                />
              </View>
            </>
          ) : (
            <Text style={styles.partnerValue}>{partnerName || "-"}</Text>
          )}
        </Card>

        <Card style={styles.introCard}>
          <Text style={styles.introTitle}>파트너 소개</Text>
          <TextInput
            value={intro}
            onChangeText={setIntro}
            placeholder="파트너를 소개해 주세요."
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
          title="파트너 사진"
          subtitle="파트너 사진으로 신뢰도를 높여보세요."
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
    partnerName,
    partnerDraft,
    partnerEditing,
    partnerSaving,
    error,
    handleSavePartnerName,
    handlePick,
    handleSaveIntro,
    intro,
    introSaving,
    loading,
    photos.length,
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
        initialNumToRender={9}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={true}
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

  error: { color: "red", fontSize: 12, marginHorizontal: spacing.lg, marginBottom: spacing.md },

  partnerCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  partnerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  partnerTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  partnerValue: { color: colors.text, fontSize: 14 },
  partnerEditBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  partnerEditText: { color: colors.subtext, fontSize: 12, fontWeight: "600" },
  partnerInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 14,
  },
  partnerFooter: { flexDirection: "row", gap: spacing.sm },

  introCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  introTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  introInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 14,
    minHeight: 100,
  },
  introFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  introCount: { color: colors.subtext, fontSize: 12 },

  actionRow: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },

  profileButtonRow: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },

  loadingBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  muted: { color: colors.subtext, fontSize: 12, textAlign: "center" },

  gridRow: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  listContent: {
    paddingBottom: spacing.lg,
  },

  photoWrap: {
    flex: 1,
    aspectRatio: 1,
    padding: 0,
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%" },

  primaryBadge: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  photoActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  primaryBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  deleteBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignItems: "center",
  },
  deleteText: {
    color: "#ff6b6b",
    fontSize: 11,
    fontWeight: "600",
  },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayActions: {
    alignItems: "center",
    gap: spacing.sm,
  },
  overlayText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  retryBtn: {
    marginTop: spacing.xs,
  },
});
