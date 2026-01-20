import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db, storage } from "@/src/firebase";
import type { PartnerDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, radius, spacing } from "@/src/ui/tokens";

// ✅ ? 로 깨진 텍스트만 복구
const TAGS = ["입주청소", "이사청소", "거주청소", "사이청소", "곰팡이", "스티커 제거"];
const SORTS = [
  { key: "trust", label: "신뢰도순" },
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

function isGsUrl(value?: string | null) {
  return Boolean(value && value.startsWith("gs://"));
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

  return {
    id: docId,
    name: (data as any)?.name ?? "파트너명 미등록",
    imageUrl: preferredImage ?? fallbackImage,
    ratingAvg: Number((data as any)?.ratingAvg ?? 0),
    reviewCount: Number((data as any)?.reviewCount ?? 0),
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
  const [photoMap, setPhotoMap] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<unknown | null>(null);
  const loadingRef = useRef(false);
  const itemsRef = useRef<PartnerItem[]>([]);
  const photoLoadingRef = useRef(new Set<string>());

  const adIds = useMemo(() => new Set(ads.map((item) => item.id)), [ads]);

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
          partnerMap.set(docSnap.id, mapPartner(docSnap.id, docSnap.data() as PartnerDoc));
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
    const constraints: QueryConstraint[] = [where("isActive", "==", true)];
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
    const combined = [...ads, ...items];
    const targets = combined.filter(
      (item) =>
        !isHttpUrl(item.imageUrl) &&
        !photoMap[item.id] &&
        !photoLoadingRef.current.has(item.id)
    );
    if (!targets.length) return;

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        targets.map(async (item) => {
          photoLoadingRef.current.add(item.id);
          try {
            if (isGsUrl(item.imageUrl)) {
              const url = await getDownloadURL(ref(storage, item.imageUrl as string));
              return [item.id, url] as const;
            }

            if (item.imageUrl && !isHttpUrl(item.imageUrl)) {
              const url = await getDownloadURL(ref(storage, item.imageUrl as string));
              return [item.id, url] as const;
            }

            const photoSnap = await getDocs(
              query(collection(db, "partners", item.id, "photos"), limit(1))
            );
            const photoDoc = photoSnap.docs[0]?.data() as
              | {
                  thumbUrl?: string;
                  url?: string;
                  downloadUrl?: string;
                  photoUrl?: string;
                  thumbPath?: string;
                  storagePath?: string;
                }
              | undefined;

            const directUrl =
              photoDoc?.thumbUrl ??
              photoDoc?.url ??
              photoDoc?.downloadUrl ??
              photoDoc?.photoUrl ??
              null;

            if (directUrl) return [item.id, directUrl] as const;

            const path = photoDoc?.thumbPath ?? photoDoc?.storagePath ?? null;
            if (path) {
              const url = await getDownloadURL(ref(storage, path));
              return [item.id, url] as const;
            }

            return [item.id, null] as const;
          } catch {
            return [item.id, null] as const;
          }
        })
      );

      if (cancelled) return;

      setPhotoMap((prev) => {
        const next = { ...prev };
        entries.forEach(([id, url]) => {
          if (url) next[id] = url;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [items, ads, photoMap]);

  const renderPartnerCard = (item: PartnerItem, showAd: boolean) => (
    <Card style={styles.partnerCard}>
      <CardRow>
        <View style={styles.partnerLeft}>
          <View style={styles.avatar}>
            {isHttpUrl(item.imageUrl) || photoMap[item.id] ? (
              <Image
                source={{ uri: photoMap[item.id] ?? (item.imageUrl as string) }}
                style={styles.image}
              />
            ) : (
              <View style={styles.imagePlaceholder} />
            )}
          </View>

          <View style={styles.partnerInfo}>
            <Text style={styles.partnerName}>{item.name}</Text>
            <Text style={styles.partnerMeta}>
              평점 {item.ratingAvg.toFixed(1)} · 리뷰 {item.reviewCount}
            </Text>
            {item.serviceArea ? (
              <Text style={styles.partnerMeta}>{item.serviceArea}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.partnerRight}>
          {showAd ? <Chip label="광고" tone="warning" /> : null}
        </View>
      </CardRow>

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

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title={LABELS.headers.search}
        subtitle="원하는 파트너를 검색해보세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/notifications" />
            <TouchableOpacity onPress={() => router.push("/login")} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerArea}>
            <Card style={styles.searchCard}>
              <View style={styles.searchRow}>
                <FontAwesome name="search" size={16} color={colors.subtext} />
                <TextInput
                  placeholder="파트너명/지역 검색"
                  style={styles.input}
                  value={queryInput}
                  onChangeText={setQueryInput}
                />
              </View>
              <View style={styles.tagRow}>
                {TAGS.map((tag) => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>추천 파트너</Text>
              {adLoading ? <ActivityIndicator size="small" /> : null}
            </View>
            {ads.length ? (
              <View style={styles.recommendList}>
                {ads.map((item) => (
                  <View key={item.id}>{renderPartnerCard(item, true)}</View>
                ))}
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
        renderItem={({ item }) => renderPartnerCard(item, false)}
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
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: 6 },
  headerArea: { gap: spacing.md },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  searchCard: { gap: spacing.sm },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  input: { flex: 1, fontSize: 13, color: colors.text },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.chipBg,
  },
  tagText: { color: colors.primary, fontWeight: "600", fontSize: 12 },

  sortDropdown: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sortDropdownText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  sortDropdownIcon: { color: colors.subtext, fontSize: 10 },

  sortPanel: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  sortOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  sortOptionActive: { backgroundColor: colors.primary },
  sortOptionText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  sortOptionTextActive: { color: "#FFFFFF" },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  adList: { paddingBottom: spacing.sm, gap: spacing.md },
  recommendList: { gap: spacing.md },

  partnerCard: { gap: spacing.xs, paddingVertical: 6 },
  partnerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  partnerRight: { alignItems: "flex-end", gap: spacing.xs },

  partnerName: { fontWeight: "700", color: colors.text },
  partnerMeta: { color: colors.subtext, fontSize: 11, marginTop: 1 },

  avatar: { width: 52, height: 52, borderRadius: 26, overflow: "hidden" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  imagePlaceholder: { width: "100%", height: "100%", backgroundColor: colors.border },
  partnerInfo: { flex: 1 },

  cardActions: { flexDirection: "row", justifyContent: "flex-end" },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.md,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 11 },

  emptyHint: { color: colors.subtext, fontSize: 12 },
  loadingBox: { paddingVertical: spacing.lg, alignItems: "center", gap: spacing.sm },
  muted: { color: colors.subtext, fontSize: 12 },
  loadingMore: { paddingVertical: spacing.md, alignItems: "center" },
});
