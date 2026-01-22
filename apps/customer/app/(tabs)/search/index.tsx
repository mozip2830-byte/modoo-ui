import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import type { PartnerDoc } from "@/src/types/models";
import { getCache, setCache } from "@/src/lib/memoryCache";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, radius, spacing } from "@/src/ui/tokens";

// ??? 濡?源⑥쭊 ?띿뒪?몃쭔 蹂듦뎄
const TAGS = ["입주청소", "이사청소", "거주청소", "사이청소", "곰팡이", "스팀/찌든때"];
const SORTS = [
  { key: "reviews", label: "리뷰 많은순" },
  { key: "rating", label: "평점 높은순" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

const PAGE_SIZE = 7;
const AD_SIZE = 5;

type PartnerItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  ratingAvg: number;
  reviewCount: number;
  trustScore: number;
  approvedStatus?: string;
  serviceArea?: string;
};

type PartnerAdDoc = {
  partnerId: string;
  active?: boolean;
  priority?: number;
  startsAt?: { toMillis?: () => number } | number | null;
  endsAt?: { toMillis?: () => number } | number | null;
};

function isHttpUrl(value?: string | null) {
  return Boolean(value && (value.startsWith("http://") || value.startsWith("https://")));
}

function toMillis(value?: { toMillis?: () => number } | number | null) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (value.toMillis) return value.toMillis();
  return null;
}

function mapPartner(docId: string, data: PartnerDoc): PartnerItem {
  const raw = data as PartnerDoc & {
    photoUrl?: string | null;
    imageUrl?: string | null;
    logoUrl?: string | null;
  };
  const images = (data as any)?.profileImages ?? [];
  const candidates = [...images, raw.photoUrl, raw.imageUrl, raw.logoUrl].filter(Boolean);
  const preferredImage =
    candidates.find((value) => isHttpUrl(value as string)) ?? candidates[0] ?? null;
  const fallbackImage = raw.photoUrl ?? raw.imageUrl ?? raw.logoUrl ?? null;
  const trustScore = (data as any)?.trustScore ?? (data as any)?.trust?.score ?? 0;

  const ratingAvg = Number(
    (data as any)?.ratingAvg ??
      data.trust?.factors?.reviewAvg ??
      (data.trust as any)?.reviewAvg ??
      0
  );
  const reviewCount = Number(
    (data as any)?.reviewCount ??
      data.trust?.factors?.reviewCount ??
      (data.trust as any)?.reviewCount ??
      0
  );

  return {
    id: docId,
    name: (data as any)?.name ?? "파트너명 미등록",
    imageUrl: preferredImage ?? fallbackImage,
    ratingAvg,
    reviewCount,
    trustScore: Number(trustScore),
    approvedStatus: (data as any)?.approvedStatus,
    serviceArea: (data as any)?.serviceArea,
  };
}

