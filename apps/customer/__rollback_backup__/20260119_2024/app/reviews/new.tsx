import { useCallback, useMemo, useState } from "react";

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

import { collection, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";



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

  const { partnerId } = useLocalSearchParams<{ partnerId?: string }>();

  const customerId = useAuthUid();

  const uploadQueue = useMemo(() => createUploadQueue(2), []);



  const [rating, setRating] = useState(5);

  const [reviewText, setReviewText] = useState("");

  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([]);

  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const [reviewId, setReviewId] = useState<string | null>(null);



  const handlePickPhotos = useCallback(async () => {

    const remaining = MAX_REVIEW_PHOTOS - draftPhotos.length;

    if (remaining <= 0) {

      Alert.alert("�뾽濡쒕뱶 �젣�븳", "由щ럭 �궗吏꾩�� 理쒕�� 5�옣源뚯�� �뾽濡쒕뱶�븷 �닔 �엳�뒿�땲�떎.");

      return;

    }



    try {

      const assets = await pickImages({ maxCount: remaining });

      if (!assets.length) return;



      if (assets.length > remaining) {

        Alert.alert("�뾽濡쒕뱶 �젣�븳", "5�옣 �젣�븳�쑝濡� �씪遺� �궗吏꾩씠 �젣�쇅�릺�뿀�뒿�땲�떎.");

      }



      const nextDrafts = assets.slice(0, remaining).map((asset) => ({

        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

        uri: asset.uri,

        status: "ready" as const,

      }));

      setDraftPhotos((prev) => [...prev, ...nextDrafts]);

    } catch (err: any) {

      setError(err?.message ?? "由щ럭 �궗吏꾩쓣 �꽑�깮�븯吏� 紐삵뻽�뒿�땲�떎.");

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

              ? { ...item, status: "error", errorMessage: err?.message ?? "�뾽濡쒕뱶�뿉 �떎�뙣�뻽�뒿�땲�떎." }

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

        setError("由щ럭瑜� 癒쇱�� �벑濡앺빐二쇱꽭�슂.");

        return;

      }

      try {

        await uploadQueue.enqueue(() => uploadReviewPhoto(photo, index, reviewId));

      } catch (err: any) {

        setError(err?.message ?? "�옱�떆�룄�뿉 �떎�뙣�뻽�뒿�땲�떎.");

      }

    },

    [reviewId, uploadQueue, uploadReviewPhoto]

  );



  const handleSubmit = useCallback(async () => {

    if (!partnerId) {

      setError("�뾽泥� �젙蹂닿�� �뾾�뒿�땲�떎.");

      return;

    }

    if (!customerId) {

      setError("濡쒓렇�씤�씠 �븘�슂�빀�땲�떎.");

      return;

    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {

      setError("�룊�젏��� 1~5 �궗�씠�뿬�빞 �빀�땲�떎.");

      return;

    }



    setSubmitting(true);

    setError(null);



    try {

      const reviewRef = reviewId ? doc(db, "reviews", reviewId) : doc(collection(db, "reviews"));

      if (!reviewId) {

        setReviewId(reviewRef.id);

        await setDoc(reviewRef, {

          partnerId,

          customerId,

          rating,

          text: reviewText.trim(),

          photoCount: draftPhotos.length,

          createdAt: serverTimestamp(),

        });

        await updatePartnerTrustFromReview(partnerId, rating);

      } else {

        await updateDoc(reviewRef, {

          rating,

          text: reviewText.trim(),

        });

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

      await updateDoc(reviewRef, {

        photoCount: doneCount,

      });



      if (failed === 0) {

        router.back();

      } else {

        setError("�씪遺� �궗吏� �뾽濡쒕뱶�뿉 �떎�뙣�뻽�뒿�땲�떎. �옱�떆�룄�빐二쇱꽭�슂.");

      }

    } catch (err: any) {

      console.error("[customer][reviews] submit error", err);

      setError(err?.message ?? "由щ럭瑜� �벑濡앺븯吏� 紐삵뻽�뒿�땲�떎.");

    } finally {

      setSubmitting(false);

    }

  }, [customerId, draftPhotos, partnerId, rating, reviewId, reviewText, uploadQueue, uploadReviewPhoto, router]);



  return (

    <Screen style={styles.container}>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.header}>

          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>

            <Text style={styles.backText}>�뮘濡�</Text>

          </TouchableOpacity>

          <Text style={styles.headerTitle}>由щ럭 �옉�꽦</Text>

          <View style={{ width: 52 }} />

        </View>



        {error ? <Text style={styles.error}>{error}</Text> : null}



        <View style={styles.section}>

          <Text style={styles.label}>�룊�젏</Text>

          <View style={styles.ratingRow}>

            {[1, 2, 3, 4, 5].map((value) => (

              <TouchableOpacity

                key={value}

                style={[styles.ratingBtn, rating === value && styles.ratingBtnActive]}

                onPress={() => setRating(value)}

              >

                <Text style={[styles.ratingText, rating === value && styles.ratingTextActive]}>

                  {value}

                </Text>

              </TouchableOpacity>

            ))}

          </View>

        </View>



        <View style={styles.section}>

          <View style={styles.textHeaderRow}>

            <Text style={styles.label}>由щ럭</Text>

            <Text style={styles.counter}>{reviewText.length}/{REVIEW_MAX_CHARS}</Text>

          </View>

          <TextInput

            value={reviewText}

            onChangeText={setReviewText}

            placeholder="由щ럭 �궡�슜�쓣 �엯�젰�빐二쇱꽭�슂"

            style={styles.textArea}

            multiline

            maxLength={REVIEW_MAX_CHARS}

          />

        </View>



        <View style={styles.section}>

          <View style={styles.sectionRow}>

            <Text style={styles.label}>�궗吏�</Text>

            <Text style={styles.counter}>{draftPhotos.length}/{MAX_REVIEW_PHOTOS}</Text>

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

                      <Text style={styles.retryText}>�옱�떆�룄</Text>

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

              {submitting ? "�벑濡� 以�..." : "由щ럭 �벑濡�"}

            </Text>

          </TouchableOpacity>

        </View>

      </ScrollView>

    </Screen>

  );

}



const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: "#F9FAFB" },

  scrollContent: { paddingBottom: 60 },

  header: {

    height: 56,

    paddingHorizontal: 12,

    flexDirection: "row",

    alignItems: "center",

    borderBottomWidth: 1,

    borderBottomColor: "#E5E7EB",

    backgroundColor: "#FFFFFF",

  },

  backBtn: {

    width: 52,

    height: 36,

    alignItems: "flex-start",

    justifyContent: "center",

  },

  backText: { color: "#111827", fontWeight: "700" },

  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: "#111827" },

  error: { color: "#DC2626", margin: 16 },

  section: { paddingHorizontal: 16, paddingTop: 16 },

  label: { fontWeight: "700", color: "#111827" },

  ratingRow: { flexDirection: "row", gap: 8, marginTop: 8 },

  ratingBtn: {

    width: 44,

    height: 44,

    borderRadius: 10,

    borderWidth: 1,

    borderColor: "#D1D5DB",

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#FFFFFF",

  },

  ratingBtnActive: { backgroundColor: "#111827", borderColor: "#111827" },

  ratingText: { color: "#111827", fontWeight: "700" },

  ratingTextActive: { color: "#FFFFFF" },

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

