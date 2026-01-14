import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ChatDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { subscribePartnerChats } from "@/src/actions/chatActions";
import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

export default function PartnerChatsScreen() {
  const router = useRouter();
  const partnerId = useAuthUid();
  const [items, setItems] = useState<ChatDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribePartnerChats(
      partnerId ?? "",
      (chats) => {
        setItems(chats);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[partner][chats] onSnapshot error", err);
        if (String(err).includes("failed-precondition")) {
          console.error("[partner][chats] index required for chats query");
        }
        setError(LABELS.messages.errorLoadChats);
        setLoading(false);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  const visibleItems = useMemo(
    () => items.filter((item) => !item.partnerHidden),
    [items]
  );

  const renderEmpty = useMemo(() => {
    if (loading) {
      return <EmptyState title={LABELS.messages.loading} />;
    }
    if (error) {
      return <EmptyState title={LABELS.messages.errorLoadChats} />;
    }
    return <EmptyState title={LABELS.messages.noChats} description="아직 채팅이 없습니다." />;
  }, [loading, error]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title={LABELS.headers.chats}
        subtitle="고객과의 대화를 확인하세요."
        rightAction={<NotificationBell href="/(partner)/notifications" />}
      />

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/(partner)/chats/[id]",
                params: { id: item.id },
              })
            }
          >
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>채</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.title}>{item.requestId}</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {item.lastMessageText ?? LABELS.messages.noMessages}
                  </Text>
                </View>
                <View style={styles.meta}>
                  <Text style={styles.time}>
                    {item.lastMessageAt
                      ? formatTimestamp(item.lastMessageAt as never)
                      : LABELS.messages.justNow}
                  </Text>
                  {item.unreadPartner > 0 ? (
                    <Chip label={`미확인 ${item.unreadPartner}`} tone="warning" />
                  ) : null}
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.chipBg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "800", color: colors.primary },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  subtitle: { marginTop: 4, color: colors.subtext, fontSize: 12 },
  meta: { alignItems: "flex-end", gap: 6 },
  time: { color: colors.subtext, fontSize: 11 },
});
