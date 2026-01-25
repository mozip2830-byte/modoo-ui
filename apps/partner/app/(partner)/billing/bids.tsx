import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { subscribeAdBidHistory } from "@/src/actions/partnerActions";
import type { PartnerAdBidDoc } from "@/src/types/models";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

function formatStatus(item: PartnerAdBidDoc) {
  switch (item.status) {
    case "won":
      return "낙찰";
    case "lost":
      return "탈락";
    case "late":
      return "마감 후 접수";
    default:
      return "대기";
  }
}

export default function PartnerAdBidHistoryScreen() {
  const { uid: partnerId } = useAuthUid();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PartnerAdBidDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeAdBidHistory({
      partnerId: partnerId ?? "",
      onData: (data) => {
        setItems(data);
        setError(null);
      },
      onError: (err) => {
        console.error("[partner][billing] ad bids error", err);
        setError("광고 입찰 내역을 불러오지 못했습니다.");
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  const empty = useMemo(() => items.length === 0, [items.length]);

  return (
    <Screen
      style={styles.container}
      contentContainerStyle={[styles.list, { paddingBottom: spacing.xxl + insets.bottom }]}
    >
      <AppHeader title="광고 입찰 내역" subtitle="지역별 입찰 결과를 확인하세요." />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {empty ? (
        <EmptyState title="입찰 내역이 없습니다." description="광고 입찰을 진행해 주세요." />
      ) : (
        items.map((item) => {
          const regionLabel = item.regionKey ?? item.region ?? "-";
          const refundLabel =
            item.status === "lost" && (item.refundAmount ?? 0) > 0
              ? `환불 포인트: ${Number(item.refundAmount ?? 0).toLocaleString()}P`
              : item.status === "lost"
              ? "환불 대기"
              : item.status === "won"
              ? "낙찰 확정"
              : "-";

          return (
            <Card key={item.id} style={styles.card}>
              <Text style={styles.title}>
                {item.category ?? "카테고리"} · {regionLabel}
              </Text>
              <Text style={styles.meta}>
                입찰 금액: {Number(item.amount ?? 0).toLocaleString()}P
              </Text>
              <Text style={styles.meta}>주차: {item.weekKey ?? "-"}</Text>
              <Text style={styles.meta}>결과: {formatStatus(item)}</Text>
              {item.resultRank ? <Text style={styles.meta}>순위: {item.resultRank}등</Text> : null}
              <Text style={styles.meta}>{refundLabel}</Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { gap: spacing.xs },
  title: { fontWeight: "700", color: colors.text },
  meta: { color: colors.subtext, fontSize: 12 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
});