export default function CustomerSearchScreen() {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("trust");
  const [sortOpen, setSortOpen] = useState(false);

  const [ads, setAds] = useState<PartnerItem[]>([]);
  const [items, setItems] = useState<PartnerItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<unknown | null>(null);
  const loadingRef = useRef(false);
  const itemsRef = useRef<PartnerItem[]>([]);

  const adIds = useMemo(() => new Set(ads.map((item) => item.id)), [ads]);
  const partnerIds = useMemo(
    () => Array.from(new Set([...ads, ...items].map((item) => item.id))),
    [ads, items]
  );
  const partnerIdKey = useMemo(() => partnerIds.join("|"), [partnerIds]);
  const carouselCardWidth = useMemo(
    () => (Dimensions.get("window").width - spacing.lg * 2 - spacing.md) / 2,
    []
  );
  const cacheKey = useMemo(() => `search:list:${searchText}:${sortKey}`, [searchText, sortKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchText(queryInput.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    let active = true;

    const loadAds = async () => {
      setAdLoading(true);
      try {
        const adSnap = await getDocs(
          query(
            collection(db, "partnerAds"),
            where("active", "==", true),
            orderBy("priority", "desc"),
            limit(10)
          )
        );

        const now = Date.now();
        const rawAds = adSnap.docs.map((docSnap) => docSnap.data() as PartnerAdDoc);

        const validAds = rawAds.filter((ad) => {
          const start = toMillis(ad.startsAt);
          const end = toMillis(ad.endsAt);
          if (start && now < start) return false;
          if (end && now > end) return false;
          return Boolean(ad.partnerId);
        });

        const ids = Array.from(new Set(validAds.map((ad) => ad.partnerId))).slice(0, AD_SIZE);

        if (!ids.length) {
          if (active) setAds([]);
          return;
        }

        const partnerSnap = await getDocs(
          query(collection(db, "partners"), where(documentId(), "in", ids))
        );

        const partnerMap = new Map<string, PartnerItem>();
        partnerSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as PartnerDoc;
          if (data.isActive === false) return;
          partnerMap.set(docSnap.id, mapPartner(docSnap.id, data));
        });

        const ordered = ids.map((id) => partnerMap.get(id)).filter(Boolean) as PartnerItem[];
        if (active) setAds(ordered.slice(0, AD_SIZE));
      } catch (err) {
        console.error("[customer][search] ads error", err);
      } finally {
        if (active) setAdLoading(false);
      }
    };

    loadAds();
    return () => {
      active = false;
    };
  }, []);

  const sortItemsClient = (data: PartnerItem[]) => {
    if (sortKey === "reviews") {
      return [...data].sort((a, b) => b.reviewCount - a.reviewCount);
    }
    if (sortKey === "rating") {
      return [...data].sort((a, b) => b.ratingAvg - a.ratingAvg || b.reviewCount - a.reviewCount);
    }
    return [...data].sort((a, b) => b.trustScore - a.trustScore);
  };

  const buildQuery = (after?: unknown | null) => {
    const constraints: QueryConstraint[] = [];
    if (searchText) {
      const end = `${searchText}\uf8ff`;
      constraints.push(where("nameLower", ">=", searchText));
      constraints.push(where("nameLower", "<=", end));
      constraints.push(orderBy("nameLower", "asc"));
    } else {
      constraints.push(orderBy(documentId()));
    }
    if (after) {
      constraints.push(startAfter(after));
    }
    constraints.push(limit(PAGE_SIZE));
    return query(collection(db, "partners"), ...constraints);
  };

  const loadPage = async (reset: boolean) => {
    if (loadingRef.current) return;
    if (!hasMore && !reset) return;
    loadingRef.current = true;
    reset ? setLoading(true) : setLoadingMore(true);
    setError(null);

    try {
      const nextItems: PartnerItem[] = [];
      let lastDoc = reset ? null : lastDocRef.current;
      let reachedEnd = false;

      while (nextItems.length < PAGE_SIZE && !reachedEnd) {
        const snap = await getDocs(buildQuery(lastDoc));
        if (snap.empty) {
          reachedEnd = true;
          break;
        }
        lastDoc = snap.docs[snap.docs.length - 1];
        const batch = snap.docs
          .filter((docSnap) => (docSnap.data() as PartnerDoc).isActive !== false)
          .map((docSnap) => mapPartner(docSnap.id, docSnap.data() as PartnerDoc))
          .filter((item) => !adIds.has(item.id));
        nextItems.push(...batch);
        if (snap.size < PAGE_SIZE) {
          reachedEnd = true;
          break;
        }
      }

      lastDocRef.current = lastDoc;
      const merged = reset ? nextItems : [...itemsRef.current, ...nextItems];
      const finalItems = sortItemsClient(merged);
      setItems(finalItems);
      setHasMore(!reachedEnd);
    } catch (err) {
      console.error("[customer][search] load error", err);
      setError("파트너 목록을 불러오지 못했습니다.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const cached = getCache<{ items: PartnerItem[]; ads: PartnerItem[] }>(cacheKey);
    if (cached) {
      setItems(cached.items);
      setAds(cached.ads);
    }
  }, [cacheKey]);

  useEffect(() => {
    setCache(cacheKey, { items, ads });
  }, [cacheKey, items, ads]);

  useEffect(() => {
    setItems([]);
    setHasMore(true);
    lastDocRef.current = null;
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, sortKey, adIds.size]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!partnerIds.length) return;

    let active = true;
    const unsubs = partnerIds.map((id) =>
      onSnapshot(
        doc(db, "partners", id),
        (snap) => {
          if (!active || !snap.exists()) return;
          const next = mapPartner(snap.id, snap.data() as PartnerDoc);
          setAds((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
          setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
        },
        (err) => {
          console.warn("[customer][search] partner snapshot error", err);
        }
      )
    );

    return () => {
      active = false;
      unsubs.forEach((unsub) => unsub());
    };
  }, [partnerIdKey]);

  const renderPartnerCard = (
    item: PartnerItem,
    showAd: boolean,
    variant: "list" | "grid" | "carousel" = "grid"
  ) => {
    const imageUri = item.imageUrl as string | undefined;
    const ratingAvg = item.ratingAvg;
    const reviewCount = item.reviewCount;
    if (variant !== "list") {
      return (
        <Card style={[styles.partnerCard, styles.partnerCardGrid]}>
          <View style={styles.cardImageWrap}>
            {isHttpUrl(imageUri) ? (
              <Image source={{ uri: imageUri }} style={styles.cardImage} />
            ) : (
              <View style={styles.cardImagePlaceholder} />
            )}
            {showAd ? (
              <View style={styles.adBadge}>
                <Text style={styles.adBadgeText}>광고</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.partnerName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.ratingRow}>
            <FontAwesome name="star" size={12} color="#F5B301" />
            <Text style={styles.partnerMeta}>
              평점 {ratingAvg.toFixed(1)} · 리뷰 {reviewCount}
            </Text>
          </View>
          {item.serviceArea ? (
            <Text style={styles.partnerMeta} numberOfLines={1}>
              {item.serviceArea}
            </Text>
          ) : null}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() =>
                router.push({ pathname: "/partners/[id]", params: { id: item.id } } as any)
              }
            >
              <Text style={styles.primaryBtnText}>프로필 보기</Text>
            </TouchableOpacity>
          </View>
        </Card>
      );
    }

    return (
      <Card style={styles.partnerCard}>
        <View style={styles.partnerHeader}>
          <View style={styles.partnerLeft}>
            <View style={styles.avatar}>
              {isHttpUrl(imageUri) ? (
                <Image source={{ uri: imageUri }} style={styles.image} />
              ) : (
                <View style={styles.imagePlaceholder} />
              )}
            </View>

            <View style={styles.partnerInfo}>
              <Text style={styles.partnerName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.ratingRow}>
                <FontAwesome name="star" size={12} color="#F5B301" />
                <Text style={styles.partnerMeta}>
                  평점 {ratingAvg.toFixed(1)} · 리뷰 {reviewCount}
                </Text>
              </View>
              {item.serviceArea ? (
                <Text style={styles.partnerMeta} numberOfLines={1}>
                  {item.serviceArea}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.partnerRight}>
            {showAd ? <Chip label="광고" tone="warning" /> : null}
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() =>
              router.push({ pathname: "/partners/[id]", params: { id: item.id } } as any)
            }
          >
            <Text style={styles.primaryBtnText}>프로필 보기</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  return (
    <Screen scroll={false} style={styles.container}>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerArea}>
            <View style={styles.headerTop}>
              <Text style={styles.headerTitle}>파트너 찾기</Text>
              <Text style={styles.headerSubtitle}>평점과 리뷰로 빠르게 비교하세요.</Text>
            </View>

            <View style={styles.searchBar}>
              <FontAwesome name="search" size={14} color={colors.subtext} />
              <TextInput
                placeholder="파트너명/지역 검색"
                style={styles.input}
                value={queryInput}
                onChangeText={setQueryInput}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tagRow}
            >
              {TAGS.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>추천 파트너</Text>
              {adLoading ? <ActivityIndicator size="small" /> : null}
            </View>
            {ads.length ? (
              <View style={styles.recommendWrap}>
                <FlatList
                  data={ads}
                  horizontal
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recommendList}
                  renderItem={({ item }) => (
                    <View style={[styles.recommendItem, { width: carouselCardWidth }]}>
                      {renderPartnerCard(item, true, "carousel")}
                    </View>
                  )}
                />
              </View>
            ) : (
              <Text style={styles.emptyHint}>현재 추천 파트너가 없습니다.</Text>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>전체 파트너</Text>
              <TouchableOpacity
                style={styles.sortDropdown}
                onPress={() => setSortOpen((prev) => !prev)}
              >
                <Text style={styles.sortDropdownText}>
                  {SORTS.find((option) => option.key === sortKey)?.label ?? "정렬"}
                </Text>
                <Text style={styles.sortDropdownIcon}>{sortOpen ? "▲" : "▼"}</Text>
              </TouchableOpacity>
            </View>

            {sortOpen ? (
              <View style={styles.sortPanel}>
                {SORTS.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.sortOption, sortKey === option.key && styles.sortOptionActive]}
                    onPress={() => {
                      setSortKey(option.key);
                      setSortOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortKey === option.key && styles.sortOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => renderPartnerCard(item, false, "list")}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator />
              <Text style={styles.muted}>불러오는 중...</Text>
            </View>
          ) : error ? (
            <EmptyState title={error} />
          ) : (
            <EmptyState
              title="검색 결과가 없습니다."
              description="다른 키워드로 다시 검색해보세요."
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator />
            </View>
          ) : null
        }
        onEndReached={() => loadPage(false)}
        onEndReachedThreshold={0.6}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2ED" },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerArea: { gap: spacing.md },
  headerTop: { gap: 4 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  headerSubtitle: { color: colors.subtext, fontSize: 12 },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#F7F4F0",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8E0D6",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 14, color: colors.text },

  tagRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFF7F1",
    borderWidth: 1,
    borderColor: "#F2E6DB",
  },
  tagText: { color: colors.text, fontWeight: "600", fontSize: 12 },

  sortDropdown: {
    borderWidth: 1,
    borderColor: "#E8E0D6",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sortDropdownText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  sortDropdownIcon: { color: colors.subtext, fontSize: 10 },

  sortPanel: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: "#E8E0D6",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  sortOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#FFFFFF",
  },
  sortOptionActive: { backgroundColor: colors.primary },
  sortOptionText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  sortOptionTextActive: { color: "#FFFFFF" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },

  recommendWrap: { marginHorizontal: -spacing.lg },
  recommendList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  recommendItem: {},

  partnerCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  partnerCardGrid: { padding: spacing.sm },
  cardImageWrap: {
    height: 120,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
  cardImage: { width: "100%", height: "100%", resizeMode: "cover" },
  cardImagePlaceholder: { width: "100%", height: "100%", backgroundColor: colors.border },
  adBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.8)",
  },
  adBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },

  partnerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  partnerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  partnerRight: { alignItems: "flex-end", gap: spacing.xs },

  partnerName: { fontWeight: "800", color: colors.text, fontSize: 15 },
  partnerMeta: { color: colors.subtext, fontSize: 11 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },

  avatar: { width: 56, height: 56, borderRadius: 16, overflow: "hidden" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  imagePlaceholder: { width: "100%", height: "100%", backgroundColor: colors.border },
  partnerInfo: { flex: 1 },

  cardActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.xs },
  primaryBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 11 },

  emptyHint: { color: colors.subtext, fontSize: 12 },
  loadingBox: { paddingVertical: spacing.lg, alignItems: "center", gap: spacing.sm },
  muted: { color: colors.subtext, fontSize: 12 },
  loadingMore: { paddingVertical: spacing.md, alignItems: "center" },
});

