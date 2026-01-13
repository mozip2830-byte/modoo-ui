import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ChatDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { subscribeCustomerChats } from "@/src/actions/chatActions";

export default function CustomerChatsScreen() {
  const router = useRouter();
  const customerId = useAuthUid();
  const [items, setItems] = useState<ChatDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeCustomerChats(
      customerId ?? "",
      (chats) => {
        setItems(chats);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[customer][chats] onSnapshot error", err);
        if (String(err).includes("failed-precondition")) {
          console.error("[customer][chats] index required for chats query");
        }
        setError("Unable to load chats.");
        setLoading(false);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [customerId]);

  const visibleItems = useMemo(
    () => items.filter((item) => !item.customerHidden),
    [items]
  );

  const renderEmpty = useMemo(() => {
    if (loading) return <Text style={styles.muted}>Loading...</Text>;
    if (error) return null;
    return <Text style={styles.muted}>No chats yet.</Text>;
  }, [loading, error]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Chats</Text>
      {error ? <Text style={styles.error}>Unable to load chats.</Text> : null}

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/(customer)/chats/[id]",
                params: { id: item.id },
              })
            }
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.requestId}</Text>
              {item.unreadCustomer > 0 ? (
                <Text style={styles.badge}>{item.unreadCustomer}</Text>
              ) : null}
            </View>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.lastMessageText ?? "No messages yet"}
            </Text>
            <Text style={styles.cardMeta}>
              {item.lastMessageAt ? formatTimestamp(item.lastMessageAt as never) : "Just now"}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  list: { gap: 12, paddingBottom: 24 },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardMeta: { marginTop: 6, color: "#6B7280" },
  badge: {
    backgroundColor: "#111827",
    color: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
    overflow: "hidden",
  },
  error: { color: "#DC2626", marginBottom: 8 },
  muted: { color: "#6B7280", paddingVertical: 12 },
});
