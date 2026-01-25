import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import { pickImages, uploadImage } from "@/src/actions/storageActions";
import { updatePartnerTrustFromReview } from "@/src/actions/trustActions";
import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { autoRecompress, createThumb } from "@/src/lib/imageCompress";
import { createUploadQueue } from "@/src/lib/uploadQueue";
import { Screen } from "@/src/components/Screen";

const MAX_REVIEW_PHOTOS = 5;
const REVIEW_MAX_CHARS = 500;
const REVIEW_MAX_SIZE = 1080;
const REVIEW_QUALITY = 0.65;
const THUMB_MAX_SIZE = 320;
const THUMB_QUALITY = 0.55;

type DraftPhoto = {
  id: string;
  uri: string;
  status: "ready" | "uploading" | "error" | "done";
  errorMessage?: string;
};

export default function ReviewCreateScreen() {
  const router = useRouter();
  const { partnerId, requestId, source, reviewId: reviewIdParam } = useLocalSearchParams<{
    partnerId?: string;
    requestId?: string;
    source?: string;
    reviewId?: string;
  }>();
  const auth = useAuthUid();
  const customerId = auth.uid;
  const ready = auth.status === "ready";
  const uploadQueue = useMemo(() => createUploadQueue(2), []);

  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(
    Array.isArray(reviewIdParam) ? reviewIdParam[0] : reviewIdParam ?? null
  );
  const [hasExistingReview, setHasExistingReview] = useState<boolean | null>(null);

  const computedReviewId = useMemo(() => {
    if (!requestId || !customerId) return null;
    return `${requestId}_${customerId}`;
  }, [requestId, customerId]);

  useEffect(() => {
    if (!reviewId && computedReviewId) {
      setReviewId(computedReviewId);
    }
  }, [computedReviewId, reviewId]);

  useEffect(() => {
    let cancelled = false;

    const validateAccess = async () => {
      if (!partnerId || !requestId || source !== "completed") {
        setAllowed(false);
        return;
      }
      if (!ready) return;
      if (!customerId) {
        setAllowed(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "requests", requestId));
        if (!snap.exists()) {
          setAllowed(false);
          return;
        }
        const data = snap.data() as { customerId?: string; selectedPartnerId?: string | null };
        const ok = data.customerId === customerId && data.selectedPartnerId === partnerId;
        if (!cancelled) setAllowed(ok);
      } catch {
        if (!cancelled) setAllowed(false);
      }
    };

    validateAccess();

    return () => {
      cancelled = true;
    };
  }, [partnerId, requestId, source, ready, customerId]);

  useEffect(() => {
    if (!reviewId) return;
    let active = true;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "reviews", reviewId));
        if (!active) return;
        setHasExistingReview(snap.exists());
        if (!snap.exists()) return;
        const data = snap.data() as { rating?: number; text?: string };
        if (typeof data.rating === "number") setRating(data.rating);
        if (typeof data.text === "string") setReviewText(data.text);
      } catch (err) {
        console.warn("[customer][reviews] load error", err);
        if (active) setHasExistingReview(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [reviewId]);

  useEffect(() => {
    if (allowed === false) {
      Alert.alert("리뷰 작성", "거래완료 후에만 리뷰를 작성할 수 있습니다.", [
        { text: "확인", onPress: () => router.back() },
      ]);
    }
  }, [allowed, router]);

  const handlePickPhotos = useCallback(async () => {
    const remaining = MAX_REVIEW_PHOTOS - draftPhotos.length;
    if (remaining <= 0) {
      Alert.alert("업로드 제한", "리뷰 사진은 최대 5장까지 업로드할 수 있습니다.");
      return;
    }

    try {
      const assets = await pickImages({ maxCount: remaining });
      if (!assets.length) return;

      if (assets.length > remaining) {
        Alert.alert("업로드 제한", "일부 사진은 5장 제한으로 제외되었습니다.");
      }

      const nextDrafts = assets.slice(0, remaining).map((asset) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uri: asset.uri,
        status: "ready" as const,
      }));
      setDraftPhotos((prev) => [...prev, ...nextDrafts]);
    } catch (err: any) {
      setError(err?.message ?? "리뷰 사진을 선택하지 못했습니다.");
    }
  }, [draftPhotos.length]);

  const handleRemovePhoto = useCallback((id: string) => {
    setDraftPhotos((prev) => prev.filter((photo) => photo.id !== id));
  }, []);

  const uploadReviewPhoto = useCallback(
    async (photo: DraftPhoto, index: number, targetReviewId: string) => {
      setDraftPhotos((prev) =>
        prev.map((item) =>
          item.id === photo.id ? { ...item, status: "uploading", errorMessage: undefined } : item
        )
      );

      try {
        const prepared = await autoRecompress(
          { uri: photo.uri, maxSize: REVIEW_MAX_SIZE, quality: REVIEW_QUALITY },
          1024 * 1024
        );
        const thumb = await createThumb(prepared.uri, THUMB_MAX_SIZE, THUMB_QUALITY);

        const storagePath = `reviews/${targetReviewId}/${index}.jpg`;
        const thumbPath = `reviews/${targetReviewId}/thumbs/${index}.jpg`;
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

        await setDoc(doc(db, "reviews", targetReviewId, "photos", String(index)), {
          url: uploaded.url,
          thumbUrl: thumbUploaded.url,
          storagePath,
          thumbPath,
          width: prepared.width,
          height: prepared.height,
          sizeBytes: prepared.sizeBytes ?? uploaded.sizeBytes,
          createdAt: serverTimestamp(),
        });

        setDraftPhotos((prev) =>
          prev.map((item) => (item.id === photo.id ? { ...item, status: "done" } : item))
        );
      } catch (err: any) {
        setDraftPhotos((prev) =>
          prev.map((item) =>
            item.id === photo.id
              ? { ...item, status: "error", errorMessage: err?.message ?? "업로드 실패" }
              : item
          )
        );
        throw err;
      }
    },
    []
  );

  const handleRetryPhoto = useCallback(
    async (photo: DraftPhoto, index: number) => {
      if (!reviewId) {
        setError("리뷰가 먼저 생성되어야 합니다.");
        return;
      }
      try {
        await uploadQueue.enqueue(() => uploadReviewPhoto(photo, index, reviewId));
      } catch (err: any) {
        setError(err?.message ?? "재시도에 실패했습니다.");
      }
    },
    [reviewId, uploadQueue, uploadReviewPhoto]
  );

  const handleSubmit = useCallback(async () => {
    if (allowed === false) {
      setError("거래완료 후에만 리뷰를 작성할 수 있습니다.");
      return;
    }
    if (!partnerId) {
      setError("업체 정보가 없습니다.");
      return;
    }
    if (!customerId) {
      setError("로그인이 필요합니다.");
      return;
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      setError("평점은 1~5 사이여야 합니다.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const targetReviewId =
        reviewId ?? computedReviewId ?? doc(collection(db, "reviews")).id;
      const reviewRef = doc(db, "reviews", targetReviewId);

      if (hasExistingReview) {
        await updateDoc(reviewRef, {
          rating,
          text: reviewText.trim(),
        });
      } else {
        await setDoc(reviewRef, {
          partnerId,
          customerId,
          requestId: requestId ?? null,
          rating,
          text: reviewText.trim(),
          photoCount: draftPhotos.length,
          createdAt: serverTimestamp(),
        });
        setReviewId(reviewRef.id);
        setHasExistingReview(true);
        try {
          await updatePartnerTrustFromReview(partnerId, rating);
        } catch (err) {
          console.warn("[customer][reviews] trust update skipped", err);
        }
        if (requestId) {
          try {
            await updateDoc(doc(db, "requests", requestId), {
              reviewedPartnerId: partnerId,
              reviewId: reviewRef.id,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.warn("[customer][reviews] request update skipped", err);
          }
        }
      }

      const uploadTargets = draftPhotos
        .map((photo, index) => ({ photo, index }))
        .filter(({ photo }) => photo.status !== "done");
      const results = await Promise.allSettled(
        uploadTargets.map(({ photo, index }) =>
          uploadQueue.enqueue(() => uploadReviewPhoto(photo, index, reviewRef.id))
        )
      );

      const failed = results.filter((result) => result.status === "rejected").length;
      const doneCount = draftPhotos.length - failed;
      try {
        await updateDoc(reviewRef, {
          photoCount: doneCount,
        });
      } catch (err) {
        console.warn("[customer][reviews] photoCount update skipped", err);
      }

      if (failed === 0) {
        router.back();
      } else {
        setError("일부 사진 업로드에 실패했습니다. 다시 시도해 주세요.");
      }
    } catch (err: any) {
      console.error("[customer][reviews] submit error", err);
      setError(err?.message ?? "리뷰를 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }, [
    allowed,
    customerId,
    draftPhotos,
    partnerId,
    rating,
    reviewId,
    reviewText,
    uploadQueue,
    uploadReviewPhoto,
    router,
  ]);

  return (
    <Screen style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.label}>평점</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((value) => {
              const filled = value <= rating;
              return (
                <TouchableOpacity
                  key={value}
                  style={styles.starBtn}
                  onPress={() => setRating(value)}
                >
                  <Text style={[styles.starText, filled && styles.starTextActive]}>
                    {filled ? "★" : "☆"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.textHeaderRow}>
            <Text style={styles.label}>리뷰 내용</Text>
            <Text style={styles.counter}>
              {reviewText.length}/{REVIEW_MAX_CHARS}
            </Text>
          </View>
          <TextInput
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="리뷰를 입력해 주세요."
            style={styles.textArea}
            multiline
            maxLength={REVIEW_MAX_CHARS}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.label}>리뷰 사진</Text>
            <Text style={styles.counter}>
              {draftPhotos.length}/{MAX_REVIEW_PHOTOS}
            </Text>
          </View>
          <View style={styles.photoRow}>
            {draftPhotos.map((photo, index) => (
              <View key={photo.id} style={styles.photoWrap}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                {photo.status === "uploading" ? (
                  <View style={styles.photoOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
                {photo.status === "error" ? (
                  <View style={styles.photoOverlay}>
                    <TouchableOpacity onPress={() => handleRetryPhoto(photo, index)}>
                      <Text style={styles.retryText}>재시도</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemovePhoto(photo.id)}>
                  <Text style={styles.removeText}>X</Text>
                </TouchableOpacity>
              </View>
            ))}
            {draftPhotos.length < MAX_REVIEW_PHOTOS ? (
              <TouchableOpacity style={styles.addPhotoBtn} onPress={handlePickPhotos}>
                <Text style={styles.addPhotoText}>+</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitText}>
              {submitting ? "저장 중..." : "리뷰 등록"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2ED" },
  scrollContent: { paddingBottom: 60 },
  error: { color: "#DC2626", margin: 16 },
  section: { paddingHorizontal: 16, paddingTop: 16 },
  label: { fontWeight: "700", color: "#111827" },
  ratingRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  starBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  starText: { fontSize: 32, color: "#D1D5DB" },
  starTextActive: { color: "#FBBF24" },
  textHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  counter: { color: "#6B7280", fontSize: 12 },
  textArea: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 120,
    textAlignVertical: "top",
  },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  photoWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  photo: { width: "100%", height: "100%" },
  photoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { color: "#FBBF24", fontWeight: "700" },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoText: { fontSize: 24, fontWeight: "700", color: "#111827" },
  submitBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: "#FFFFFF", fontWeight: "700" },
});
