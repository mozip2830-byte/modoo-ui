import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { colors, radius, spacing } from "@/src/ui/tokens";
import { signInCustomer } from "@/src/actions/authActions";

WebBrowser.maybeCompleteAuthSession();

const AUTO_LOGIN_KEY = "customer:autoLoginEnabled";

export default function CustomerLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLoginEnabled, setAutoLoginEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTO_LOGIN_KEY);
        if (!active) return;
        if (stored === "false") setAutoLoginEnabled(false);
        if (stored === "true") setAutoLoginEnabled(true);
      } catch (err) {
        console.warn("[customer][auth] auto-login read error", err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleAutoLoginToggle = async (value: boolean) => {
    setAutoLoginEnabled(value);
    try {
      await AsyncStorage.setItem(AUTO_LOGIN_KEY, value ? "true" : "false");
    } catch (err) {
      console.warn("[customer][auth] auto-login save error", err);
    }
  };

  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      await signInCustomer({ email: email.trim(), password });
      router.replace("/(tabs)/home");
    } catch (err) {
      console.error("[customer][auth] login error", err);
      const message = err instanceof Error ? err.message : "로그인에 실패했습니다.";
      setError(message);
      Alert.alert("로그인 실패", message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKakao = () => {
    Alert.alert(
      "카카오 로그인 준비 중",
      "카카오 로그인은 준비 중입니다. 곧 제공될 예정입니다."
    );
  };

  const handleNaver = () => {
    Alert.alert(
      "네이버 로그인 준비 중",
      "네이버 로그인은 준비 중입니다. 클라이언트 ID: uqBuJWFeTm_fk2LGax_j"
    );
  };

  return (
    <Screen style={styles.container}>
      <AppHeader title="고객 로그인" subtitle="계정을 입력하고 계속 진행해 주세요." />

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

        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="비밀번호"
          secureTextEntry
          style={styles.input}
        />

        <PrimaryButton
          label={submitting ? "로그인 중..." : "이메일로 로그인"}
          onPress={handleEmailLogin}
          disabled={submitting}
        />

        <View style={styles.socialRow}>
          <TouchableOpacity style={[styles.socialBtn, styles.kakaoBtn]} onPress={handleKakao}>
            <Text style={styles.kakaoText}>카카오로 로그인</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.socialBtn, styles.naverBtn]} onPress={handleNaver}>
            <Text style={styles.naverText}>네이버로 로그인</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.autoLoginRow}>
          <Text style={styles.autoLoginLabel}>자동로그인</Text>
          <Switch
            value={autoLoginEnabled}
            onValueChange={handleAutoLoginToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.linkRow}>
          <TouchableOpacity onPress={() => router.push("/signup")}>
            <Text style={styles.linkText}>회원가입</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/reset")}>
            <Text style={styles.linkText}>비밀번호 찾기</Text>
          </TouchableOpacity>
        </View>
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
  socialRow: { gap: spacing.sm },
  socialBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    alignItems: "center",
    width: "100%",
  },
  kakaoBtn: {
    backgroundColor: "#FEE500",
  },
  kakaoText: {
    color: "#3C1E1E",
    fontWeight: "800",
    fontSize: 14,
  },
  naverBtn: {
    backgroundColor: "#03C75A",
  },
  naverText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  autoLoginRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  autoLoginLabel: { color: colors.text, fontWeight: "700", fontSize: 12 },
  linkRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
});
