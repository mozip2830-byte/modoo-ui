import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      router.replace("/(partner)/(tabs)/requests");
    });
    return () => cancelAnimationFrame(id);
  }, [router]);

  return <View style={{ flex: 1, backgroundColor: "#F9FAFB" }} />;
}
