import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { subscribePointLedger } from "@/src/actions/partnerActions";
import type { PartnerPointLedgerDoc } from "@/src/types/models";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

export default function PartnerPointLedgerScreen() {
  const { uid: partnerId } = useAuthUid();
  const [items, setItems] = useState<PartnerPointLedgerDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribePointLedger({
      partnerId: partnerId ?? "",
      onData: (data) => {
        setItems(data);
        setError(null);
      },
      onError: (err) => {
        console.error("[partner][billing] ledger error", err);
        setError("입찰권 내역을 불러오지 못했습니다.");
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  return (
    <Screen style={styles.container} contentContainerStyle={styles.list}>
      <AppHeader title="입찰권 내역" subtitle="적립과 차감 내역을 확인해요." />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items.length === 0 ? (
        <EmptyState title="입찰권 내역이 없습니다." description="견적 제안을 진행해 보세요." />
      ) : (
        items.map((item) => (
          <Card key={item.id} style={styles.card}>
            <Text style={styles.title}>
              {item.type === "credit_charge"
                ? "충전 적립"
                : item.type === "debit_quote"
                ? "견적 차감"
                : item.type === "credit_bonus"
                ? "보너스 적립"
                : "환불"}
            </Text>
            <Text style={styles.meta}>변동 입찰권: {item.deltaPoints}장</Text>
            <Text style={styles.meta}>잔액: {item.balanceAfter}장</Text>
            {item.amountPayKRW ? (
              <Text style={styles.meta}>
                결제금액(부가세 포함): {item.amountPayKRW.toLocaleString()}원
              </Text>
            ) : null}
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
