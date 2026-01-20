import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthedQueryGuard } from "@/src/lib/useAuthedQueryGuard";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, radius, spacing } from "@/src/ui/tokens";

export default function PartnerHomeScreen() {
  const router = useRouter();
  const { enabled, uid } = useAuthedQueryGuard();
  const target = uid ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  const [openRequestCount, setOpenRequestCount] = useState<number | null>(null);
  const [sentQuoteCount, setSentQuoteCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !uid) {
      setOpenRequestCount(null);
      return;
    }

    const rq = query(
      collection(db, "requests"),
      where("status", "==", "open"),
      where("isClosed", "==", false)
    );

    const unsub = onSnapshot(
      rq,
      (snap) => setOpenRequestCount(snap.size),
      (err: any) => {
        if (err?.code === "permission-denied") return;
        console.error("[home] open requests count error", err);
        setOpenRequestCount(null);
      }
    );

    return () => unsub();
  }, [enabled, uid]);

  useEffect(() => {
    if (!enabled || !uid) {
      setSentQuoteCount(null);
      return;
    }

    const q = query(
      collectionGroup(db, "quotes"),
      where("partnerId", "==", uid),
      where("status", "in", ["sent", "submitted"])
    );

    const unsub = onSnapshot(
      q,
      (snap) => setSentQuoteCount(snap.size),
      (err: any) => {
        if (err?.code === "permission-denied") {
          console.log("[home] sent quotes: permission-denied (ignored)");
          setSentQuoteCount(null);
          return;
        }
        console.error("[home] sent quotes count error", err);
        setSentQuoteCount(null);
      }
    );

    return () => unsub();
  }, [enabled, uid]);

  return (
    <Screen style={styles.container}>
      <AppHeader
        title={LABELS.headers.home}
        subtitle="요청과 견적을 한눈에 확인하세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/(partner)/notifications" />
            <TouchableOpacity
              onPress={() => router.push(target as any)}
              style={styles.iconBtn}
            >
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      <Card style={styles.adCard}>
        <View style={styles.adPlaceholder}>
          <FontAwesome name="bullhorn" size={24} color={colors.subtext} />
          <Text style={styles.adText}>광고 영역</Text>
        </View>
      </Card>

      <Card style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>{LABELS.labels.quoteSummary}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{openRequestCount ?? "-"}</Text>
            <Text style={styles.statLabel}>{LABELS.labels.newRequests}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{sentQuoteCount ?? "-"}</Text>
            <Text style={styles.statLabel}>{LABELS.labels.sentQuotes}</Text>
          </View>
        </View>
      </Card>
    </Screen>
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
  adCard: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  adPlaceholder: {
    height: 120,
    backgroundColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  adText: { color: colors.subtext, fontSize: 14 },
  summaryCard: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statItem: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 28, fontWeight: "800", color: colors.primary },
  statLabel: { marginTop: spacing.xs, fontSize: 12, color: colors.subtext },
  statDivider: { width: 1, height: 40, backgroundColor: colors.border },
});
