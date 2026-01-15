import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuthState } from "@/src/lib/useAuthUid";
import { usePartnerUser } from "@/src/lib/usePartnerUser";
import { useVerificationSync } from "@/src/lib/useVerificationSync";
import { colors } from "@/src/ui/tokens";

export default function PartnerLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { uid, loading: authLoading } = useAuthState();
  const { user, loading: userLoading } = usePartnerUser(uid);
  const isAuthRoute = segments.some((s) => s === "auth");

  useVerificationSync(uid, user);

  // Show loading while auth state is being determined
  const isLoading = authLoading || (uid && userLoading);

  useEffect(() => {
    const blurActiveElement = () => {
      if (typeof document === "undefined") return;
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function") {
        active.blur();
      }
    };

    if (isLoading) return;

    if (!uid) {
      if (!isAuthRoute) {
        blurActiveElement();
        router.replace("/(partner)/auth/login");
      }
      return;
    }

    // Auto-login: authenticated user on auth route -> redirect to main app
    if (uid && isAuthRoute) {
      blurActiveElement();
      router.replace("/(partner)/(tabs)/requests");
    }
  }, [uid, isLoading, isAuthRoute, router]);

  // Show loading indicator while checking auth state
  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
        <Stack.Screen name="auth/reset" />
        <Stack.Screen name="auth/profile" />
        <Stack.Screen name="requests/[id]" />
        <Stack.Screen name="chats/[id]" />
        <Stack.Screen name="notifications/index" />
        <Stack.Screen name="billing/index" />
        <Stack.Screen name="billing/history" />
        <Stack.Screen name="billing/points" />
        <Stack.Screen name="subscription/index" />
        <Stack.Screen name="support/index" />
        <Stack.Screen name="verification/index" />
        <Stack.Screen name="settings/regions" />
        <Stack.Screen name="settings/services" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
});


