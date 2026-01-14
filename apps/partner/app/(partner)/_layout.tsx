import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { useAuthUid } from "@/src/lib/useAuthUid";
import { usePartnerUser } from "@/src/lib/usePartnerUser";
import { useVerificationSync } from "@/src/lib/useVerificationSync";

export default function PartnerLayout() {
  const router = useRouter();
  const segments = useSegments();
  const uid = useAuthUid();
  const { user, loading } = usePartnerUser(uid);
  const isAuthRoute = segments.includes("auth");
  const isProfileSetup = segments.includes("auth") && segments.includes("profile");

  useVerificationSync(uid, user);

  useEffect(() => {
    const blurActiveElement = () => {
      if (typeof document === "undefined") return;
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function") {
        active.blur();
      }
    };

    if (loading) return;
    if (!uid) {
      if (!isAuthRoute) {
        blurActiveElement();
        router.replace("/(partner)/auth/login");
      }
      return;
    }

    if (user && user.profileCompleted === false && !isProfileSetup) {
      blurActiveElement();
      router.replace("/(partner)/auth/profile");
      return;
    }

    if (uid && isAuthRoute && !isProfileSetup) {
      blurActiveElement();
      router.replace("/(partner)/(tabs)/requests");
    }
  }, [uid, user, loading, isAuthRoute, isProfileSetup, router]);

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
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});


