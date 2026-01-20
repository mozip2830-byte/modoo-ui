// apps/customer/app/(customer)/chats/index.tsx
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { subscribeCustomerChats } from "@/src/actions/chatActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { ChatDoc } from "@/src/types/models";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

function resolveAuth(auth: unknown): { customerId: string | null; ready: boolean } {
  if (typeof auth === "string") return { customerId: auth, ready: true };
  if (auth && typeof auth === "object") {
    const uid = (auth as any).uid ?? null;
    const ready = (auth as any).ready ?? true;
    return { customerId: uid, ready: Boolean(ready) };
  }
  return { customerId: null, ready: false };
}

function shortId(id: string) {
  if (!id) return "";
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function CustomerChatsListScreen() {
  const router = useRouter();

  const auth = useAuthUid();
  const { customerId, ready } = useMemo(() => resolveAuth(auth), [auth]);

  const [items, setItems] = useState<ChatDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) {
      setLoading(true);
      return;
    }
    if (!customerId) {
      setItems([]);
      setLoading(false);
      setError(LABELS.messages.loginRequired);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = subscribeCustomerChats(
      customerId,
      (chats) => {
        setItems(chats);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[customer][chats] subscribe error", err);
        setItems([]);
        setLoading(false);
        setError(LABELS.messages.errorLoadChats);
      }
    );

    return () => unsub?.();
  }, [ready, customerId]);

  const openChat = (chat: ChatDoc) => {
    router.push({
      pathname: "/(customer)/chats/[id]",
      params: { id: chat.id, requestId: chat.requestId, partnerId: chat.partnerId },
    } as any);
  };

  return (
    <Screen scroll={false} style={styles.container}>
      {/* ✅ 커스텀 상단바: 기본 헤더를 끄면 이 것만 남음 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{LABELS.actions.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{LABELS.headers.chats ?? "채팅"}</Text>
        <View style={{ width: 52 }} />
      </View>

      {!ready ? (
        <View style={styles.loadingBox}>
          <Text style={styles.muted}>로그인 정보를 확인 중입니다…</Text>
        </View>
      ) : error ? (
        <View style={styles.loadingBox}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? (
              <EmptyState title="아직 채팅이 없어요" description="견적을 받은 뒤 채팅을 시작할 수 있어요." />
            ) : (
              <View style={styles.loadingBox}>
                <Text style={styles.muted}>{LABELS.messages.loading}</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const title = item.partnerName?.trim()
              ? item.partnerName
              : `업체 ${shortId(item.partnerId)}`;

            const subtitle =
              (item.lastMessageText && String(item.lastMessageText).trim()) || "대화를 시작해보세요";

            const timeText = item.updatedAt ? formatTimestamp(item.updatedAt as never) : "";

            const unread = Number((item as any).unreadCustomer ?? 0);

            return (
              <TouchableOpacity onPress={() => openChat(item)} activeOpacity={0.85}>
                <Card style={styles.rowCard}>
                  <View style={styles.rowTop}>
                    <Text style={styles.title} numberOfLines={1}>
                      {title}
                    </Text>

                    <View style={styles.rightTop}>
                      {timeText ? <Text style={styles.time}>{timeText}</Text> : null}
                      {unread > 0 ? <Chip label={`${unread}`} tone="warning" /> : null}
                    </View>
                  </View>

                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </Card>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    height: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 52,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backText: { color: colors.text, fontWeight: "700" },
  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: colors.text },

  loadingBox: { padding: 16, alignItems: "center" },
  muted: { color: colors.subtext },
  error: { color: colors.danger, fontWeight: "700" },

  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.md },

  rowCard: { padding: spacing.lg },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 15 },
  rightTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  time: { color: colors.subtext, fontSize: 12 },
  subtitle: { marginTop: spacing.sm, color: colors.subtext, fontSize: 13 },
});
