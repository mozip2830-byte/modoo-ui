import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput } from "react-native";
import { useRouter } from "expo-router";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";
import { resetCustomerPassword } from "@/src/actions/authActions";
import { Screen } from "@/src/components/Screen";

export default function CustomerResetScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    if (!email.trim()) {
      setError("이메일을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await resetCustomerPassword({ email: email.trim() });
      Alert.alert("메일 전송 완료", "비밀번호 재설정 메일을 확인해 주세요.");
      router.replace("/login");
    } catch (err) {
      console.error("[customer][auth] reset error", err);
      const message = err instanceof Error ? err.message : "메일 전송에 실패했습니다.";
      setError(message);
      Alert.alert("재설정 실패", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <AppHeader
        title="비밀번호 재설정"
        subtitle="가입한 이메일로 재설정 메일을 보내드립니다."
      />

      <Card style={styles.card}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>이메일</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="example@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        <PrimaryButton
          label={submitting ? "전송 중..." : "재설정 메일 보내기"}
          onPress={handleReset}
          disabled={submitting}
        />

        <SecondaryButton label="로그인으로" onPress={() => router.replace("/login")} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: { marginHorizontal: spacing.lg, gap: spacing.sm },
  label: { fontWeight: "700", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  error: { color: colors.danger, fontSize: 12 },
});
