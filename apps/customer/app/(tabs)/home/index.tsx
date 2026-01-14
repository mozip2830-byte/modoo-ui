import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, radius, spacing } from "@/src/ui/tokens";

const CATEGORIES = [
  "인테리어",
  "청소",
  "리모델링",
  "이사",
  "전기/설비",
  "조명",
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <AppHeader
        title={LABELS.headers.home}
        subtitle="필요한 서비스를 빠르게 찾아보세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/notifications" />
            <TouchableOpacity onPress={() => router.push("/login")} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      <Card style={styles.heroCard}>
        <Text style={styles.heroTitle}>맞춤 견적을 바로 받아보세요</Text>
        <Text style={styles.heroDesc}>
          상세 요청을 남기면 업체가 견적을 보내드립니다.
        </Text>
        <PrimaryButton label={LABELS.actions.newRequest} onPress={() => router.push("/requests/new")} />
      </Card>

      <Card style={styles.categoryCard}>
        <Text style={styles.sectionTitle}>인기 서비스</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((item) => (
            <View key={item} style={styles.categoryChip}>
              <Text style={styles.categoryText}>{item}</Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  heroCard: { marginHorizontal: spacing.lg, gap: spacing.sm },
  heroTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  heroDesc: { color: colors.subtext, fontSize: 13 },
  categoryCard: { marginHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  categoryChip: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  categoryText: { color: colors.text, fontWeight: "600", fontSize: 12 },
});
