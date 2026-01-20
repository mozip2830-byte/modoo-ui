import FontAwesome from "@expo/vector-icons/FontAwesome";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signOut } from "firebase/auth";

import { useColorScheme } from "@/components/useColorScheme";


import { useAuthUid } from "@/src/lib/useAuthUid";
import { auth } from "@/src/firebase";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from "expo-router";

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: "index",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const isExpoGoRuntime =
  Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient";

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <RootLayoutNav />
    </SafeAreaProvider>
  );
}

function PushRegistrar() {
  const uid = useAuthUid();

  useEffect(() => {
    let active = true;
    let registeredToken: string | null = null;

    if (!uid || Platform.OS === "web" || isExpoGoRuntime) return;

    (async () => {
      try {
        const mod = await import("@/src/actions/pushActions");
        const token = await mod.registerFcmToken({ uid, role: "customer" });
        if (active) registeredToken = token;
      } catch (err) {
        console.error("[customer][push] register error", err);
      }
    })();

    return () => {
      active = false;
      if (isExpoGoRuntime) return;
      if (uid && registeredToken) {
        (async () => {
          try {
            const mod = await import("@/src/actions/pushActions");
            await mod.unregisterFcmToken({ uid, token: registeredToken });
          } catch (err) {
            console.error("[customer][push] unregister error", err);
          }
        })();
      }
    };
  }, [uid]);

  return null;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("customer:autoLoginEnabled");
        if (!active) return;
        if (stored === "false") {
          await signOut(auth);
        }
      } catch (err) {
        console.warn("[customer][auth] auto-login init error", err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <PushRegistrar />
      <View style={styles.container}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="notifications/index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="reset" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: "modal" }} />
          <Stack.Screen name="(customer)" options={{ headerShown: false }} />

        </Stack>
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
