import { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";
import { signUpPartner } from "@/src/actions/authActions";
import { Screen } from "@/src/components/Screen";

export default function PartnerSignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!verifiedPhone) return;
    if (phone !== verifiedPhone) {
      setPhoneVerified(false);
    }
  }, [phone, verifiedPhone]);

  const handleSendCode = () => {
    if (!phone.trim()) {
      setError("????? ??? ???.");
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setSentCode(code);
    setPhoneVerified(false);
    setVerifiedPhone(null);
    setCodeInput("");
    Alert.alert("???? ??", `??? ????: ${code}`);
  };

  const handleVerifyCode = () => {
    if (!sentCode) {
      setError("?? ????? ??? ???.");
      return;
    }
    if (codeInput.trim() !== sentCode) {
      setError("????? ???? ????.");
      return;
    }
    setPhoneVerified(true);
    setVerifiedPhone(phone);
    setError(null);
  };

  const handleSignup = async () => {
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 다릅니다.");
      return;
    }
    if (!agreeTerms || !agreePrivacy) {
      setError("이용약관과 개인정보 처리방침에 동의해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await signUpPartner({
        email: email.trim(),
        password,
        phone: phone.trim(),
        phoneVerified: true,
      });
      router.replace("/(partner)/auth/profile");
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
      if (code === "auth/email-already-in-use") {
        setNotice("이미 가입된 이메일입니다. 로그인해 주세요.");
        return;
      }
      console.error("[partner][auth] signup error", err);
      const message = err instanceof Error ? err.message : "회원가입에 실패했습니다.";
      setError(message);
      Alert.alert("회원가입 실패", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll style={styles.container}>
      <AppHeader
        title="파트너 회원가입"
        subtitle="고객용 계정과 파트너용 계정은 별도로 가입됩니다."
      />
      <Card style={styles.card}>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
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
        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="비밀번호"
          secureTextEntry
          style={styles.input}
        />
        <Text style={styles.label}>비밀번호 확인</Text>
        <TextInput
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          placeholder="비밀번호 확인"
          secureTextEntry
          style={styles.input}
        />

        <View style={styles.checkRow}>
          <TouchableOpacity
            style={[styles.checkbox, agreeTerms && styles.checkboxActive]}
            onPress={() => setAgreeTerms((prev) => !prev)}
          >
            {agreeTerms ? <View style={styles.checkboxDot} /> : null}
          </TouchableOpacity>
          <Text style={styles.checkText}>이용약관에 동의합니다</Text>
        </View>
        <View style={styles.checkRow}>
          <TouchableOpacity
            style={[styles.checkbox, agreePrivacy && styles.checkboxActive]}
            onPress={() => setAgreePrivacy((prev) => !prev)}
          >
            {agreePrivacy ? <View style={styles.checkboxDot} /> : null}
          </TouchableOpacity>
          <Text style={styles.checkText}>개인정보 처리방침에 동의합니다</Text>
        </View>

        <PrimaryButton
          label={submitting ? "회원가입 중..." : "회원가입"}
          onPress={handleSignup}
          disabled={submitting || !phoneVerified}
        />
        <SecondaryButton label="로그인으로" onPress={() => router.replace("/(partner)/auth/login")} />
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
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  codeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  codeBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  helper: { color: colors.subtext, fontSize: 12 },
  success: { color: colors.success, fontSize: 12 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  checkboxActive: { borderColor: colors.primary },
  checkboxDot: { width: 10, height: 10, borderRadius: 4, backgroundColor: colors.primary },
  error: { color: colors.danger, fontSize: 12 },
  notice: { color: colors.subtext, fontSize: 12 },
});
