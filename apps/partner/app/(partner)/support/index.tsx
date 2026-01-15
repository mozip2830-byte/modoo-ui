import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { pickImages, uploadImage } from "@/src/actions/storageActions";
import { autoRecompress } from "@/src/lib/imageCompress";
import { increaseReportCount } from "@/src/actions/trustActions";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

type ReportDoc = {
  id: string;
  reviewId: string;
  reason: string;
  status: "접수" | "처리중" | "완료" | "기각";
  evidenceUrl?: string | null;
  createdAt?: unknown;
};

export default function PartnerSupportScreen() {
  const partnerId = useAuthUid();
  const [reviewId, setReviewId] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceUri, setEvidenceUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState<ReportDoc[]>([]);

  useEffect(() => {
    if (!partnerId) return;
    const ref = collection(db, "reviewReports", partnerId, "items");
    const unsub = onSnapshot(ref, (snap) => {
      setReports(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ReportDoc, "id">),
        }))
      );
    });
    return () => unsub();
  }, [partnerId]);

  const handlePickEvidence = useCallback(async () => {
    const assets = await pickImages({ maxCount: 1 });
    if (assets.length) {
      setEvidenceUri(assets[0].uri);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!partnerId) {
      Alert.alert("로그인이 필요합니다");
      return;
    }
    if (!reviewId.trim()) {
      Alert.alert("리뷰 ID를 입력해 주세요.");
      return;
    }
    if (!reason.trim()) {
      Alert.alert("신고 사유를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const reportRef = doc(collection(db, "reviewReports", partnerId, "items"));
      let evidenceUrl: string | null = null;
      let evidencePath: string | null = null;
      if (evidenceUri) {
        const prepared = await autoRecompress({ uri: evidenceUri, maxSize: 1080, quality: 0.7 }, 1024 * 1024);
        evidencePath = `reviewReports/${partnerId}/${reportRef.id}.jpg`;
        const uploaded = await uploadImage({
          uri: prepared.uri,
          storagePath: evidencePath,
          contentType: "image/jpeg",
        });
        evidenceUrl = uploaded.url;
      }

      await setDoc(reportRef, {
        reviewId: reviewId.trim(),
        reason: reason.trim(),
        status: "접수",
        evidenceUrl,
        evidencePath,
        createdAt: serverTimestamp(),
      });

      await increaseReportCount(partnerId);

      setReviewId("");
      setReason("");
      setEvidenceUri(null);
      Alert.alert("신고 접수 완료", "접수된 신고가 처리될 예정입니다.");
    } catch (error) {
      console.error("[partner][support] submit error", error);
      Alert.alert("신고 실패", "신고 접수에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }, [partnerId, reviewId, reason, evidenceUri]);

  const evidenceLabel = useMemo(
    () => (evidenceUri ? "증빙 첨부" : "증빙 선택(선택)"),
    [evidenceUri]
  );

  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="고객지원" subtitle="리뷰 신고를 접수합니다." />
        <Card style={styles.formCard}>
          <Text style={styles.label}>리뷰 ID</Text>
          <TextInput value={reviewId} onChangeText={setReviewId} style={styles.input} />
          <Text style={styles.label}>신고 사유</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            style={[styles.input, styles.textArea]}
            multiline
          />
          <SecondaryButton label={evidenceLabel} onPress={handlePickEvidence} />
          {evidenceUri ? <Image source={{ uri: evidenceUri }} style={styles.preview} /> : null}
          <PrimaryButton
            label={submitting ? "접수 중..." : "신고 접수"}
            onPress={handleSubmit}
            disabled={submitting}
          />
        </Card>

        <Card style={styles.listCard}>
          <Text style={styles.label}>접수 내역</Text>
          {reports.length === 0 ? (
            <EmptyState title="접수된 신고가 없습니다." />
          ) : (
            reports.map((report) => (
              <View key={report.id} style={styles.reportRow}>
                <Text style={styles.reportText}>리뷰 ID: {report.reviewId}</Text>
                <Text style={styles.reportText}>상태: {report.status}</Text>
                <Text style={styles.reportSub}>{report.reason}</Text>
              </View>
            ))
          )}
        </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  formCard: { gap: spacing.sm },
  label: { fontWeight: "700", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  textArea: { height: 100, textAlignVertical: "top" },
  preview: { width: "100%", height: 160, borderRadius: 12 },
  listCard: { gap: spacing.sm },
  reportRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  reportText: { color: colors.text, fontWeight: "600" },
  reportSub: { color: colors.subtext, fontSize: 12, marginTop: spacing.xs },
});
