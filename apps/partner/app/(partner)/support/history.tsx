import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, spacing } from "@/src/ui/tokens";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { formatTimestamp } from "@/src/utils/time";
import { getSupportTicketsByUser, SupportTicket } from "@/src/actions/supportActions";

const STATUS_LABELS: Record<SupportTicket["status"], string> = {
  open: "접수",
  inProgress: "처리 중",
  resolved: "답변 완료",
  closed: "종료",
};

export default function PartnerSupportHistoryScreen() {
  const router = useRouter();
  const { uid, ready } = useAuthUid();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadTickets = async (isRefresh = false) => {
    if (!uid) {
      setTickets([]);
      setError("로그인이 필요합니다.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const data = await getSupportTicketsByUser(uid);
      setTickets(data);
    } catch (err) {
      console.error("[partner][support] load tickets error", err);
      setError("문의 내역을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    loadTickets();
  }, [ready, uid]);

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.headerWrap}>
        <AppHeader title="문의 내역" subtitle="접수한 문의와 답변을 확인하세요." />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => loadTickets(true)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cardWrap}
            onPress={() => router.push(`/(partner)/support/${item.id}`)}
          >
            <Card style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.subject || "문의"}
                </Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{STATUS_LABELS[item.status]}</Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>
                접수 {item.createdAt ? formatTimestamp(item.createdAt as never) : "-"}
              </Text>
              <Text style={styles.cardMeta}>
                업데이트 {item.updatedAt ? formatTimestamp(item.updatedAt as never) : "-"}
              </Text>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <Text style={styles.loadingText}>불러오는 중...</Text>
          ) : (
            <EmptyState title="문의 내역이 없습니다." description="문의하기에서 새로운 문의를 남겨주세요." />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  cardWrap: { marginBottom: spacing.md },
  card: { gap: spacing.xs },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text, flex: 1 },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: { fontSize: 12, fontWeight: "700", color: colors.text },
  cardMeta: { fontSize: 12, color: colors.subtext },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  loadingText: { color: colors.subtext, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
