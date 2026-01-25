import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput } from "react-native";
import { getAuth } from "firebase/auth";
import { useRouter } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";
import { createSupportTicket } from "@/src/actions/supportActions";
import { useAuthUid } from "@/src/lib/useAuthUid";

export default function PartnerInquiryScreen() {
  const router = useRouter();
  const { uid, ready } = useAuthUid();
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    if (!ready) {
      setError("로그인 상태를 확인 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!uid) {
      setError("로그인이 필요합니다.");
      return;
    }
    if (!subject.trim() || !content.trim()) {
      setError("제목과 내용을 모두 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const auth = getAuth();
      const email = auth.currentUser?.email || "unknown@modoo.local";

      await createSupportTicket({
        userId: uid,
        userEmail: email,
        subject: subject.trim(),
        content: content.trim(),
      });

      setSubject("");
      setContent("");
      setSuccess("문의가 정상적으로 접수되었습니다.");
      Alert.alert("문의 접수 완료", "빠르게 확인 후 답변드리겠습니다.");
    } catch (err) {
      console.error("[partner][support] create error", err);
      setError("문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="문의하기" subtitle="궁금한 내용을 남겨주시면 빠르게 도와드릴게요." />
      <Card style={styles.card}>
        <Text style={styles.title}>1:1 문의 등록</Text>
        <Text style={styles.desc}>운영시간: 평일 10:00 ~ 18:00 (점심 12:00 ~ 13:00)</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <Text style={styles.label}>제목</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="문의 제목을 입력해 주세요."
          style={styles.input}
        />

        <Text style={styles.label}>내용</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="문의 내용을 입력해 주세요."
          style={[styles.input, styles.textArea]}
          multiline
        />

        <PrimaryButton
          label={saving ? "접수 중..." : "문의 접수"}
          onPress={handleSubmit}
          disabled={saving || !ready}
        />
        <SecondaryButton label="문의 내역 보기" onPress={() => router.push("/(partner)/support/history")} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { gap: spacing.md },
  title: { fontWeight: "700", color: colors.text, fontSize: 15 },
  desc: { color: colors.subtext, fontSize: 12, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "700", color: colors.text },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.text,
  },
  textArea: { minHeight: 120, textAlignVertical: "top" },
  error: { color: colors.danger, fontSize: 12 },
  success: { color: colors.primary, fontSize: 12 },
});
