import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";
import {
  getSupportMessages,
  getSupportTicketById,
  SupportMessage,
  SupportTicket,
} from "@/src/actions/supportActions";

const STATUS_LABELS: Record<SupportTicket["status"], string> = {
  open: "접수",
  inProgress: "처리 중",
  resolved: "답변 완료",
  closed: "종료",
};

export default function SupportDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const ticketId = params.id ?? "";
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (isRefresh = false) => {
    if (!ticketId) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const [ticketData, messageData] = await Promise.all([
        getSupportTicketById(ticketId),
        getSupportMessages(ticketId),
      ]);
      setTicket(ticketData);
      setMessages(messageData);
    } catch (err) {
      console.error("[customer][support] load detail error", err);
      setError("문의 내용을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [ticketId]);

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.headerWrap}>
        <AppHeader title="문의 상세" subtitle="답변이 등록되면 이곳에서 확인할 수 있어요." />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => loadData(true)}
        ListHeaderComponent={
          ticket ? (
            <Card style={styles.ticketCard}>
              <Text style={styles.ticketTitle}>{ticket.subject || "문의"}</Text>
              <View style={styles.metaRow}>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{STATUS_LABELS[ticket.status]}</Text>
                </View>
                <Text style={styles.metaText}>
                  접수 {ticket.createdAt ? formatTimestamp(ticket.createdAt) : "-"}
                </Text>
              </View>
              <Text style={styles.metaText}>
                업데이트 {ticket.updatedAt ? formatTimestamp(ticket.updatedAt) : "-"}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card style={[styles.messageCard, item.senderType === "admin" && styles.adminCard]}>
            <View style={styles.messageHeader}>
              <Text style={styles.messageSender}>
                {item.senderType === "admin" ? "관리자" : "나"}
              </Text>
              <Text style={styles.messageTime}>
                {item.createdAt ? formatTimestamp(item.createdAt) : ""}
              </Text>
            </View>
            <Text style={styles.messageBody}>{item.content}</Text>
          </Card>
        )}
        ListEmptyComponent={
          loading ? (
            <Text style={styles.loadingText}>불러오는 중...</Text>
          ) : (
            <Text style={styles.emptyText}>아직 답변이 등록되지 않았습니다.</Text>
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
  ticketCard: { gap: spacing.xs, marginBottom: spacing.md },
  ticketTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: { fontSize: 12, fontWeight: "700", color: colors.text },
  metaText: { fontSize: 12, color: colors.subtext },
  messageCard: { gap: spacing.xs },
  adminCard: { borderColor: colors.primary, borderWidth: 1 },
  messageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  messageSender: { fontSize: 12, fontWeight: "700", color: colors.text },
  messageTime: { fontSize: 11, color: colors.subtext },
  messageBody: { fontSize: 13, color: colors.text, lineHeight: 18 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  loadingText: { color: colors.subtext, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  emptyText: { color: colors.subtext, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
