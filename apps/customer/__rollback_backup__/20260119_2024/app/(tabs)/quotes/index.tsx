import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { subscribeOpenRequestsForCustomer } from "@/src/actions/requestActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { RequestDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { Screen } from "@/src/components/Screen";
import { colors, spacing } from "@/src/ui/tokens";

export default function QuotesScreen() {
  const router = useRouter();
  const uid = useAuthUid();
  const [items, setItems] = useState<RequestDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setError(LABELS.messages.loginRequired);
      return;
    }

    const unsub = subscribeOpenRequestsForCustomer({
      customerId: uid,
      onData: (data) => {
        setItems(data);
        setError(null);
      },
      onError: (err) => {
        console.error("[customer][quotes] load error", err);
        setError(LABELS.messages.errorLoadRequests);
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [uid]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title={LABELS.headers.quotes}
        subtitle={LABELS.messages.closedHidden}
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/notifications" />
            <TouchableOpacity onPress={() => router.push("/login")} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cardWrap}
            onPress={() => router.push(`/requests/${item.id}`)}
          >
            <Card>
              <CardRow>
                <View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSub}>{item.location}</Text>
                </View>
                <Chip label={item.status === "open" ? "접수" : "마감"} />
              </CardRow>
              <View style={styles.metaRow}>
                <Text style={styles.cardMeta}>
                  {LABELS.labels.budget}: {item.budget.toLocaleString()}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.createdAt
                    ? formatTimestamp(item.createdAt as never)
                    : LABELS.messages.justNow}
                </Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            title={LABELS.messages.noQuotes}
            description="요청을 등록하면 견적을 받을 수 있습니다."
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  cardWrap: { marginBottom: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardSub: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  cardMeta: { color: colors.subtext, fontSize: 12 },
  metaRow: { marginTop: spacing.md, flexDirection: "row", justifyContent: "space-between" },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
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
