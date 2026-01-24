import { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { collection, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";

import { subscribeCustomerChats } from "@/src/actions/chatActions";
import { subscribeMyRequests } from "@/src/actions/requestActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { ChatDoc, RequestDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { LABELS } from "@/src/constants/labels";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { Screen } from "@/src/components/Screen";
import { colors, spacing } from "@/src/ui/tokens";
import { db } from "@/src/firebase";

export default function ChatsScreen() {
  const router = useRouter();
  const auth = useAuthUid();
  const uid = auth.uid;
  const ready = auth.status === "ready";
  const [chats, setChats] = useState<ChatDoc[]>([]);
  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [quoteCounts, setQuoteCounts] = useState<Record<string, number>>({});
  const hadErrorRef = useRef(false);
  const backfillRef = useRef(new Set<string>());
  const quoteUnsubsRef = useRef<Record<string, () => void>>({});

  useEffect(() => {
    if (!ready) {
      setError(null);
      return;
    }

    if (!uid) {
      setChats([]);
      setRequests([]);
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

  useEffect(() => {
    const unsubs = quoteUnsubsRef.current;
    const activeIds = new Set(requests.map((item) => item.id));

    Object.keys(unsubs).forEach((requestId) => {
      if (!activeIds.has(requestId)) {
        unsubs[requestId]?.();
        delete unsubs[requestId];
      }
    });

    requests.forEach((item) => {
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
          console.warn("[chats] quote count error", err);
        }
      );
    });

    return () => {
      Object.values(unsubs).forEach((unsub) => unsub());
      quoteUnsubsRef.current = {};
    };
  }, [requests]);

  useEffect(() => {
    if (!ready) return;
    if (!uid) {
      setRequests([]);
      return;
    }

    const unsub = subscribeMyRequests(
      uid,
      (items) => {
        setRequests(items);
      },
      (err) => {
        console.error("[chats] request list error", err);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [ready, uid]);

  useEffect(() => {
    if (!uid || chats.length === 0) return;
    const missing = chats.filter((chat) => {
      if (chat.customerId !== uid) return false;
      const hasName = Boolean((chat as any).customerName);
      const hasPhoto = Boolean((chat as any).customerPhotoUrl);
      return !hasName || !hasPhoto;
    });
    if (!missing.length) return;

    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "customerUsers", uid));
        if (!snap.exists() || cancelled) return;
        const data = snap.data() as {
          nickname?: string;
          name?: string;
          email?: string;
          photoUrl?: string | null;
        };
        const customerName =
          data.nickname?.trim() || data.name?.trim() || data.email?.trim() || "";
        const customerPhotoUrl = data.photoUrl ?? null;

        const updates: Record<string, unknown> = {};
        if (customerName) updates.customerName = customerName;
        if (customerPhotoUrl) updates.customerPhotoUrl = customerPhotoUrl;
        if (!Object.keys(updates).length) return;

        await Promise.all(
          missing.map(async (chat) => {
            if (backfillRef.current.has(chat.id)) return;
            backfillRef.current.add(chat.id);
            try {
              await updateDoc(doc(db, "chats", chat.id), updates);
            } catch (err) {
              console.warn("[chats] chat meta backfill error", err);
            }
          })
        );
      } catch (err) {
        console.warn("[chats] customer profile load error", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, chats]);

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.headerTop}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{LABELS.headers.chats}</Text>
          <Text style={styles.headerSubtitle}>제출한 견적 요청을 확인하세요.</Text>
        </View>
        <View style={styles.headerActions}>
          <NotificationBell href="/notifications" />
          <TouchableOpacity onPress={() => router.push("/login")} style={styles.iconBtn}>
            <FontAwesome name="user" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState title="제출한 요청이 없습니다." description="요청을 등록하면 채팅을 시작할 수 있어요." />
        }
        renderItem={({ item }) => {
          const serviceText = (() => {
            const rawType = (item as any).serviceType ?? (item as any).title;
            const rawSub = (item as any).serviceSubType;
            if (!rawType) return "요청";
            return `${rawType}${rawSub ? ` / ${rawSub}` : ""}`;
          })();
          const location =
            (item as any).addressRoad ??
            (item as any).addressDong ??
            (item as any).location ??
            "";
          const chatsForRequest = chats.filter((chat) => chat.requestId === item.id);
          const unreadTotal = chatsForRequest.reduce(
            (sum, chat) => sum + Number(chat.unreadCustomer ?? 0),
            0
          );
          const lastChat = chatsForRequest
            .slice()
            .sort((a, b) => {
              const pick = (value: unknown) => {
                if (!value) return 0;
                if (typeof value === "number") return value;
                if (typeof value === "object") {
                  const maybe = value as { toMillis?: () => number; seconds?: number };
                  if (typeof maybe.toMillis === "function") return maybe.toMillis();
                  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
                }
                return 0;
              };
              return pick(b.updatedAt) - pick(a.updatedAt);
            })[0];
          const lastUpdated = lastChat?.updatedAt ?? item.createdAt;
          const partnerCount = new Set(
            chatsForRequest.map((chat) => chat.partnerId).filter(Boolean) as string[]
          ).size;
          const quoteCount = quoteCounts[item.id] ?? item.quoteCount ?? 0;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(customer)/chats/request/${item.id}`)}
            >
              <Card style={styles.cardSurface}>
                <CardRow>
                  <View style={styles.info}>
                    {serviceText ? (
                      <Text style={styles.serviceText} numberOfLines={1}>
                        {serviceText}
                      </Text>
                    ) : null}
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {location || "요청 상세 확인"}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      채팅 {partnerCount}건 · 견적 {quoteCount}건
                    </Text>
                  </View>
                  <View style={styles.metaRight}>
                    <Text style={styles.time}>
                      {lastUpdated
                        ? formatTimestamp(lastUpdated as never)
                        : LABELS.messages.justNow}
                    </Text>
                    {unreadTotal > 0 ? <Chip label={`${unreadTotal}`} tone="warning" /> : null}
                  </View>
                </CardRow>
              </Card>
            </TouchableOpacity>
          );
        }}
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
  card: { marginBottom: spacing.md },
  cardSurface: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  serviceText: { fontSize: 12, fontWeight: "700", color: colors.text },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  cardMeta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  info: { flex: 1 },
  metaRight: { alignItems: "flex-end", gap: spacing.xs },
  time: { color: colors.subtext, fontSize: 11 },
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
