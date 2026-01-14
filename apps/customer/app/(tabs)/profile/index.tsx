import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";

import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";

export default function ProfileScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <AppHeader
        title={LABELS.headers.profile}
        subtitle="계정 정보를 관리하세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/notifications" />
            <TouchableOpacity onPress={() => router.push("/login")} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />
      <Card style={styles.profileCard}>
        <View style={styles.avatar} />
        <View style={styles.profileInfo}>
          <Text style={styles.name}>홍길동</Text>
          <Text style={styles.desc}>요청과 채팅을 간편하게 관리하세요.</Text>
        </View>
      </Card>
      <Card style={styles.menuCard}>
        <Text style={styles.menuItem}>요청 관리</Text>
        <Text style={styles.menuItem}>알림 설정</Text>
        <Text style={styles.menuItem}>고객지원</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  profileCard: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#D9F5F0",
  },
  profileInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: "700", color: colors.text },
  desc: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  menuCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.md },
  menuItem: { fontSize: 14, color: colors.text, fontWeight: "600" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
});
