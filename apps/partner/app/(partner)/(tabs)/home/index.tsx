import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { collection, collectionGroup, doc, onSnapshot, query, where } from "firebase/firestore";

import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { Screen } from "@/src/components/Screen";
import { colors, radius, spacing } from "@/src/ui/tokens";
import type { PartnerDoc } from "@/src/types/models";

export default function PartnerHomeScreen() {
  const router = useRouter();
  const uid = useAuthUid();
  const target = uid ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  const [openRequestCount, setOpenRequestCount] = useState(0);
  const [sentQuoteCount, setSentQuoteCount] = useState(0);
  const [trust, setTrust] = useState<PartnerDoc["trust"] | null>(null);

  // Subscribe to open requests count
  useEffect(() => {
    const q = query(
      collection(db, "requests"),
      where("status", "==", "open"),
      where("isClosed", "==", false)
    );

    const unsub = onSnapshot(
      q,
      (snap) => setOpenRequestCount(snap.size),
      (err) => console.error("[home] requests count error", err)
    );

    return () => unsub();
  }, []);

  // Subscribe to partner's sent quotes count
  useEffect(() => {
    if (!uid) {
      setSentQuoteCount(0);
      return;
    }

    const q = query(
      collectionGroup(db, "quotes"),
      where("partnerId", "==", uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => setSentQuoteCount(snap.size),
      (err) => console.error("[home] quotes count error", err)
    );

    return () => unsub();
  }, [uid]);

  // Subscribe to partner's trust score
  useEffect(() => {
    if (!uid) {
      setTrust(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "partners", uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PartnerDoc;
          setTrust(data.trust ?? null);
        } else {
          setTrust(null);
        }
      },
      (err) => console.error("[home] trust error", err)
    );

    return () => unsub();
  }, [uid]);

  const trustScore = trust?.score ?? 0;
  const trustBadge = trust?.badge ?? "NEW";
  const trustTier = trust?.tier ?? "C";

  return (
    <Screen style={styles.container}>
      <AppHeader
        title={LABELS.headers.home}
        subtitle="요청과 견적을 한눈에 확인하세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/(partner)/notifications" />
            <TouchableOpacity onPress={() => router.push(target as any)} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Ad Area Placeholder */}
      <Card style={styles.adCard}>
        <View style={styles.adPlaceholder}>
          <FontAwesome name="bullhorn" size={24} color={colors.subtext} />
          <Text style={styles.adText}>광고 영역</Text>
        </View>
      </Card>

      {/* Quote Summary */}
      <Card style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>{LABELS.labels.quoteSummary}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{openRequestCount}</Text>
            <Text style={styles.statLabel}>{LABELS.labels.newRequests}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{sentQuoteCount}</Text>
            <Text style={styles.statLabel}>{LABELS.labels.sentQuotes}</Text>
          </View>
        </View>
      </Card>

      {/* Partner Trust Score */}
      <Card style={styles.trustCard}>
        <View style={styles.trustHeader}>
          <Text style={styles.sectionTitle}>{LABELS.labels.partnerTrust}</Text>
          <Chip label={trustBadge} tone="success" />
        </View>
        <View style={styles.trustContent}>
          <View style={styles.trustScoreBox}>
            <Text style={styles.trustScoreValue}>{trustScore}</Text>
            <Text style={styles.trustScoreLabel}>점</Text>
          </View>
          <View style={styles.trustMeta}>
            <Text style={styles.trustTier}>등급: {trustTier}</Text>
            <Text style={styles.trustHelper}>
              사업자 인증, 리뷰, 응답률 등으로 신뢰도가 결정됩니다.
            </Text>
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
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statItem: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 28, fontWeight: "800", color: colors.primary },
  statLabel: { marginTop: spacing.xs, fontSize: 12, color: colors.subtext },
  statDivider: { width: 1, height: 40, backgroundColor: colors.border },
  trustCard: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  trustHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  trustContent: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  trustScoreBox: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  trustScoreValue: { fontSize: 36, fontWeight: "800", color: colors.text },
  trustScoreLabel: { fontSize: 14, color: colors.subtext, marginLeft: spacing.xs },
  trustMeta: { flex: 1 },
  trustTier: { fontSize: 14, fontWeight: "600", color: colors.text },
  trustHelper: { marginTop: spacing.xs, fontSize: 12, color: colors.subtext, lineHeight: 18 },
});
