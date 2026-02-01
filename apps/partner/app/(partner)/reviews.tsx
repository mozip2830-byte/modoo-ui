import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { ReviewDoc } from "@/src/types/models";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { Card } from "@/src/ui/components/Card";
import { colors, spacing } from "@/src/ui/tokens";

export default function PartnerReviewsScreen() {
  const router = useRouter();
  const { uid: partnerId } = useAuthUid();

  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedReview, setSelectedReview] = useState<ReviewDoc | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);

  useEffect(() => {
    if (!partnerId) {
      setError("파트너 정보를 불러올 수 없습니다.");
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        setLoading(true);
        const snap = await getDocs(
          query(collection(db, "reviews"), where("partnerId", "==", partnerId))
        );

        if (active) {
          const items = snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<ReviewDoc, "id">),
          }));
          setReviews(items);
          setError(null);
        }
      } catch (err) {
        console.error("[partner][reviews] load error", err);
        if (active) setError("리뷰를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [partnerId]);

  const handleOpenReply = (review: ReviewDoc) => {
    setSelectedReview(review);
    setReplyText(review.partnerReply || "");
    setModalVisible(true);
  };

  const handleSaveReply = async () => {
    if (!selectedReview || !partnerId) return;

    if (!replyText.trim()) {
      Alert.alert("알림", "답글을 입력해 주세요.");
      return;
    }

    setReplySaving(true);
    try {
      await updateDoc(doc(db, "reviews", selectedReview.id), {
        partnerReply: replyText.trim(),
        partnerReplyAt: new Date(),
      });

      setReviews((prev) =>
        prev.map((review) =>
          review.id === selectedReview.id
            ? { ...review, partnerReply: replyText.trim(), partnerReplyAt: new Date() }
            : review
        )
      );

      Alert.alert("완료", "답글이 저장되었습니다.");
      setModalVisible(false);
      setSelectedReview(null);
      setReplyText("");
    } catch (err) {
      console.error("[partner][reviews] reply save error", err);
      Alert.alert("오류", "답글 저장에 실패했습니다.");
    } finally {
      setReplySaving(false);
    }
  };

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{LABELS.actions.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>리뷰 관리</Text>
        <View style={{ width: 52 }} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.muted}>{LABELS.messages.loading}</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : reviews.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>받은 리뷰가 없습니다.</Text>
          <Text style={styles.emptyDesc}>좋은 서비스로 리뷰를 받아보세요!</Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const rating = Number(item.rating ?? 0);
            const hasReply = Boolean(item.partnerReply?.trim());

            return (
              <Card style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.ratingBox}>
                    <Text style={styles.rating}>
                      {Array.from({ length: 5 })
                        .map((_, i) => (i < rating ? "★" : "☆"))
                        .join("")}
                    </Text>
                  </View>
                  <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
                </View>

                <Text style={styles.reviewText}>{item.text}</Text>

                {hasReply ? (
                  <View style={styles.replyBox}>
                    <View style={styles.replyHeader}>
                      <FontAwesome name="reply" size={12} color={colors.primary} />
                      <Text style={styles.replyLabel}>파트너 답글</Text>
                    </View>
                    <Text style={styles.replyText}>{item.partnerReply}</Text>
                  </View>
                ) : (
                  <Text style={styles.noReplyText}>답글이 없습니다.</Text>
                )}

                <SecondaryButton
                  label={hasReply ? "답글 수정" : "답글 작성"}
                  onPress={() => handleOpenReply(item)}
                  style={styles.replyBtn}
                />
              </Card>
            );
          }}
        />
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>답글 작성</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                disabled={replySaving}
              >
                <FontAwesome name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {selectedReview && (
              <View style={styles.modalBody}>
                <View style={styles.originReviewBox}>
                  <Text style={styles.originReviewLabel}>원본 리뷰</Text>
                  <Text style={styles.originReviewText}>{selectedReview.text}</Text>
                  <Text style={styles.originReviewRating}>
                    평점: {Number(selectedReview.rating ?? 0).toFixed(1)}
                  </Text>
                </View>

                <Text style={styles.inputLabel}>답글</Text>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="리뷰에 대한 답글을 작성해 주세요."
                  multiline
                  maxLength={500}
                  style={styles.replyInput}
                  editable={!replySaving}
                />

                <Text style={styles.charCount}>
                  {replyText.length}/500
                </Text>

                <View style={styles.modalFooter}>
                  <SecondaryButton
                    label="취소"
                    onPress={() => setModalVisible(false)}
                    disabled={replySaving}
                  />
                  <PrimaryButton
                    label={replySaving ? "저장 중..." : "저장"}
                    onPress={handleSaveReply}
                    disabled={replySaving}
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    height: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
  },
  backBtn: {
    width: 52,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backText: { color: colors.text, fontWeight: "700" },
  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: colors.text },

  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  errorBox: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.lg },
  error: { color: colors.danger, textAlign: "center" },
  muted: { color: colors.subtext, fontSize: 12 },

  emptyBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptyDesc: { fontSize: 13, color: colors.subtext },

  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.md },

  reviewCard: { padding: spacing.lg, gap: spacing.md },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ratingBox: { flex: 1 },
  rating: { fontSize: 14, color: colors.primary, letterSpacing: 2 },
  ratingText: { fontSize: 14, fontWeight: "700", color: colors.text },
  reviewText: { color: colors.text, fontSize: 13, lineHeight: 18 },

  noReplyText: { color: colors.subtext, fontSize: 12, fontStyle: "italic" },
  replyBox: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.bg, borderRadius: 8, gap: spacing.xs },
  replyHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  replyLabel: { fontSize: 12, fontWeight: "700", color: colors.primary },
  replyText: { color: colors.text, fontSize: 12 },
  replyBtn: { marginTop: spacing.sm },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: spacing.lg },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalBody: { paddingHorizontal: spacing.lg, gap: spacing.md },

  originReviewBox: { backgroundColor: colors.bg, padding: spacing.md, borderRadius: 8, gap: spacing.xs },
  originReviewLabel: { fontSize: 12, fontWeight: "700", color: colors.subtext },
  originReviewText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  originReviewRating: { fontSize: 12, color: colors.subtext },

  inputLabel: { fontSize: 12, fontWeight: "700", color: colors.text },
  replyInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.text, minHeight: 100, textAlignVertical: "top" },
  charCount: { fontSize: 11, color: colors.subtext, textAlign: "right" },

  modalFooter: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
