import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { subscribePaymentHistory } from "@/src/actions/partnerActions";
import type { PartnerPaymentDoc } from "@/src/types/models";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

export default function PartnerPaymentHistoryScreen() {
  const { uid: partnerId } = useAuthUid();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PartnerPaymentDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const chargeItems = items.filter((item) => item.type === "charge");

  useEffect(() => {
    const unsub = subscribePaymentHistory({
      partnerId: partnerId ?? "",
      onData: (data) => {
        setItems(data);
        setError(null);
      },
      onError: (err) => {
        console.error("[partner][billing] history error", err);
        setError("충전 내역을 불러오지 못했습니다.");
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  return (
    <Screen
      style={styles.container}
      contentContainerStyle={[styles.list, { paddingBottom: spacing.xxl + insets.bottom }]}
    >
      <AppHeader title="충전 내역" subtitle="입찰권 충전 내역을 확인하세요." />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {chargeItems.length === 0 ? (
        <EmptyState
          title="충전 내역이 없습니다."
          description="입찰권 충전을 진행해 주세요."
        />
      ) : (
        chargeItems.map((item) => (
          <Card key={item.id} style={styles.card}>
            <Text style={styles.title}>
              {item.type === "charge"
                ? "일반 충전"
                : item.type === "subscription"
                ? "구독 결제"
                : item.type === "debit"
                ? "일반 차감"
                : "기타"}
            </Text>
            <Text style={styles.meta}>
              결제수단:{" "}
              {item.provider === "kakaopay"
                ? "카카오페이"
                : item.provider === "card"
                ? "신용카드"
                : item.provider === "bank"
                ? "계좌이체"
                : item.provider === "toss"
                ? "토스"
                : "기타"}
            </Text>
            <Text style={styles.meta}>
              결제금액(부가세 포함): {item.amountPayKRW.toLocaleString()}원
            </Text>
            {item.creditedPoints ? (
              <Text style={styles.meta}>
                입찰권 적립: {item.creditedPoints.toLocaleString()}장 (보너스{" "}
                {item.bonusPoints ?? 0}장)
              </Text>
            ) : null}
            <Text style={styles.meta}>상태: {item.status}</Text>
          </Card>
        ))
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
