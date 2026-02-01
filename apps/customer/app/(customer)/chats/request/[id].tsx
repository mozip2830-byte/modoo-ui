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

type Partner = {
  id: string;
  name?: string;
  companyName?: string;
  photoUrl?: string;
  ratingAvg?: number;
  reviewCount?: number;
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
  const [recommendedPartners, setRecommendedPartners] = useState<Partner[]>([]);
  const [recommendedPartnerMeta, setRecommendedPartnerMeta] = useState<Record<string, PartnerMeta>>({});

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
      // 배치 로딩: 처음 3개는 빠르게, 나머지는 나중에 로드
      const BATCH_SIZE = 3;
      const firstBatch = missing.slice(0, BATCH_SIZE);
      const restBatch = missing.slice(BATCH_SIZE);

      const loadPartners = async (ids: string[]) => {
        const entries = await Promise.all(
          ids.map(async (partnerId) => {
            try {
              const snap = await getDoc(doc(db, "partners", partnerId));
              if (!snap.exists()) return [partnerId, { name: "", reviewCount: 0, ratingAvg: 0 }] as const;
              const data = snap.data() as {
                name?: string;
                companyName?: string;
                reviewCount?: number;
                ratingAvg?: number;
                trust?: { reviewCount?: number; reviewAvg?: number };
              };
              const name = data?.name ?? data?.companyName ?? "";
              const reviewCount = Number(data?.reviewCount ?? data?.trust?.reviewCount ?? 0);
              const ratingAvg = Number(data?.ratingAvg ?? data?.trust?.reviewAvg ?? 0);
              return [partnerId, { name, reviewCount, ratingAvg }] as const;
            } catch {
              return [partnerId, { name: "", reviewCount: 0, ratingAvg: 0 }] as const;
            }
          })
        );
        return entries;
      };

      // 첫 번째 배치 로드
      const firstEntries = await loadPartners(firstBatch);
      if (cancelled) return;

      setPartnerMeta((prev) => {
        const next = { ...prev };
        firstEntries.forEach(([partnerId, meta]) => {
          if (!next[partnerId] && meta.name) next[partnerId] = meta;
        });
        return next;
      });

      // 두 번째 배치는 약간의 지연 후 백그라운드에서 로드
      if (restBatch.length > 0) {
        setTimeout(async () => {
          if (cancelled) return;
          const restEntries = await loadPartners(restBatch);
          if (cancelled) return;

          setPartnerMeta((prev) => {
            const next = { ...prev };
            restEntries.forEach(([partnerId, meta]) => {
              if (!next[partnerId] && meta.name) next[partnerId] = meta;
            });
            return next;
          });
        }, 100);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [partnerIds, partnerMeta]);

  // 추천 파트너 로드 (평점 높은 순서로 5명)
  useEffect(() => {
    if (!requestMeta?.serviceType) return;

    let cancelled = false;

    (async () => {
      try {
        // 평점 높은 순으로 파트너 5명 가져오기
        const snap = await getDocs(
          query(
            collection(db, "partners"),
            orderBy("ratingAvg", "desc"),
            limit(5)
          )
        );

        if (!cancelled) {
          const partners: Partner[] = snap.docs.map((doc) => ({
            id: doc.id,
            name: (doc.data() as any)?.name ?? (doc.data() as any)?.companyName ?? "",
            companyName: (doc.data() as any)?.companyName,
            photoUrl: (doc.data() as any)?.photoUrl,
            ratingAvg: (doc.data() as any)?.ratingAvg ?? 0,
            reviewCount: (doc.data() as any)?.reviewCount ?? 0,
          }));

          setRecommendedPartners(partners);

          // 추천 파트너 메타 정보 로드
          const entries = await Promise.all(
            partners.map(async (partner) => {
              try {
                const partnerSnap = await getDoc(doc(db, "partners", partner.id));
                if (!partnerSnap.exists()) {
                  return [
                    partner.id,
                    { name: partner.name || "", reviewCount: 0, ratingAvg: 0 },
                  ] as const;
                }

                const data = partnerSnap.data() as {
                  name?: string;
                  companyName?: string;
                  reviewCount?: number;
                  ratingAvg?: number;
                  trust?: { reviewCount?: number; reviewAvg?: number };
                };

                const name = data?.name ?? data?.companyName ?? "";
                const reviewCount = Number(data?.reviewCount ?? data?.trust?.reviewCount ?? 0);
                const ratingAvg = Number(data?.ratingAvg ?? data?.trust?.reviewAvg ?? 0);

                return [partner.id, { name, reviewCount, ratingAvg }] as const;
              } catch {
                return [partner.id, { name: "", reviewCount: 0, ratingAvg: 0 }] as const;
              }
            })
          );

          if (!cancelled) {
            const next: Record<string, PartnerMeta> = {};
            entries.forEach(([partnerId, meta]) => {
              next[partnerId] = meta;
            });
            setRecommendedPartnerMeta(next);
          }
        }
      } catch (err) {
        console.warn("[customer][chats] recommended partners load error", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestMeta?.serviceType]);

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
          ListHeaderComponent={
            recommendedPartners.length > 0 ? (
              <View style={styles.recommendedSection}>
                <Text style={styles.recommendedTitle}>추천 파트너</Text>
                <FlatList
                  data={recommendedPartners}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={Dimensions.get("window").width - spacing.lg * 2}
                  decelerationRate="fast"
                  scrollEventThrottle={16}
                  contentContainerStyle={styles.recommendedList}
                  renderItem={({ item }) => {
                    const meta = recommendedPartnerMeta[item.id];
                    const displayName = meta?.name || item.name || "-";

                    return (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={styles.recommendedCard}
                      >
                        <View style={styles.recommendedImageBox}>
                          {item.photoUrl ? (
                            <Image source={{ uri: item.photoUrl }} style={styles.recommendedImage} />
                          ) : (
                            <View style={styles.recommendedPlaceholder} />
                          )}
                        </View>
                        <Text style={styles.recommendedName} numberOfLines={1}>
                          {displayName}
                        </Text>
                        <Text style={styles.recommendedRating}>
                          평점 {(meta?.ratingAvg ?? item.ratingAvg ?? 0).toFixed(1)}
                        </Text>
                        <Text style={styles.recommendedReview}>
                          리뷰 {meta?.reviewCount ?? item.reviewCount ?? 0}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            ) : null
          }
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
            const subtitle =
              (item.lastMessageText && String(item.lastMessageText).trim()) || "대화를 시작해 보세요.";
            const reviewText = `리뷰 ${partnerMeta[item.partnerId ?? ""]?.reviewCount ?? 0}`;
            const ratingText = `평점 ${(partnerMeta[item.partnerId ?? ""]?.ratingAvg ?? 0).toFixed(1)}`;
            const detailText = [ratingText, reviewText, subtitle].filter(Boolean).join(" · ");
            const timeText = item.updatedAt ? formatTimestamp(item.updatedAt as never) : "";
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
                      {timeText ? <Text style={styles.time}>{timeText}</Text> : null}
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
