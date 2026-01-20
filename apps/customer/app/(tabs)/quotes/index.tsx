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
  const auth = useAuthUid();
  const uid = auth.uid;
  const ready = auth.status === "ready";
  const [items, setItems] = useState<RequestDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) {
      setError(null);
      setLoading(true);
      return;
    }

    if (!uid) {
      setItems([]);
      setError(LABELS.messages.loginRequired);
      setLoading(false);
      return;
    }

    let active = true;
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!active || settled) return;
      console.warn("[quotes] timeout");
      setError(LABELS.messages.errorLoadRequests);
      setLoading(false);
      settled = true;
    }, 10000);

    setLoading(true);
    setError(null);
    console.log("[quotes] uid=", uid, "subscribe start");

    const unsub = subscribeOpenRequestsForCustomer({
      customerId: uid,
      limit: 30,
      onData: (data) => {
        if (!active) return;
        if (!settled) {
          clearTimeout(timeoutId);
          settled = true;
        }
        setItems(data);
        setError(null);
        setLoading(false);
        console.log("[quotes] requestsWithQuotes count=", data.length);
      },
      onError: (err) => {
        if (!active) return;
        if (!settled) {
          clearTimeout(timeoutId);
          settled = true;
        }
        console.error("[quotes] onError", err);
        setItems([]);
        setError(LABELS.messages.errorLoadRequests);
        setLoading(false);
      },
    });

    return () => {
      active = false;
      clearTimeout(timeoutId);
      if (unsub) unsub();
    };
  }, [ready, uid]);

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
                <Chip label={item.status === "open" ? "Open" : "Closed"} />
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
          loading ? (
            <Text style={styles.loadingText}>{LABELS.messages.loading}</Text>
          ) : (
            <EmptyState
              title={LABELS.messages.noQuotes}
              description="Create a request to receive quotes."
            />
          )
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
  loadingText: { color: colors.subtext, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
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

