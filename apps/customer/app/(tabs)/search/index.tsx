import FontAwesome from "@expo/vector-icons/FontAwesome";
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
} from "firebase/firestore";

import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, radius, spacing } from "@/src/ui/tokens";
import { db } from "@/src/firebase";
import type { PartnerDoc } from "@/src/types/models";

const TAGS = ["인테리어", "청소", "리모델링", "이사", "전기", "조명"];
const SORTS = [
  { key: "trust", label: "신뢰도순" },
  { key: "reviews", label: "리뷰 많은순" },
  { key: "rating", label: "평점순" },
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

function toMillis(value?: { toMillis?: () => number } | number | null) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (value.toMillis) return value.toMillis();
  return null;
}

function mapPartner(docId: string, data: PartnerDoc): PartnerItem {
  const images = data.profileImages ?? [];
  const trustScore = data.trustScore ?? data.trust?.score ?? 0;
  return {
    id: docId,
    name: data.name ?? "업체명 미등록",
    imageUrl: images[0] ?? null,
    ratingAvg: Number(data.ratingAvg ?? 0),
    reviewCount: Number(data.reviewCount ?? 0),
    trustScore: Number(trustScore),
    approvedStatus: data.approvedStatus,
    serviceArea: data.serviceArea,
  };
}

export default function CustomerSearchScreen() {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("trust");
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
          query(collection(db, "partnerAds"), where("active", "==", true), orderBy("priority", "desc"), limit(10))
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
    const constraints = [where("isActive", "==", true)];
    if (searchText) {
      const end = `${searchText}\uf8ff`;
      constraints.push(where("nameLower", ">=", searchText));
      constraints.push(where("nameLower", "<=", end));
      constraints.push(orderBy("nameLower", "asc"));
    } else if (sortKey === "reviews") {
      constraints.push(orderBy("reviewCount", "desc"));
    } else if (sortKey === "rating") {
      constraints.push(orderBy("ratingAvg", "desc"));
      constraints.push(orderBy("reviewCount", "desc"));
    } else {
      constraints.push(orderBy("trustScore", "desc"));
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
      const finalItems = searchText ? sortItemsClient(merged) : merged;
      setItems(finalItems);
      setHasMore(!reachedEnd);
    } catch (err) {
      console.error("[customer][search] load error", err);
      setError("업체를 불러오지 못했습니다.");
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

  const renderPartnerCard = (item: PartnerItem, showAd: boolean) => (
    <Card style={styles.partnerCard}>
      <CardRow>
          <View style={styles.partnerLeft}>
            <View style={styles.avatar}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.image} />
              ) : (
                <View style={styles.imagePlaceholder} />
              )}
            </View>
          <View style={styles.partnerInfo}>
            <Text style={styles.partnerName}>{item.name}</Text>
            <Text style={styles.partnerMeta}>
              평점 {item.ratingAvg.toFixed(1)} · 리뷰 {item.reviewCount}
            </Text>
            <Text style={styles.partnerMeta}>
              신뢰도 {item.trustScore}점 {item.serviceArea ? `· ${item.serviceArea}` : ""}
            </Text>
          </View>
        </View>
        <View style={styles.partnerRight}>
          {showAd ? <Chip label="광고" tone="warning" /> : null}
          <Text style={styles.partnerTier}>{item.approvedStatus ?? "준회원"}</Text>
        </View>
      </CardRow>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>프로필 보기</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <AppHeader
        title={LABELS.headers.search}
        subtitle="업체를 검색하고 비교해보세요."
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
                  placeholder="업체/서비스를 검색하세요"
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

            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>정렬</Text>
              <View style={styles.sortChips}>
                {SORTS.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.sortChip,
                      sortKey === option.key && styles.sortChipActive,
                    ]}
                    onPress={() => setSortKey(option.key)}
                  >
                    <Text
                      style={[
                        styles.sortText,
                        sortKey === option.key && styles.sortTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>광고</Text>
              {adLoading ? <ActivityIndicator size="small" /> : null}
            </View>
            {ads.length ? (
              <FlatList
                data={ads}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.adList}
                renderItem={({ item }) => (
                  <View style={styles.adCardWrap}>{renderPartnerCard(item, true)}</View>
                )}
              />
            ) : (
              <Text style={styles.emptyHint}>표시할 광고 업체가 없습니다.</Text>
            )}

            <Text style={styles.sectionTitle}>일반 업체</Text>
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
            <EmptyState title="검색 결과가 없습니다." description="다른 검색어로 다시 시도해보세요." />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
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
  sortRow: { gap: spacing.xs },
  sortLabel: { fontWeight: "700", color: colors.text },
  sortChips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  sortChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  sortChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  sortText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  sortTextActive: { color: "#FFFFFF" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  adList: { paddingBottom: spacing.sm, gap: spacing.md },
  adCardWrap: { width: 280, marginRight: spacing.md },
  partnerCard: { gap: spacing.sm },
  partnerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  partnerRight: { alignItems: "flex-end", gap: spacing.xs },
  partnerName: { fontWeight: "700", color: colors.text },
  partnerMeta: { color: colors.subtext, fontSize: 12, marginTop: spacing.xs },
  partnerTier: { color: colors.subtext, fontSize: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { width: "100%", height: "100%", backgroundColor: colors.border },
  partnerInfo: { flex: 1 },
  cardActions: { flexDirection: "row", justifyContent: "flex-end" },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  emptyHint: { color: colors.subtext, fontSize: 12 },
  loadingBox: { paddingVertical: spacing.lg, alignItems: "center", gap: spacing.sm },
  muted: { color: colors.subtext, fontSize: 12 },
  loadingMore: { paddingVertical: spacing.md, alignItems: "center" },
});
