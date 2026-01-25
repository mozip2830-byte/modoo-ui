import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import { signInCustomer, signInCustomerWithCustomToken } from "@/src/actions/authActions";
import { Screen } from "@/src/components/Screen";
import { auth, db } from "@/src/firebase";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { Card } from "@/src/ui/components/Card";
import { colors, radius, spacing } from "@/src/ui/tokens";

WebBrowser.maybeCompleteAuthSession();
AuthSession.maybeCompleteAuthSession?.();

const AUTO_LOGIN_KEY = "customer:autoLoginEnabled";

export default function CustomerLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ force?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLoginEnabled, setAutoLoginEnabled] = useState(true);
  const proxyRedirectUri =
    process.env.EXPO_PUBLIC_KAKAO_REDIRECT_URI ?? "https://auth.expo.io/@bartdubu/modoo-customer";
  const returnUrl = AuthSession.makeRedirectUri({
    scheme: "modoo-customer",
    path: "expo-auth-session",
  });
  const kakaoKey = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY ?? "";
  const kakaoRedirectUri = proxyRedirectUri;
  const naverClientId = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? "";
  const naverRedirectUri = proxyRedirectUri;
  const authBaseUrl = process.env.EXPO_PUBLIC_AUTH_BASE_URL ?? "";

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

  useEffect(() => {
    if (params?.force === "1") return;
    router.replace("/(tabs)/home");
  }, [params, router]);

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
      const uid = auth.currentUser?.uid;
      if (uid) {
        const snap = await getDoc(doc(db, "customerUsers", uid));
        if (snap.exists()) {
          const data = snap.data() as { addressRoad?: string; addressDong?: string };
          if (!data.addressRoad || !data.addressDong) {
            router.replace("/(customer)/signup-extra");
            return;
          }
        }
      }
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

  const ensureAuthBaseUrl = () => {
    if (!authBaseUrl) {
      Alert.alert("서버 준비 중", "로그인 서버 주소가 필요합니다. 잠시 후 다시 시도해 주세요.");
      return false;
    }
    return true;
  };

  const runProxyAuth = async (
    request: AuthSession.AuthRequest,
    discovery: AuthSession.AuthDiscoveryDocument
  ) => {
    const authUrl = await request.makeAuthUrlAsync(discovery);
    const proxyBaseUrl = proxyRedirectUri;
    const startUrl = `${proxyBaseUrl}/start?authUrl=${encodeURIComponent(
      authUrl
    )}&returnUrl=${encodeURIComponent(returnUrl)}`;
    console.log("[auth][proxy] authUrl", authUrl);
    console.log("[auth][proxy] startUrl", startUrl);
    console.log("[auth][proxy] returnUrl", returnUrl);
    const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
    if (result.type !== "success") return null;
    return request.parseReturnUrl(result.url);
  };

  const handleKakao = async () => {
    if (!kakaoKey) {
      Alert.alert("설정 안내", "카카오 REST API 키가 설정되지 않았습니다.");
      return;
    }
    if (!ensureAuthBaseUrl()) return;

    setOauthLoading(true);
    setError(null);
    try {
      const request = new AuthSession.AuthRequest({
        clientId: kakaoKey,
        redirectUri: kakaoRedirectUri,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: false,
      });
      const discovery = { authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize" };
      const result = await runProxyAuth(request, discovery);
      if (!result || result.type !== "success") return;
      const code = result.params?.code;
      if (!code) {
        Alert.alert("로그인 실패", "인증 코드가 없습니다.");
        return;
      }

      const resp = await fetch(`${authBaseUrl}/authKakao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirectUri: kakaoRedirectUri }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.firebaseToken) {
        throw new Error("카카오 로그인에 실패했습니다.");
      }
      await signInCustomerWithCustomToken({ token: data.firebaseToken, profile: data.profile });
      router.replace("/(tabs)/home");
    } catch (err) {
      console.error("[customer][auth] kakao login error", err);
      Alert.alert("카카오 로그인 실패", "잠시 후 다시 시도해 주세요.");
    } finally {
      setOauthLoading(false);
    }
  };

  const handleNaver = async () => {
    if (!naverClientId) {
      Alert.alert("설정 안내", "네이버 클라이언트 ID가 설정되지 않았습니다.");
      return;
    }
    if (!ensureAuthBaseUrl()) return;

    setOauthLoading(true);
    setError(null);
    try {
      const request = new AuthSession.AuthRequest({
        clientId: naverClientId,
        redirectUri: naverRedirectUri,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: false,
      });
      const discovery = { authorizationEndpoint: "https://nid.naver.com/oauth2.0/authorize" };
      const result = await runProxyAuth(request, discovery);
      if (!result || result.type !== "success") return;
      const code = result.params?.code;
      if (!code) {
        Alert.alert("로그인 실패", "인증 코드가 없습니다.");
        return;
      }

      const resp = await fetch(`${authBaseUrl}/authNaver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state: request.state }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.firebaseToken) {
        throw new Error("네이버 로그인에 실패했습니다.");
      }
      await signInCustomerWithCustomToken({ token: data.firebaseToken, profile: data.profile });
      router.replace("/(tabs)/home");
    } catch (err) {
      console.error("[customer][auth] naver login error", err);
      Alert.alert("네이버 로그인 실패", "잠시 후 다시 시도해 주세요.");
    } finally {
      setOauthLoading(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <AppHeader title="고객 로그인" subtitle="계정 정보를 입력하고 계속 진행해 주세요." />

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
          disabled={submitting || oauthLoading}
        />

        <View style={styles.socialRow}>
          <TouchableOpacity
            style={[styles.socialBtn, styles.kakaoBtn, (submitting || oauthLoading) && styles.socialBtnDisabled]}
            onPress={handleKakao}
            disabled={submitting || oauthLoading}
          >
            <Text style={styles.kakaoText}>카카오로 로그인</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.socialBtn, styles.naverBtn, (submitting || oauthLoading) && styles.socialBtnDisabled]}
            onPress={handleNaver}
            disabled={submitting || oauthLoading}
          >
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
      <View style={styles.browseWrap}>
        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => router.replace("/(tabs)/home")}
          activeOpacity={0.85}
        >
          <Text style={styles.browseText}>둘러보기</Text>
        </TouchableOpacity>
        <Text style={styles.browseHint}>비로그인 상태에서도 서비스 둘러보기가 가능합니다.</Text>
      </View>
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
  socialBtnDisabled: { opacity: 0.6 },
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
  browseWrap: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  browseButton: {
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: "center",
    backgroundColor: "#8A7A6E",
    borderWidth: 1,
    borderColor: "#8A7A6E",
  },
  browseText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  browseHint: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12, textAlign: "center" },
});
