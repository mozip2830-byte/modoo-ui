import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";
import { signUpCustomer } from "@/src/actions/authActions";
import { Screen } from "@/src/components/Screen";

export default function CustomerSignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!verifiedPhone) return;
    if (phone !== verifiedPhone) {
      setPhoneVerified(false);
    }
  }, [phone, verifiedPhone]);

  const handleSendCode = () => {
    if (!phone.trim()) {
      setError("전화번호를 입력해 주세요.");
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setSentCode(code);
    setPhoneVerified(false);
    setVerifiedPhone(null);
    setCodeInput("");
    Alert.alert("인증번호 발송", `테스트 인증번호: ${code}`);
  };

  const handleVerifyCode = () => {
    if (!sentCode) {
      setError("먼저 인증번호를 발송해 주세요.");
      return;
    }
    if (codeInput.trim() !== sentCode) {
      setError("인증번호가 올바르지 않습니다.");
      return;
    }
    setPhoneVerified(true);
    setVerifiedPhone(phone);
    setError(null);
  };

  const handleSignup = async () => {
    if (!email.trim() || !password.trim() || !name.trim() || !phone.trim()) {
      setError("필수 정보를 모두 입력해 주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (!phoneVerified) {
      setError("전화번호 인증이 필요합니다.");
      return;
    }
    if (!agreeTerms || !agreePrivacy) {
      setError("약관에 동의해 주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await signUpCustomer({
        email: email.trim(),
        password,
        name: name.trim(),
        phone: phone.trim(),
        phoneVerified: true,
      });
      router.replace("/(tabs)/home");
    } catch (err) {
      console.error("[customer][auth] signup error", err);
      const message = err instanceof Error ? err.message : "회원가입에 실패했습니다.";
      setError(message);
      Alert.alert("회원가입 실패", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <AppHeader
        title="고객 회원가입"
        subtitle="고객용 계정과 파트너용 계정은 별도로 가입합니다."
      />

      <Card style={styles.card}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>이름</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="이름"
          style={styles.input}
        />

        <Text style={styles.label}>이메일</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="example@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        <Text style={styles.label}>전화번호</Text>
        <View style={styles.row}>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
            style={[styles.input, styles.flex]}
          />
          <TouchableOpacity style={styles.codeBtn} onPress={handleSendCode}>
            <Text style={styles.codeBtnText}>인증번호 발송</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <TextInput
            value={codeInput}
            onChangeText={setCodeInput}
            placeholder="인증번호 입력"
            keyboardType="number-pad"
            style={[styles.input, styles.flex]}
          />
          <TouchableOpacity style={styles.codeBtn} onPress={handleVerifyCode}>
            <Text style={styles.codeBtnText}>
              {phoneVerified ? "인증완료" : "인증 확인"}
            </Text>
          </TouchableOpacity>
        </View>

        {phoneVerified ? (
          <Text style={styles.success}>전화번호 인증 완료</Text>
        ) : (
          <Text style={styles.helper}>전화번호 인증이 필요합니다.</Text>
        )}

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
          label={submitting ? "가입 중..." : "가입하기"}
          onPress={handleSignup}
          disabled={submitting || !phoneVerified}
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
});
