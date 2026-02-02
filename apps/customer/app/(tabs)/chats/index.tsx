import { useEffect, useMemo, useRef, useState } from "react";
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

type RequestInfo = {
  id: string;
  serviceText: string;
  location: string;
  unreadTotal: number;
  lastUpdated: unknown;
  partnerCount: number;
  quoteCount: number;
};

export default function ChatsScreen() {
  const router = useRouter();
  const auth = useAuthUid();
  const uid = auth.uid;
  const ready = auth.status === "ready";
  const [chats, setChats] = useState<ChatDoc[]>([]);
  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [quoteCounts, setQuoteCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
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
    setIsLoading(true);
    const startTime = Date.now();
    console.log("[chats:subscribeCustomerChats] START", { uid });

    const unsub = subscribeCustomerChats(
      uid,
      (items) => {
        const elapsed = Date.now() - startTime;
        console.log("[chats:subscribeCustomerChats] COMPLETE", { count: items.length, elapsed: `${elapsed}ms` });
        setChats(items);
        setError(null);
        setIsLoading(false);
        if (items.length === 0 && !hadErrorRef.current) {
          console.info("[chats] empty result: no error; data missing or filter mismatch");
        }
      },
      (err) => {
        hadErrorRef.current = true;
        console.error("[chats] subscribeCustomerChats error", err);
        setError(LABELS.messages.errorLoadChats);
        setIsLoading(false);
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

    const startTime = Date.now();
    console.log("[chats:subscribeMyRequests] START", { uid });

    const unsub = subscribeMyRequests(
      uid,
      (items) => {
        const elapsed = Date.now() - startTime;
        console.log("[chats:subscribeMyRequests] COMPLETE", { count: items.length, elapsed: `${elapsed}ms` });
        setRequests(items);
      },
      (err) => {
        console.error("[chats] subscribeMyRequests error", err);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [ready, uid]);

  // ✅ chats 정보를 request별로 미리 계산 (chats 변경시만 재계산)
  const chatsByRequestId = useMemo(() => {
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

    const map = new Map<
      string,
      { unreadTotal: number; lastUpdated: unknown; partnerCount: number }
    >();

    requests.forEach((req) => {
      const chatsForRequest = chats.filter((chat) => chat.requestId === req.id);
      const unreadTotal = chatsForRequest.reduce(
        (sum, chat) => sum + Number(chat.unreadCustomer ?? 0),
        0
      );
      const lastChat = chatsForRequest
        .slice()
        .sort((a, b) => pick(b.updatedAt) - pick(a.updatedAt))[0];
      const lastUpdated = lastChat?.updatedAt ?? req.createdAt;
      const partnerCount = new Set(
        chatsForRequest.map((chat) => chat.partnerId).filter(Boolean) as string[]
      ).size;

      map.set(req.id, { unreadTotal, lastUpdated, partnerCount });
    });

    return map;
  }, [chats, requests]);

  // ✅ requests 변경시만 기본 정보 재계산
  const requestInfos = useMemo(() => {
    return requests.map((item) => {
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
      const quoteCount = quoteCounts[item.id] ?? item.quoteCount ?? 0;
      const chatInfo = chatsByRequestId.get(item.id) ?? {
        unreadTotal: 0,
        lastUpdated: item.createdAt,
        partnerCount: 0,
      };

      return {
        id: item.id,
        serviceText,
        location,
        unreadTotal: chatInfo.unreadTotal,
        lastUpdated: chatInfo.lastUpdated,
        partnerCount: chatInfo.partnerCount,
        quoteCount,
      };
    });
  }, [requests, quoteCounts, chatsByRequestId]);

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
        data={requestInfos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.loadingText}>{LABELS.messages.loading}</Text>
          ) : (
            <EmptyState title="제출한 요청이 없습니다." description="요청을 등록하면 채팅을 시작할 수 있어요." />
          )
        }
        renderItem={({ item: info }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/(customer)/chats/request/${info.id}`)}
          >
            <Card style={styles.cardSurface}>
              <CardRow>
                <View style={styles.info}>
                  {info.serviceText ? (
                    <Text style={styles.serviceText} numberOfLines={1}>
                      {info.serviceText}
                    </Text>
                  ) : null}
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {info.location || "요청 상세 확인"}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    채팅 {info.partnerCount}건 · 견적 {info.quoteCount}건
                  </Text>
                </View>
                <View style={styles.metaRight}>
                  <Text style={styles.time}>
                    {info.lastUpdated
                      ? formatTimestamp(info.lastUpdated as never)
                      : LABELS.messages.justNow}
                  </Text>
                  {info.unreadTotal > 0 ? <Chip label={`${info.unreadTotal}`} tone="warning" /> : null}
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
  loadingText: { color: colors.subtext, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
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
