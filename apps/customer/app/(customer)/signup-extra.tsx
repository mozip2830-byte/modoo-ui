import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";
import { subscribeAddressDraft, type AddressDraft } from "@/src/lib/addressDraftStore";
import { SERVICE_REGIONS } from "@/src/constants/serviceRegions";
import { SERVICE_REGION_CITIES } from "@/src/constants/serviceRegionCities";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { db } from "@/src/firebase";

function deriveRegionKeyFromAddress(addressRoad: string) {
  const normalized = addressRoad.replace(/[()]/g, " ").trim();
  if (!normalized) return "";
  const province = SERVICE_REGIONS.find((item) => normalized.includes(item)) ?? null;
  if (province && SERVICE_REGION_CITIES[province]) {
    const city = SERVICE_REGION_CITIES[province].find((item) => normalized.includes(item)) ?? null;
    return city ? `${province} ${city}` : "";
  }
  for (const [key, cities] of Object.entries(SERVICE_REGION_CITIES)) {
    const city = cities.find((item) => normalized.includes(item));
    if (city) return `${key} ${city}`;
  }
  return "";
}

export default function CustomerSignupExtraScreen() {
  const router = useRouter();
  const { uid } = useAuthUid();
  const [addressRoad, setAddressRoad] = useState("");
  const [addressDong, setAddressDong] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      router.replace({ pathname: "/login", params: { force: "1" } });
    }
  }, [uid, router]);

  useEffect(() => {
    const unsub = subscribeAddressDraft((draft: AddressDraft | null) => {
      if (!draft?.roadAddress) return;
      const road = draft.roadAddress.trim();
      const dong = deriveRegionKeyFromAddress(road);
      setAddressRoad(road);
      setAddressDong(dong);
    });
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!uid) return;
    if (!addressRoad.trim() || !addressDong.trim()) {
      setError("주소를 시/군 단위까지 선택해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setDoc(
        doc(db, "customerUsers", uid),
        {
          addressRoad: addressRoad.trim(),
          addressDong: addressDong.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      router.replace("/(tabs)/profile");
    } catch (err) {
      console.error("[customer][signup-extra] save error", err);
      const message = err instanceof Error ? err.message : "추가 정보 저장에 실패했습니다.";
      setError(message);
      Alert.alert("저장 실패", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <AppHeader title="추가 정보 입력" subtitle="주소 정보를 입력해 주세요." />

      <Card style={styles.card}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>주소 (필수)</Text>
        <TouchableOpacity
          style={styles.addressInput}
          onPress={() => router.push("/(customer)/requests/address-search")}
        >
          <Text style={addressRoad ? styles.addressText : styles.addressPlaceholder}>
            {addressRoad || "주소를 검색해 주세요 (시/군까지)"}
          </Text>
        </TouchableOpacity>
        {addressDong ? <Text style={styles.helper}>선택 지역: {addressDong}</Text> : null}

        <PrimaryButton
          label={submitting ? "저장 중..." : "저장하고 계속"}
          onPress={handleSave}
          disabled={submitting}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: { marginHorizontal: spacing.lg, gap: spacing.sm },
  label: { fontWeight: "700", color: colors.text },
  addressInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
  },
  addressText: { color: colors.text, fontWeight: "600" },
  addressPlaceholder: { color: colors.subtext },
  helper: { color: colors.subtext, fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
});
