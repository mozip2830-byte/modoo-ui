import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { useEffect, useState } from "react";
import { Alert, Modal, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { colors, radius, spacing } from "@/src/ui/tokens";
import { signInPartner, signInPartnerWithGoogle, signInPartnerWithCustomToken } from "@/src/actions/authActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import {
  googleAuthConfig,
  hasGoogleAndroidClientId,
  hasGoogleIosClientId,
  hasGoogleWebClientId,
} from "@/src/lib/googleAuthConfig";

WebBrowser.maybeCompleteAuthSession();

const AUTO_LOGIN_KEY = "partner:autoLoginEnabled";

export default function PartnerLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ force?: string }>();
  const { uid, status } = useAuthUid();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLoginEnabled, setAutoLoginEnabled] = useState(true);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState<"error" | "warning" | "info">("info");
  const naverClientId = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? "";
  const naverRedirectUri =
    process.env.EXPO_PUBLIC_NAVER_REDIRECT_URI ?? makeRedirectUri();
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
        console.warn("[partner][auth] auto-login read error", err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ✅ 처음 진입할 때 이미 로그인한 사용자는 홈 화면으로 리다이렉트
  useEffect(() => {
    if (status === "authLoading") return; // 인증 상태 확인 대기

    // force=1 파라미터가 없으면, 이미 로그인된 상태면 강제로 로그인 화면 열지 않기
    if (params?.force !== "1" && uid && status === "ready") {
      router.replace("/(partner)/(tabs)/home");
    }
  }, []);

  const showAlert = (title: string, message: string, type: "error" | "warning" | "info" = "info") => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setAlertVisible(true);
  };

  const handleAutoLoginToggle = async (value: boolean) => {
    setAutoLoginEnabled(value);
    try {
      await AsyncStorage.setItem(AUTO_LOGIN_KEY, value ? "true" : "false");
    } catch (err) {
      console.warn("[partner][auth] auto-login save error", err);
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
      await signInPartner({ email: email.trim(), password });
      // ✅ 로그인 성공 후 상태 업데이트 대기
      await new Promise(resolve => setTimeout(resolve, 500));

      await new Promise(resolve => setTimeout(resolve, 300));
      router.replace("/(partner)/(tabs)/home");
    } catch (err) {
      console.error("[partner][auth] login error", err);
      const message = err instanceof Error ? err.message : "로그인에 실패했습니다.";
      setError(message);
      showAlert("로그인 실패", message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const ensureAuthBaseUrl = () => {
    if (!authBaseUrl) {
      showAlert("서버 준비 중", "로그인 서버 주소가 필요합니다. 잠시 후 다시 시도해 주세요.", "warning");
      return false;
    }
    return true;
  };

  const handleNaver = async () => {
    if (!naverClientId) {
      showAlert("설정 안내", "네이버 클라이언트 ID가 설정되지 않았습니다.", "warning");
      return;
    }
    if (!ensureAuthBaseUrl()) return;

    setOauthLoading(true);
    setError(null);
    try {
      const state = Math.random().toString(36).slice(2);
      const authUrl =
        "https://nid.naver.com/oauth2.0/authorize" +
        `?client_id=${encodeURIComponent(naverClientId)}` +
        "&response_type=code" +
        `&redirect_uri=${encodeURIComponent(naverRedirectUri)}` +
        `&state=${encodeURIComponent(state)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, naverRedirectUri);
      if (result.type !== "success") return;
      const url = new URL((result as WebBrowser.WebBrowserAuthSessionResult & { url: string }).url);
      const code = url.searchParams.get("code");
      if (!code) {
        showAlert("로그인 실패", "인증 코드가 없습니다.", "error");
        return;
      }

      const resp = await fetch(`${authBaseUrl}/authNaver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.firebaseToken) {
        throw new Error("네이버 로그인에 실패했습니다.");
      }
      await signInPartnerWithCustomToken({ token: data.firebaseToken, profile: data.profile });

      // ✅ 로그인 성공 후 상태 업데이트 대기
      await new Promise(resolve => setTimeout(resolve, 500));

      await new Promise(resolve => setTimeout(resolve, 300));
      router.replace("/(partner)/(tabs)/home");
    } catch (err) {
      console.error("[partner][auth] naver login error", err);
      showAlert("네이버 로그인", "로그인에 실패했습니다.\n잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setOauthLoading(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <AppHeader
        title="파트너 로그인"
        subtitle="고객용 계정과 파트너용 계정은 별도로 가입합니다."
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

        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="비밀번호"
          secureTextEntry
          style={styles.input}
        />

        <PrimaryButton
          label={submitting ? "로그인 중..." : "이메일로 계속하기"}
          onPress={handleEmailLogin}
          disabled={submitting || oauthLoading}
        />

        <View style={styles.socialRow}>
          {Platform.OS === "web" ? (
            hasGoogleWebClientId ? (
              <GoogleLoginSection showAlert={showAlert} />
            ) : (
              <Text style={styles.webHint}>Google 로그인 설정 필요(클라이언트 ID 미설정)</Text>
            )
          ) : Platform.OS === "ios" ? (
            hasGoogleIosClientId ? (
              <GoogleLoginSection showAlert={showAlert} />
            ) : (
              <Text style={styles.webHint}>Google 로그인 설정 필요(클라이언트 ID 미설정)</Text>
            )
          ) : Platform.OS === "android" ? (
            hasGoogleAndroidClientId ? (
              <GoogleLoginSection showAlert={showAlert} />
            ) : (
              <Text style={styles.webHint}>Google 로그인 설정 필요(클라이언트 ID 미설정)</Text>
            )
          ) : null}

          <SecondaryButton
            label={oauthLoading ? "네이버 로그인 중..." : "네이버로 계속하기"}
            onPress={handleNaver}
            disabled={submitting || oauthLoading}
          />
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
          <TouchableOpacity onPress={() => router.push("/(partner)/auth/signup")}>
            <Text style={styles.linkText}>회원가입</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(partner)/auth/reset")}>
            <Text style={styles.linkText}>비밀번호 재설정</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Modal visible={alertVisible} transparent animationType="fade" onRequestClose={() => setAlertVisible(false)}>
        <View style={styles.alertBackdrop}>
          <View style={[styles.alertBox, styles[`alertBox_${alertType}`]]}>
            <Text style={[styles.alertTitle, styles[`alertTitle_${alertType}`]]}>{alertTitle}</Text>
            <Text style={styles.alertMessage}>{alertMessage}</Text>

            <TouchableOpacity
              style={[styles.alertButton, styles[`alertButton_${alertType}`]]}
              onPress={() => setAlertVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.alertButtonText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function GoogleLoginSection({ showAlert }: { showAlert: (title: string, message: string, type: "error" | "warning" | "info") => void }) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: googleAuthConfig.iosClientId || undefined,
    androidClientId: googleAuthConfig.androidClientId || undefined,
    webClientId: googleAuthConfig.webClientId || undefined,
    redirectUri: makeRedirectUri(),
  });

  useEffect(() => {
    if (response?.type === "success") {
      const { id_token, access_token } = response.params as {
        id_token?: string;
        access_token?: string;
      };

      if (!id_token) {
        showAlert("구글 로그인 실패", "토큰을 가져오지 못했습니다.", "error");
        return;
      }

      signInPartnerWithGoogle({ idToken: id_token, accessToken: access_token }).catch((err) => {
        console.error("[partner][auth] google error", err);
        showAlert("구글 로그인", "로그인에 실패했습니다.\n잠시 후 다시 시도해 주세요.", "error");
      });
    }
  }, [response]);

  const handleGoogle = async () => {
    if (!request) {
      showAlert("구글 로그인 설정 필요", "클라이언트 ID 설정을 확인해 주세요.", "warning");
      return;
    }
    await promptAsync();
  };

  return <SecondaryButton label="구글로 계속하기" onPress={handleGoogle} />;
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
  webHint: { color: colors.subtext, fontSize: 12 },
  alertBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  alertBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  alertBox_error: {},
  alertBox_warning: {},
  alertBox_info: {},
  alertTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  alertTitle_error: {},
  alertTitle_warning: {},
  alertTitle_info: {},
  alertMessage: {
    fontSize: 13,
    color: colors.subtext,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  alertButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  alertButton_error: {},
  alertButton_warning: {},
  alertButton_info: {},
  alertButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
