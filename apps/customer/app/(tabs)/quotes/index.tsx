import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useRef, useState } from "react";
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
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { Screen } from "@/src/components/Screen";
import { colors, spacing } from "@/src/ui/tokens";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/src/firebase";

function formatNumberSafe(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed.toLocaleString("ko-KR");
  }
  return "-";
}

function formatDateValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toLocaleDateString("ko-KR");
  }
  if (value && typeof value === "object" && "toMillis" in value) {
    const ms = (value as { toMillis?: () => number }).toMillis?.();
    if (typeof ms === "number" && Number.isFinite(ms)) {
      return new Date(ms).toLocaleDateString("ko-KR");
    }
  }
  return "-";
}

export default function QuotesScreen() {
  const router = useRouter();
  const auth = useAuthUid();
  const uid = auth.uid;
  const ready = auth.status !== "authLoading";
  const isLoggedOut = ready && !uid;
  const [items, setItems] = useState<RequestDoc[]>([]);
  const [quoteCounts, setQuoteCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const quoteUnsubsRef = useRef<Record<string, () => void>>({});

  useEffect(() => {
    if (!ready) {
      setError(null);
      setLoading(true);
      return;
    }

    if (!uid) {
      setItems([]);
      setError(null);
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

  useEffect(() => {
    const unsubs = quoteUnsubsRef.current;
    const activeIds = new Set(items.map((item) => item.id));

    Object.keys(unsubs).forEach((requestId) => {
      if (!activeIds.has(requestId)) {
        unsubs[requestId]?.();
        delete unsubs[requestId];
      }
    });

    items.forEach((item) => {
      if (unsubs[item.id]) return;
      const ref = collection(db, "requests", item.id, "quotes");
      unsubs[item.id] = onSnapshot(
        ref,
        (snap) => {
          setQuoteCounts((prev) => ({
            ...prev,
            [item.id]: snap.size,
          }));
        },
        (err) => {
          console.warn("[quotes] quote count error", err);
        }
      );
    });

    return () => {
      Object.values(unsubs).forEach((unsub) => unsub());
      quoteUnsubsRef.current = {};
    };
  }, [items]);

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.headerTop}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{LABELS.headers.quotes}</Text>
          <Text style={styles.headerSubtitle}>{LABELS.messages.closedHidden}</Text>
        </View>
        <View style={styles.headerActions}>
          <NotificationBell href="/notifications" />
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/login", params: { force: "1" } })}
            style={styles.iconBtn}
          >
            <FontAwesome name="user" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
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
            <Card style={styles.card}>
              <CardRow>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    {item.serviceType ?? "-"}
                    {item.serviceSubType ? ` / ${item.serviceSubType}` : ""}
                  </Text>
                  <View style={styles.cardTags}>
                    {item.targetPartnerId ? <Chip label="지정요청" tone="warning" /> : null}
                    <Chip label={item.status === "open" ? "접수" : "마감"} />
                  </View>
                </View>
              </CardRow>
              <View style={styles.subRow}>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {item.addressRoad ?? item.addressDong ?? "-"}
                </Text>
                <Text style={styles.cardMeta}>
                  견적 {quoteCounts[item.id] ?? item.quoteCount ?? 0}건
                </Text>
              </View>
              <Text style={styles.cardMeta}>
                {item.createdAt ? formatTimestamp(item.createdAt as never) : LABELS.messages.justNow}
              </Text>
              {item.description ? (
                <Text style={styles.cardNote} numberOfLines={2}>
                  특이사항: {item.description}
                </Text>
              ) : null}
              {item.note ? (
                <Text style={styles.cardNote} numberOfLines={2}>
                  요청사항: {item.note}
                </Text>
              ) : null}
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <Text style={styles.loadingText}>{LABELS.messages.loading}</Text>
          ) : isLoggedOut ? (
            <EmptyState
              title={LABELS.messages.noQuotes}
              description="로그인 후 받은 견적을 확인할 수 있습니다."
            />
          ) : (
            <EmptyState
              title={LABELS.messages.noQuotes}
              description="견적을 받으려면 요청을 등록하세요."
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2ED" },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  cardWrap: { marginBottom: spacing.md },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTags: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cardTitle: { fontSize: 18, fontWeight: "800", color: colors.text, flex: 1, marginRight: spacing.sm },
  subRow: { marginTop: spacing.xs, flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  cardSub: { color: colors.subtext, fontSize: 13, flex: 1 },
  cardMeta: { color: colors.subtext, fontSize: 13 },
  cardNote: { marginTop: spacing.xs, color: colors.text, fontSize: 13 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  loadingText: { color: colors.subtext, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerTop: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  headerSubtitle: { marginTop: 4, color: colors.subtext, fontSize: 12 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8E0D6",
  },
});

