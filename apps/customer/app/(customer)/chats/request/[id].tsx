import { useEffect, useMemo, useState } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, getDocs, collection, query, orderBy, limit, where } from "firebase/firestore";

import { subscribeCustomerChats } from "@/src/actions/chatActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { ChatDoc } from "@/src/types/models";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

type PartnerMeta = {
  name: string;
  reviewCount: number;
  ratingAvg: number;
};

type RequestMeta = {
  serviceType?: string;
  serviceSubType?: string;
  addressRoad?: string;
  addressDong?: string;
};

function shortId(id: string) {
  if (!id) return "";
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

export default function CustomerRequestChatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const requestId = params.id ?? "";

  const auth = useAuthUid();
  const uid = auth.uid;
  const ready = auth.status === "ready";

  const [items, setItems] = useState<ChatDoc[]>([]);
  const [allItems, setAllItems] = useState<ChatDoc[]>([]);
  const [partnerMeta, setPartnerMeta] = useState<Record<string, PartnerMeta>>({});
  const [requestMeta, setRequestMeta] = useState<RequestMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(3);

  const partnerIds = useMemo(() => {
    const ids = items
      .map((chat) => chat.partnerId)
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(ids));
  }, [items]);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "requests", requestId));
        if (!snap.exists() || cancelled) return;
        const data = snap.data() as RequestMeta;
        setRequestMeta({
          serviceType: data.serviceType,
          serviceSubType: data.serviceSubType,
          addressRoad: data.addressRoad,
          addressDong: data.addressDong,
        });
      } catch (err) {
        console.warn("[customer][chats] request meta error", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  useEffect(() => {
    const missing = partnerIds.filter((id) => !partnerMeta[id]);
    if (!missing.length) return;

    let cancelled = false;

    (async () => {
      // ✅ 배치 로딩 제거: 모든 파트너를 한 번에 로드
      const entries = await Promise.all(
        missing.map(async (partnerId) => {
          try {
            const snap = await getDoc(doc(db, "partners", partnerId));
            if (!snap.exists()) return [partnerId, { name: `파트너 ${shortId(partnerId)}`, reviewCount: 0, ratingAvg: 0 }] as const;
            const data = snap.data() as {
              name?: string;
              companyName?: string;
              reviewCount?: number;
              ratingAvg?: number;
              trust?: { reviewCount?: number; reviewAvg?: number };
            };
            const name = data?.name ?? data?.companyName ?? `파트너 ${shortId(partnerId)}`;
            const reviewCount = Number(data?.reviewCount ?? data?.trust?.reviewCount ?? 0);
            const ratingAvg = Number(data?.ratingAvg ?? data?.trust?.reviewAvg ?? 0);
            return [partnerId, { name, reviewCount, ratingAvg }] as const;
          } catch {
            return [partnerId, { name: `파트너 ${shortId(partnerId)}`, reviewCount: 0, ratingAvg: 0 }] as const;
          }
        })
      );

      if (cancelled) return;

      setPartnerMeta((prev) => {
        const next = { ...prev };
        entries.forEach(([partnerId, meta]) => {
          next[partnerId] = meta;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [partnerIds]);

  useEffect(() => {
    if (!ready) {
      setLoading(true);
      return;
    }
    if (!uid) {
      setItems([]);
      setLoading(false);
      setError(LABELS.messages.loginRequired);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = subscribeCustomerChats(
      uid,
      (chats) => {
        const filtered = chats.filter((chat) => chat.requestId === requestId);
        setAllItems(filtered);
        setItems(filtered.slice(0, 3)); // 처음에 3개만
        setDisplayCount(3);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[customer][chats] subscribe error", err);
        setItems([]);
        setAllItems([]);
        setLoading(false);
        setError(LABELS.messages.errorLoadChats);
      }
    );

    return () => unsub?.();
  }, [ready, uid, requestId]);

  const headerTitle = (() => {
    const rawType = requestMeta?.serviceType;
    const rawSub = requestMeta?.serviceSubType;
    if (!rawType) return "채팅 목록";
    return `${rawType}${rawSub ? ` / ${rawSub}` : ""}`;
  })();
  const headerSubtitle = requestMeta?.addressRoad || requestMeta?.addressDong || "";

  const handleLoadMore = () => {
    if (displayCount >= allItems.length) return;
    const nextCount = Math.min(displayCount + 5, allItems.length);
    setDisplayCount(nextCount);
    setItems(allItems.slice(0, nextCount));
  };

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{LABELS.actions.back}</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          {headerSubtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
        </View>
        <View style={{ width: 52 }} />
      </View>

      {error ? (
        <View style={styles.loadingBox}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            !loading ? (
              <EmptyState title="채팅이 없습니다." description="견적을 보낸 파트너가 아직 없습니다." />
            ) : (
              <View style={styles.loadingBox}>
                <Text style={styles.muted}>{LABELS.messages.loading}</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const title = partnerMeta[item.partnerId ?? ""]?.name || `파트너 ${shortId(item.partnerId ?? "")}`;
            const lastMessage =
              (item.lastMessageText && String(item.lastMessageText).trim()) || "대화를 시작해 보세요.";

            // 시간 표시 - 여러 필드 시도
            let timeText = "";
            if (item.updatedAt) {
              timeText = formatTimestamp(item.updatedAt as never);
            } else if (item.lastMessageAt) {
              timeText = formatTimestamp(item.lastMessageAt as never);
            } else if (item.createdAt) {
              timeText = formatTimestamp(item.createdAt as never);
            }

            const detailText = timeText ? `${lastMessage} · ${timeText}` : lastMessage;
            const unread = Number((item as any).unreadCustomer ?? 0);

            return (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/(customer)/chats/[id]",
                    params: { id: item.id, requestId: item.requestId, partnerId: item.partnerId },
                  } as any)
                }
                activeOpacity={0.85}
              >
                <Card style={styles.rowCard}>
                  <View style={styles.rowTop}>
                    <View style={styles.rowMain}>
                      <Text style={styles.title} numberOfLines={1}>
                        {title}
                      </Text>
                    </View>

                    <View style={styles.rightTop}>
                      {unread > 0 ? <Chip label={`${unread}`} tone="warning" /> : null}
                    </View>
                  </View>

                  <Text style={styles.subtitle} numberOfLines={1}>
                    {detailText}
                  </Text>
                </Card>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontWeight: "800", color: colors.text, fontSize: 15 },
  headerSubtitle: { color: colors.subtext, fontSize: 12 },
  backBtn: {
    width: 52,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backText: { color: colors.text, fontWeight: "700" },

  loadingBox: { padding: 16, alignItems: "center" },
  muted: { color: colors.subtext },
  error: { color: colors.danger, fontWeight: "700" },

  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.md },

  rowCard: { padding: spacing.lg },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  rowMain: { flex: 1, gap: 2 },
  title: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 15 },
  rightTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  time: { color: colors.subtext, fontSize: 12 },
  subtitle: { marginTop: spacing.sm, color: colors.subtext, fontSize: 13 },

  recommendedSection: { marginBottom: spacing.lg, gap: spacing.md },
  recommendedTitle: { paddingHorizontal: spacing.lg, fontSize: 16, fontWeight: "700", color: colors.text },
  recommendedList: { paddingHorizontal: spacing.lg, gap: spacing.md },
  recommendedCard: {
    width: Dimensions.get("window").width - spacing.lg * 4,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  recommendedImageBox: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  recommendedImage: { width: "100%", height: "100%" },
  recommendedPlaceholder: { width: "100%", height: "100%", backgroundColor: colors.border },
  recommendedName: { fontSize: 16, fontWeight: "700", color: colors.text, textAlign: "center" },
  recommendedRating: { fontSize: 13, fontWeight: "600", color: colors.primary },
  recommendedReview: { fontSize: 12, color: colors.subtext },
});
