import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { subscribeCustomerChats } from "@/src/actions/chatActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { ChatDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { Screen } from "@/src/components/Screen";
import { colors, spacing } from "@/src/ui/tokens";

export default function ChatsScreen() {
  const router = useRouter();
  const auth = useAuthUid();
  const uid = auth.uid;
  const ready = auth.status === "ready";
  const [chats, setChats] = useState<ChatDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hadErrorRef = useRef(false);

  useEffect(() => {
    if (!ready) {
      setError(null);
      return;
    }

    if (!uid) {
      setChats([]);
      setError(LABELS.messages.loginRequired);
      console.info("[chats] subscribe skipped: missing uid");
      return;
    }

    hadErrorRef.current = false;
    console.log("[chats] uid=", uid, "subscribe start");

    const unsub = subscribeCustomerChats(
      uid,
      (items) => {
        setChats(items);
        setError(null);
        console.log("[chats] onData count=", items.length);
        if (items.length === 0 && !hadErrorRef.current) {
          console.info("[chats] empty result: no error; data missing or filter mismatch");
        }
      },
      (err) => {
        hadErrorRef.current = true;
        console.error("[chats] onError", err);
        setError(LABELS.messages.errorLoadChats);
      }
    );
    return () => {
      if (unsub) unsub();
    };
  }, [ready, uid]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title={LABELS.headers.chats}
        subtitle="최근 대화 목록을 확인하세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/notifications" />
            <TouchableOpacity onPress={() => router.push("/login")} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />
      {error ? <Text style={styles.error}>오류: {error}</Text> : null}
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState title={LABELS.messages.noChats} description="요청 상세에서 채팅을 시작하세요." />
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/chats/${item.id}`)}>
            <Card>
              <CardRow>
                <View style={styles.avatar} />
                <View style={styles.info}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {LABELS.labels.partner}: {item.partnerId ?? "-"}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.lastMessageText ?? LABELS.messages.noMessages}
                  </Text>
                </View>
                <View style={styles.metaRight}>
                  <Text style={styles.time}>
                    {item.updatedAt
                      ? formatTimestamp(item.updatedAt as never)
                      : LABELS.messages.justNow}
                  </Text>
                  {item.unreadCustomer > 0 ? (
                    <Chip label={`${item.unreadCustomer}`} tone="warning" />
                  ) : null}
                </View>
              </CardRow>
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
  card: { marginBottom: spacing.md },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  cardMeta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D9F5F0",
  },
  info: { flex: 1, marginLeft: spacing.md },
  metaRight: { alignItems: "flex-end", gap: spacing.xs },
  time: { color: colors.subtext, fontSize: 11 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
});
