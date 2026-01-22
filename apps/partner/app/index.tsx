import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

const FALLBACK_DELAY_MS = 2000;

export default function Index() {
  const router = useRouter();
  const [statusText, setStatusText] = useState("업데이트 확인 중...");

  useEffect(() => {
    let active = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const goHome = () => {
      timeoutId = setTimeout(() => {
        if (active) {
          router.replace("/(partner)/(tabs)/home");
        }
      }, FALLBACK_DELAY_MS);
    };

    const checkUpdate = async () => {
      try {
        const Updates = await import("expo-updates");
        const result = await Updates.checkForUpdateAsync();

        if (result.isAvailable) {
          if (active) setStatusText("업데이트 설치 중...");
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return;
        }
      } catch (err) {
        console.warn("[partner][landing] update check failed:", err);
      }

      if (active) setStatusText("로딩 중...");
      goHome();
    };

    checkUpdate();

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [router]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "space-between",
        backgroundColor: "#F9FAFB",
        gap: 12,
        paddingHorizontal: 24,
        paddingBottom: 28,
      }}
    >
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: "#111827" }}>
          모두의집
        </Text>
      </View>
      <View style={{ width: "100%", gap: 8 }}>
        <View
          style={{
            height: 6,
            borderRadius: 999,
            backgroundColor: "#E5E7EB",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: "100%",
              width: "45%",
              borderRadius: 999,
              backgroundColor: "#111827",
            }}
          />
        </View>
        <Text style={{ fontSize: 12, color: "#6B7280", textAlign: "center" }}>
          {statusText}
        </Text>
      </View>
    </View>
  );
}
