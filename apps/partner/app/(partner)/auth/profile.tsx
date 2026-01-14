import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View } from "react-native";
import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { updatePartnerProfileCompletion } from "@/src/actions/authActions";
import { db } from "@/src/firebase";
import { SERVICE_CATEGORIES } from "@/src/constants/serviceCategories";
import { SERVICE_REGIONS } from "@/src/constants/serviceRegions";
import type { PartnerDoc } from "@/src/types/models";
import { Screen } from "@/src/components/Screen";

export default function PartnerProfileSetupScreen() {
  const router = useRouter();
  const uid = useAuthUid();
  const [companyName, setCompanyName] = useState("");
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);
  const [serviceRegions, setServiceRegions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({
    companyName: "",
    categories: "",
    regions: "" });

  useEffect(() => {
    if (!uid) return;
    const loadProfile = async () => {
      try {
        const snap = await getDoc(doc(db, "partners", uid));
        if (!snap.exists()) return;
        const data = snap.data() as PartnerDoc;
        const name = data.companyName ?? data.name ?? "";
        setCompanyName(name);
        setServiceCategories(data.serviceCategories ?? []);
        setServiceRegions(data.serviceRegions ?? []);
      } catch (err) {
        console.error("[partner][auth] profile load error", err);
      }
    };
    loadProfile();
  }, [uid]);

  const canSubmit = useMemo(() => {
    return (
      companyName.trim().length > 0 &&
      serviceCategories.length > 0 &&
      serviceRegions.length > 0
    );
  }, [companyName, serviceCategories.length, serviceRegions.length]);

  const toggleItem = (
    list: string[],
    value: string,
    setter: (next: string[]) => void
  ) => {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value));
    } else {
      setter([...list, value]);
    }
  };

  const handleSave = async () => {
    if (!uid) {
      Alert.alert("로그인이 필요합니다");
      return;
    }

    const nextErrors = {
      companyName: companyName.trim() ? "" : "업체명을 입력해 주세요.",
      categories:
        serviceCategories.length > 0 ? "" : "서비스 품목을 1개 이상 선택해 주세요.",
      regions:
        serviceRegions.length > 0 ? "" : "서비스 지역을 1개 이상 선택해 주세요." };
    setErrors(nextErrors);

    if (nextErrors.companyName || nextErrors.categories || nextErrors.regions) {
      return;
    }

    setSubmitting(true);
    try {
      const nameTrimmed = companyName.trim();
      await setDoc(
        doc(db, "partners", uid),
        {
          name: nameTrimmed,
          nameLower: nameTrimmed.toLowerCase(),
          companyName: nameTrimmed,
          serviceCategories,
          serviceRegions,
          approvedStatus: "준회원",
          updatedAt: serverTimestamp() },
        { merge: true }
      );
      await updatePartnerProfileCompletion(uid, { profileCompleted: true });
      Alert.alert("프로필 작성 완료", "프로필이 저장되었습니다.");
      router.replace("/(partner)/(tabs)/requests");
    } catch (err) {
      console.error("[partner][auth] profile error", err);
      Alert.alert("저장 실패", "프로필 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll style={styles.container}>
      <AppHeader title="프로필 작성" subtitle="업체 정보를 입력해 주세요." />
      <Card style={styles.card}>
        <View style={styles.section}>
          <Text style={styles.label}>업체명</Text>
          <TextInput
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="업체명을 입력해 주세요"
            style={styles.input}
          />
          {errors.companyName ? (
            <Text style={styles.error}>{errors.companyName}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>서비스 품목</Text>
            <Text style={styles.count}>선택 {serviceCategories.length}개</Text>
          </View>
          <View style={styles.chipRow}>
            {SERVICE_CATEGORIES.map((item) => {
              const selected = serviceCategories.includes(item);
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleItem(serviceCategories, item, setServiceCategories)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {errors.categories ? <Text style={styles.error}>{errors.categories}</Text> : null}
        </View>

        <View style={styles.section}>
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
                  onPress={() => toggleItem(serviceRegions, item, setServiceRegions)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {errors.regions ? <Text style={styles.error}>{errors.regions}</Text> : null}
        </View>

        <PrimaryButton
          label={submitting ? "저장 중..." : "프로필 저장하기"}
          onPress={handleSave}
          disabled={submitting || !canSubmit}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: { marginHorizontal: spacing.lg, gap: spacing.md },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontWeight: "700", color: colors.text },
  count: { color: colors.subtext, fontSize: 12, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.card },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  chipTextSelected: { color: "#FFFFFF" },
  error: { color: colors.danger, fontSize: 12 } });

