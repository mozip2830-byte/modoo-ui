import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AuthSession from "expo-auth-session";
import { makeRedirectUri } from "expo-auth-session";
import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";
import { signInPartner, signInPartnerWithGoogle, signInPartnerWithCustomToken } from "@/src/actions/authActions";
import {
  googleAuthConfig,
  hasGoogleAndroidClientId,
  hasGoogleIosClientId,
  hasGoogleWebClientId,
} from "@/src/lib/googleAuthConfig";

WebBrowser.maybeCompleteAuthSession();
AuthSession.maybeCompleteAuthSession();

export default function PartnerLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const naverClientId = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? "";
  const naverRedirectUri =
    process.env.EXPO_PUBLIC_NAVER_REDIRECT_URI ?? AuthSession.makeRedirectUri({ useProxy: true });
  const authBaseUrl = process.env.EXPO_PUBLIC_AUTH_BASE_URL ?? "";

  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await signInPartner({ email: email.trim(), password });

      // ✅ 로그인 성공 시 이동 (프로젝트 라우팅에 맞게 한 곳만 택해서 쓰면 됨)
      // 1) 파트너 탭/홈이 따로 있으면:
      router.replace("/(partner)/(tabs)/home");
      // 2) 만약 위 경로가 없다면, 너 프로젝트의 실제 홈 경로로 바꿔줘.
      // 예: router.replace("/(partner)/home");
    } catch (err) {
      console.error("[partner][auth] login error", err);
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

  const handleNaver = async () => {
    if (!naverClientId) {
      Alert.alert("설정 누락", "네이버 클라이언트 ID가 설정되지 않았습니다.");
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

      const result = await AuthSession.startAsync({ authUrl });
      if (result.type !== "success") return;
      const code = result.params?.code;
      if (!code) {
        Alert.alert("로그인 실패", "인증 코드가 없습니다.");
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
      router.replace("/(partner)/(tabs)/home");
    } catch (err) {
      console.error("[partner][auth] naver login error", err);
      Alert.alert("네이버 로그인 실패", "잠시 후 다시 시도해 주세요.");
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
              <GoogleLoginSection />
            ) : (
              <Text style={styles.webHint}>Google 로그인 설정 필요(클라이언트 ID 미설정)</Text>
            )
          ) : Platform.OS === "ios" ? (
            hasGoogleIosClientId ? (
              <GoogleLoginSection />
            ) : (
              <Text style={styles.webHint}>Google 로그인 설정 필요(클라이언트 ID 미설정)</Text>
            )
          ) : Platform.OS === "android" ? (
            hasGoogleAndroidClientId ? (
              <GoogleLoginSection />
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

        <View style={styles.linkRow}>
          <TouchableOpacity onPress={() => router.push("/(partner)/auth/signup")}>
            <Text style={styles.linkText}>회원가입</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(partner)/auth/reset")}>
            <Text style={styles.linkText}>비밀번호 재설정</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </Screen>
  );
}

function GoogleLoginSection() {
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
        Alert.alert("구글 로그인 실패", "토큰을 가져오지 못했습니다.");
        return;
      }

      signInPartnerWithGoogle({ idToken: id_token, accessToken: access_token }).catch((err) => {
        console.error("[partner][auth] google error", err);
        Alert.alert("구글 로그인 실패", "로그인에 실패했습니다.");
      });
    }
  }, [response]);

  const handleGoogle = async () => {
    if (!request) {
      Alert.alert("구글 로그인 설정 필요", "클라이언트 ID 설정을 확인해 주세요.");
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
  linkRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
  webHint: { color: colors.subtext, fontSize: 12 },
});
