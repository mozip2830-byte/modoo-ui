import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { subscribePaymentHistory, subscribePointLedger } from "@/src/actions/partnerActions";
import type { PartnerPaymentDoc, PartnerPointLedgerDoc } from "@/src/types/models";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

export default function PartnerPointLedgerScreen() {
  const { uid: partnerId } = useAuthUid();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<PartnerPaymentDoc[]>([]);
  const [refunds, setRefunds] = useState<PartnerPointLedgerDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refundItems = refunds.filter((item) => item.type === "refund");

  const rows = useMemo(() => {
    const normalized = [
      ...orders.map((order) => ({
        id: `order-${order.id}`,
        createdAt: order.createdAt,
        type: "order" as const,
        order,
      })),
      ...refundItems.map((refund) => ({
        id: `refund-${refund.id}`,
        createdAt: refund.createdAt,
        type: "refund" as const,
        refund,
      })),
    ];

    const toMillis = (value?: unknown | null) =>
      typeof (value as any)?.toMillis === "function" ? (value as any).toMillis() : 0;

    return normalized.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [orders, refundItems]);

  useEffect(() => {
    const unsubOrders = subscribePaymentHistory({
      partnerId: partnerId ?? "",
      onData: (data) => {
        setOrders(data);
        setError(null);
      },
      onError: (err) => {
        console.error("[partner][billing] orders error", err);
        setError("충전 내역을 불러오지 못했습니다.");
      },
    });

    const unsubRefunds = subscribePointLedger({
      partnerId: partnerId ?? "",
      onData: (data) => {
        setRefunds(data);
        setError(null);
      },
      onError: (err) => {
        console.error("[partner][billing] ledger error", err);
        setError("환불 내역을 불러오지 못했습니다.");
      },
    });

    return () => {
      if (unsubOrders) unsubOrders();
      if (unsubRefunds) unsubRefunds();
    };
  }, [partnerId]);

  return (
    <Screen
      style={styles.container}
      contentContainerStyle={[styles.list, { paddingBottom: spacing.xxl + insets.bottom }]}
    >
      <AppHeader title="충전/환불 내역" subtitle="충전 및 환불 내역을 확인하세요." />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows.length === 0 ? (
        <EmptyState title="충전/환불 내역이 없습니다." description="충전을 진행해 주세요." />
      ) : (
        rows.map((row) => {
          if (row.type === "refund") {
            const item = row.refund;
            return (
              <Card key={row.id} style={styles.card}>
                <Text style={styles.title}>포인트 환불</Text>
                <Text style={styles.meta}>
                  환불 포인트: {item.deltaPoints.toLocaleString()}P
                </Text>
                {item.amountPayKRW ? (
                  <Text style={styles.meta}>
                    환불 금액: {item.amountPayKRW.toLocaleString()}원
                  </Text>
                ) : null}
              </Card>
            );
          }

          const order = row.order;
          const orderLabel =
            order.type === "cashPoints"
              ? "포인트 충전"
              : order.type === "cashPointsService"
              ? "서비스 포인트 충전"
              : order.type === "bidTickets_points"
              ? "포인트로 입찰권 충전"
              : order.type === "bidTickets"
              ? "입찰권 충전"
              : "결제 내역";

          return (
            <Card key={row.id} style={styles.card}>
              <Text style={styles.title}>{orderLabel}</Text>
              <Text style={styles.meta}>
                결제 금액: {order.amountPayKRW.toLocaleString()}원
              </Text>
              {order.creditedPoints ? (
                <Text style={styles.meta}>
                  충전 수량: {order.creditedPoints.toLocaleString()}
                  {order.type === "cashPoints" || order.type === "cashPointsService" ? "P" : "장"}
                </Text>
              ) : null}
              <Text style={styles.meta}>상태: {order.status}</Text>
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
