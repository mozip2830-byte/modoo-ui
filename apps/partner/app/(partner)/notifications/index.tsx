import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { subscribeNotifications, markNotificationRead } from "@/src/actions/notificationActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { NotificationDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

export default function PartnerNotificationsScreen() {
  const router = useRouter();
  const { uid } = useAuthUid();
  const [items, setItems] = useState<NotificationDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeNotifications({
      uid: uid ?? "",
      onData: (data) => {
        setItems(data);
        setError(null);
      },
      onError: (err) => {
        console.error("[partner][notifications] subscribe error", err);
        setError("알림을 불러오지 못했습니다.");
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [uid]);

  const handleOpen = async (item: NotificationDoc) => {
    if (uid && !item.read) {
      markNotificationRead(uid, item.id).catch((err) => {
        console.error("[partner][notifications] mark read error", err);
      });
    }

    const data = item.data as Record<string, unknown> | undefined;
    if (item.type === "chat_received" && data?.chatId) {
      router.push(`/(partner)/chats/${data.chatId}`);
      return;
    }
    if (item.type === "points_charged" || item.type === "points_low") {
      router.push("/(partner)/billing");
      return;
    }
    if (item.type === "subscription_active" || item.type === "subscription_expired") {
      router.push("/(partner)/billing");
    }
  };

  const content = useMemo(() => {
    if (!items.length) {
      return (
        <EmptyState
          title="알림이 없습니다."
          description="채팅이나 결제 알림이 오면 알려드릴게요."
        />
      );
    }
    return (
      <View style={styles.list}>
        {items.map((item) => (
          <TouchableOpacity key={item.id} onPress={() => handleOpen(item)}>
            <Card style={[styles.card, !item.read && styles.cardUnread]}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
              {!item.read ? <Text style={styles.unread}>새 알림</Text> : null}
            </Card>
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [items, uid]);

  return (
    <Screen style={styles.container} contentContainerStyle={styles.scroll}>
      <AppHeader title="알림" subtitle="중요한 업데이트를 확인하세요." />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {content}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  list: { gap: spacing.md },
  card: { gap: spacing.xs },
  cardUnread: { borderWidth: 1, borderColor: colors.primary },
  title: { fontWeight: "700", color: colors.text },
  body: { color: colors.subtext, fontSize: 12 },
  unread: { marginTop: spacing.xs, color: colors.primary, fontSize: 12, fontWeight: "700" },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
});
