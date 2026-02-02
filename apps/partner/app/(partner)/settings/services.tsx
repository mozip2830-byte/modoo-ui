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
import { SERVICE_CATEGORIES } from "@/src/constants/serviceCategories";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";
import type { PartnerDoc } from "@/src/types/models";

export default function ServiceCategoriesSettingsScreen() {
  const router = useRouter();
  const { uid } = useAuthUid();
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    const loadProfile = async () => {
      try {
        const snap = await getDoc(doc(db, "partners", uid));
        if (snap.exists()) {
          const data = snap.data() as PartnerDoc;
          const categories = data.serviceCategories ?? [];
          // 배열 타입 검증
          if (Array.isArray(categories)) {
            setServiceCategories(categories);
            console.log("[partner][settings] loaded categories:", categories);
          } else {
            console.warn("[partner][settings] invalid categories format:", categories);
            setServiceCategories([]);
          }
        } else {
          // 문서가 없으면 초기화
          setServiceCategories([]);
        }
      } catch (err) {
        console.error("[partner][settings] services load error", err);
        setServiceCategories([]);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [uid]);

  const toggleItem = (value: string) => {
    if (serviceCategories.includes(value)) {
      setServiceCategories(serviceCategories.filter((item) => item !== value));
    } else {
      setServiceCategories([...serviceCategories, value]);
    }
  };

  const handleSave = async () => {
    if (!uid) {
      Alert.alert("로그인이 필요합니다");
      return;
    }
    if (serviceCategories.length === 0) {
      Alert.alert("서비스 품목을 1개 이상 선택해 주세요.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "partners", uid),
        {
          serviceCategories,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      Alert.alert("저장 완료", "서비스 품목이 저장되었습니다.");
      router.back();
    } catch (err) {
      console.error("[partner][settings] services save error", err);
      Alert.alert("저장 실패", "서비스 품목 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.container}>
        <AppHeader title={"서비스 품목 설정"} />
        <Text style={styles.loading}>{"로딩 중..."}</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <AppHeader
        title={"서비스 품목 설정"}
        subtitle={"서비스 품목을 선택하세요."}
      />
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.label}>{"서비스 품목"}</Text>
          <Text style={styles.count}>
            {"선택 "}{serviceCategories.length}{"개"}
          </Text>
        </View>
        <View style={styles.chipRow}>
          {SERVICE_CATEGORIES.map((item) => {
            const selected = serviceCategories.includes(item);
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
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => {
              setServiceCategories([]);
            }}
          >
            <Text style={styles.resetButtonText}>초기화</Text>
          </TouchableOpacity>
          <PrimaryButton
            label={saving ? "저장 중..." : "저장"}
            onPress={handleSave}
            disabled={saving || serviceCategories.length === 0}
          />
        </View>
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
  buttonRow: { flexDirection: "row", gap: spacing.md },
  resetButton: {
    flex: 0.8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  resetButtonText: { color: colors.text, fontWeight: "700", fontSize: 14 },
});
