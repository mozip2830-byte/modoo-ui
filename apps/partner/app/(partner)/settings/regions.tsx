import { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { SERVICE_REGIONS } from "@/src/constants/serviceRegions";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";
import type { PartnerDoc } from "@/src/types/models";

export default function ServiceRegionsSettingsScreen() {
  const router = useRouter();
  const { uid } = useAuthUid();
  const [serviceRegions, setServiceRegions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const loadProfile = async () => {
      try {
        const snap = await getDoc(doc(db, "partners", uid));
        if (snap.exists()) {
          const data = snap.data() as PartnerDoc;
          setServiceRegions(data.serviceRegions ?? []);
        }
      } catch (err) {
        console.error("[partner][settings] regions load error", err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [uid]);

  const toggleItem = (value: string) => {
    if (serviceRegions.includes(value)) {
      setServiceRegions(serviceRegions.filter((item) => item !== value));
    } else {
      setServiceRegions([...serviceRegions, value]);
    }
  };

  const handleSave = async () => {
    if (!uid) {
      Alert.alert("로그인이 필요합니다");
      return;
    }
    if (serviceRegions.length === 0) {
      Alert.alert("서비스 지역을 1개 이상 선택해 주세요.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "partners", uid),
        {
          serviceRegions,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      Alert.alert("저장 완료", "서비스 지역이 저장되었습니다.");
      router.back();
    } catch (err) {
      console.error("[partner][settings] regions save error", err);
      Alert.alert("저장 실패", "서비스 지역 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="서비스 지역 설정" />
        <Text style={styles.loading}>불러오는 중...</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <AppHeader
        title="서비스 지역 설정"
        subtitle="서비스 가능한 지역을 선택해 주세요."
      />
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.label}>서비스 지역</Text>
          <Text style={styles.count}>선택 {serviceRegions.length}개</Text>
        </View>
        <View style={styles.chipRow}>
          {SERVICE_REGIONS.map((item) => {
            const selected = serviceRegions.includes(item);
            return (
              <TouchableOpacity
                key={item}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => toggleItem(item)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <PrimaryButton
          label={saving ? "저장 중..." : "저장하기"}
          onPress={handleSave}
          disabled={saving || serviceRegions.length === 0}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: { marginHorizontal: spacing.lg, gap: spacing.md },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontWeight: "700", color: colors.text },
  count: { color: colors.subtext, fontSize: 12, fontWeight: "600" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  chipTextSelected: { color: "#FFFFFF" },
  loading: { color: colors.subtext, padding: spacing.lg },
});
