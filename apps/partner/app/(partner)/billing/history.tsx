import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

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
  const [items, setItems] = useState<PartnerPaymentDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribePaymentHistory({
      partnerId: partnerId ?? "",
      onData: (data) => {
        setItems(data);
        setError(null);
      },
      onError: (err) => {
        console.error("[partner][billing] history error", err);
        setError("결제 내역을 불러오지 못했습니다.");
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  return (
    <Screen style={styles.container} contentContainerStyle={styles.list}>
      <AppHeader title="결제 내역" subtitle="충전과 구독 내역을 확인해요." />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items.length === 0 ? (
        <EmptyState
          title="결제 내역이 없습니다."
          description="충전 또는 구독 결제를 진행해 주세요."
        />
      ) : (
        items.map((item) => (
          <Card key={item.id} style={styles.card}>
            <Text style={styles.title}>
              {item.type === "charge"
                ? "개인용 충전"
                : item.type === "subscription"
                ? "구독 결제"
                : item.type === "debit"
                ? "개인용 차감"
                : "환불"}
            </Text>
            <Text style={styles.meta}>
              결제수단: {""}
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
                적립: {item.creditedPoints.toLocaleString()}p (보너스 {item.bonusPoints ?? 0}p)
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
