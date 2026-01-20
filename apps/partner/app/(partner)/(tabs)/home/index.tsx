import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  where
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthedQueryGuard } from "@/src/lib/useAuthedQueryGuard";
import type { PartnerDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, radius, spacing } from "@/src/ui/tokens";

function toNumberOrNull(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTrust(data: any): PartnerDoc["trust"] | null {
  if (!data) return null;

  // 1) trust 객체가 있으면 그대로 사용
  if (data.trust && typeof data.trust === "object") {
    const score = toNumberOrNull((data.trust as any).score) ?? 0;
    const badge = String((data.trust as any).badge ?? "NEW");
    const tier = String((data.trust as any).tier ?? "C");
    return { score, badge, tier } as any;
  }

  // 2) trustScore / trustBadge / trustTier 평면 필드가 있으면 조립
  if (data.trustScore != null || data.trustBadge != null || data.trustTier != null) {
    const score = toNumberOrNull(data.trustScore) ?? 0;
    const badge = String(data.trustBadge ?? "NEW");
    const tier = String(data.trustTier ?? "C");
    return { score, badge, tier } as any;
  }

  return null;
}

export default function PartnerHomeScreen() {
  const router = useRouter();

  // ✅ AuthProvider 기반 SSOT 가드
  const { enabled, uid, status } = useAuthedQueryGuard();

  const target = uid ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  // ✅ 로딩/초기 auth 구간에서 0을 박지 않기 위해 null 허용
  const [openRequestCount, setOpenRequestCount] = useState<number | null>(null);
  const [sentQuoteCount, setSentQuoteCount] = useState<number | null>(null);
  const [trust, setTrust] = useState<PartnerDoc["trust"] | null>(null);

  // ========================================
  // Open requests count
  // ========================================
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

  // ========================================
  // Sent quotes count (발송된 견적만)
  // - 전제: 발송 시 quotes.status가 'sent' 또는 'submitted'로 저장되어 있어야 함
  // ========================================
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

  // ========================================
  // Partner trust
  // ✅ 1순위: partnerUsers/{uid} (SSOT)
  // ✅ 2순위: partners/{uid} (fallback, 문서ID가 uid인 케이스 대응)
  // ========================================
  useEffect(() => {
    if (!enabled || !uid) {
      setTrust(null);
      return;
    }

    // 1) partnerUsers SSOT
    const ref1 = doc(db, "partnerUsers", uid);
    const unsub1 = onSnapshot(
      ref1,
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : null;
        const t = normalizeTrust(data);

        // partnerUsers에 trust가 있으면 그걸로 확정
        if (t) {
          setTrust(t);
          return;
        }

        // trust가 아직 없으면 일단 null로 두고 fallback에서 채울 수 있게 둠
        setTrust(null);
      },
      (err: any) => {
        if (err?.code === "permission-denied") {
          console.log("[home] trust(partnerUsers): permission-denied (ignored)");
          setTrust(null);
          return;
        }
        console.error("[home] trust(partnerUsers) error", err);
        setTrust(null);
      }
    );

    // 2) partners/{uid} fallback (문서ID=uid 케이스)
    const ref2 = doc(db, "partners", uid);
    const unsub2 = onSnapshot(
      ref2,
      (snap) => {
        // partnerUsers에서 이미 trust가 잡혔으면 덮어쓰지 않음
        // (동시에 구독되므로 깜빡임 방지)
        setTrust((prev) => {
          if (prev) return prev;

          const data = snap.exists() ? (snap.data() as any) : null;
          const t = normalizeTrust(data);
          return t ?? null;
        });
      },
      (err: any) => {
        if (err?.code === "permission-denied") {
          console.log("[home] trust(partners): permission-denied (ignored)");
          return;
        }
        console.error("[home] trust(partners) error", err);
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [enabled, uid]);

  // 숫자/문자 혼입 방지 + 로딩(null) 처리
  const trustScoreValue = (trust as any)?.score;
  const trustScore = trustScoreValue == null ? null : Number(trustScoreValue);
  const trustBadge = String((trust as any)?.badge ?? "NEW");
  const trustTier = String((trust as any)?.tier ?? "C");

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
            <Text style={styles.statValue}>{openRequestCount ?? "—"}</Text>
            <Text style={styles.statLabel}>{LABELS.labels.newRequests}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{sentQuoteCount ?? "—"}</Text>
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
            <Text style={styles.trustScoreValue}>{trustScore ?? "—"}</Text>
            <Text style={styles.trustScoreLabel}>점</Text>
          </View>

          <View style={styles.trustMeta}>
            <Text style={styles.trustTier}>등급: {trustTier}</Text>
            <Text style={styles.trustHelper}>
              사업자 인증, 리뷰, 응답률 등으로 신뢰도가 결정됩니다.
            </Text>
            {status === "authLoading" ? (
              <Text style={styles.trustHint}>로그인 정보를 확인 중입니다…</Text>
            ) : null}
            {status === "noUid" ? (
              <Text style={styles.trustHint}>로그인이 필요합니다.</Text>
            ) : null}
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
  trustCard: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  trustHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  trustContent: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  trustScoreBox: { flexDirection: "row", alignItems: "baseline" },
  trustScoreValue: { fontSize: 36, fontWeight: "800", color: colors.text },
  trustScoreLabel: {
    fontSize: 14,
    color: colors.subtext,
    marginLeft: spacing.xs,
  },
  trustMeta: { flex: 1 },
  trustTier: { fontSize: 14, fontWeight: "600", color: colors.text },
  trustHelper: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.subtext,
    lineHeight: 18,
  },
  trustHint: { marginTop: spacing.xs, fontSize: 12, color: colors.subtext },
});
