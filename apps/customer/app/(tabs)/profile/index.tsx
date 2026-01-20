import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { signOutCustomer } from "@/src/actions/authActions";
import { LABELS } from "@/src/constants/labels";
import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { SecondaryButton } from "@/src/ui/components/Buttons";
import { Card } from "@/src/ui/components/Card";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";

export default function ProfileScreen() {
  const router = useRouter();

  const handleLogout = useCallback(() => {
    Alert.alert("로그아웃", "정말 로그아웃할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          try {
            await signOutCustomer();
            router.replace("/login");
          } catch (err) {
            const message = err instanceof Error ? err.message : "로그아웃에 실패했습니다.";
            Alert.alert("로그아웃 실패", message);
          }
        },
      },
    ]);
  }, [router]);

  return (
    <Screen scroll={false} style={styles.container}>
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
          <Text style={styles.name}>고객</Text>
          <Text style={styles.desc}>요청과 채팅을 한곳에서 관리하세요.</Text>
        </View>
      </Card>
      <Card style={styles.menuCard}>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/(customer)/request-management")}
        >
          <Text style={styles.menuItem}>요청 관리</Text>
          <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/(customer)/notification-settings")}
        >
          <Text style={styles.menuItem}>알림 설정</Text>
          <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/(customer)/support")}
        >
          <Text style={styles.menuItem}>고객지원</Text>
          <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
        </TouchableOpacity>
      </Card>
      <Card style={styles.logoutCard}>
        <SecondaryButton label="로그아웃" onPress={handleLogout} />
      </Card>
    </Screen>
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
  menuCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  menuRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  menuItem: { fontSize: 14, color: colors.text, fontWeight: "600" },
  logoutCard: { marginHorizontal: spacing.lg, marginTop: spacing.md },
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
