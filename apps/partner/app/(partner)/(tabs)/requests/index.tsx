import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getApp } from "firebase/app";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";

import { db } from "@/src/firebase";
import { RequestDoc, QuoteDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { subscribeMyQuotes } from "@/src/actions/partnerActions";

const USE_RAW_REQUESTS_QUERY = false; // toggle for debugging (no filter/order)
const USE_CREATED_AT_ORDER = true; // set false if createdAt missing

export default function PartnerRequestsTab() {
  const router = useRouter();
  const partnerId = useAuthUid();
  const [items, setItems] = useState<RequestDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quoteMap, setQuoteMap] = useState<Record<string, QuoteDoc>>({});

  useEffect(() => {
    console.log("[partner] projectId=", getApp().options.projectId);

    const base = collection(db, "requests");
    const q = USE_RAW_REQUESTS_QUERY
      ? base
      : USE_CREATED_AT_ORDER
        ? query(base, where("status", "==", "open"), orderBy("createdAt", "desc"))
        : query(base, where("status", "==", "open"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        console.log("[partner][requests] snap.size=", snap.size);
        setItems(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<RequestDoc, "id">),
          }))
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("[partner][requests] onSnapshot error", err);
        setError("Unable to load requests.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeMyQuotes(
      partnerId ?? "",
      (quotes) => {
        const map: Record<string, QuoteDoc> = {};
        quotes.forEach((quote) => {
          map[quote.requestId] = quote;
        });
        setQuoteMap(map);
      },
      (err) => {
        console.error("[partner][quotes] onSnapshot error", err);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  const badgeIds = useMemo(() => new Set(Object.keys(quoteMap)), [quoteMap]);

  const renderEmpty = () => {
    if (loading) return <Text style={styles.muted}>Loading...</Text>;
    if (error) return null;
    return <Text style={styles.muted}>No requests.</Text>;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Requests</Text>
      </View>
      {error ? <Text style={styles.error}>Unable to load requests.</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => {
          const hasQuote = badgeIds.has(item.id);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(partner)/requests/${item.id}`)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {hasQuote ? <Text style={styles.badge}>Submitted</Text> : null}
              </View>
              <Text style={styles.cardMeta}>{item.location}</Text>
              <Text style={styles.cardMeta}>Budget: {item.budget.toLocaleString()}</Text>
              <Text style={styles.cardMeta}>
                {item.createdAt ? formatTimestamp(item.createdAt as never) : "Just now"}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  header: {
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: "700" },
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
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardMeta: { marginTop: 6, color: "#6B7280" },
  badge: {
    backgroundColor: "#111827",
    color: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    overflow: "hidden",
  },
  error: { color: "#DC2626", marginBottom: 8 },
  muted: { color: "#6B7280", paddingVertical: 12 },
});
