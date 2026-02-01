import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";

import { LABELS } from "@/src/constants/labels";
import { SERVICE_CATEGORIES } from "@/src/constants/serviceCategories";
import { SERVICE_REGIONS } from "@/src/constants/serviceRegions";
import { SERVICE_REGION_CITIES } from "@/src/constants/serviceRegionCities";
import { Screen } from "@/src/components/Screen";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { Card } from "@/src/ui/components/Card";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { db, storage } from "@/src/firebase";
import { colors, radius, spacing } from "@/src/ui/tokens";
import type { PartnerDoc } from "@/src/types/models";
import { useAuthUid } from "@/src/lib/useAuthUid";

type HomeBannerDoc = {
  title: string;
  imageUrl: string;
  type: "partner" | "external";
  target: "customer" | "partner" | "all";
  partnerId?: string | null;
  url?: string | null;
  active?: boolean;
  priority?: number;
  startsAt?: { toMillis?: () => number } | number | null;
  endsAt?: { toMillis?: () => number } | number | null;
};

type BannerItem = HomeBannerDoc & { id: string };
type PartnerItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  ratingAvg: number;
  reviewCount: number;
  serviceArea?: string;
};

type PartnerAdPlacementDoc = {
  partnerId: string;
  category: string;
  amount: number;
  region?: string | null;
  regionKey?: string | null;
  weekKey?: string | null;
  rank?: number;
  createdAt?: { toMillis?: () => number } | number | null;
};

const BANNER_HEIGHT = 170;
const BANNER_WIDTH = Dimensions.get("window").width - spacing.lg * 2;
const BANNER_GAP = spacing.sm;

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

function getWeekKey(base: Date) {
  const day = base.getDay(); // 0 Sun - 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const start = new Date(base);
  start.setDate(base.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const year = start.getFullYear();
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const date = String(start.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function deriveRegionKey(address?: string | null) {
  if (!address) return null;
  const normalized = address.replace(/[()]/g, " ").trim();
  if (!normalized) return null;
  const province = SERVICE_REGIONS.find((item) => normalized.includes(item)) ?? null;
  if (province && SERVICE_REGION_CITIES[province]) {
    const city = SERVICE_REGION_CITIES[province].find((item) => normalized.includes(item)) ?? null;
    return city ? `${province} ${city}` : null;
  }
  for (const [key, cities] of Object.entries(SERVICE_REGION_CITIES)) {
    const city = cities.find((item) => normalized.includes(item));
    if (city) return `${key} ${city}`;
  }
  return null;
}

function getServiceImage(service: string): number {
  const imageMap: Record<string, number> = {
    청소: require("@/assets/icons/청소.png"),
    이사: require("@/assets/icons/이사.png"),
    인테리어: require("@/assets/icons/인테리어.png"),
    "시공/설치": require("@/assets/icons/설치.png"),
  };
  return imageMap[service];
}

function getServiceColor(service: string): string {
  const colorMap: Record<string, string> = {
    청소: "#FF6B9D",
    이사: "#4ECDC4",
    인테리어: "#FFD93D",
    "시공/설치": "#6C5CE7",
  };
  return colorMap[service] || "#00C7AE";
}

type ImageDimensions = {
  width: number;
  height: number;
};

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

  const ratingAvg = Number(
    (data as any)?.ratingAvg ?? data.trust?.factors?.reviewAvg ?? (data.trust as any)?.reviewAvg ?? 0
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
    imageUrl: preferredImage ?? raw.photoUrl ?? raw.imageUrl ?? raw.logoUrl ?? null,
    ratingAvg,
    reviewCount,
    serviceArea: (data as any)?.serviceArea,
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const { uid } = useAuthUid();
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [bannerImages, setBannerImages] = useState<Record<string, string>>({});
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerListRef = useRef<FlatList<BannerItem>>(null);
  const [adCategory, setAdCategory] = useState<string>(SERVICE_CATEGORIES[0]);
  const [adPartners, setAdPartners] = useState<PartnerItem[]>([]);
  const [adLoading, setAdLoading] = useState(false);
  const [regionKey, setRegionKey] = useState<string | null>(null);
  const adListRef = useRef<FlatList<PartnerItem>>(null);
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});

  const bannerIds = useMemo(() => new Set(banners.map((item) => item.id)), [banners]);
  const adCardWidth = useMemo(
    () => (Dimensions.get("window").width - spacing.lg * 2 - spacing.md) / 2,
    []
  );

  useEffect(() => {
    let active = true;

    const loadBanners = async () => {
      setBannerLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, "homeBanners"),
            where("active", "==", true),
            where("target", "in", ["customer", "all"]),
            orderBy("priority", "desc"),
            limit(10)
          )
        );

        const now = Date.now();
        const loaded = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as HomeBannerDoc) }))
          .filter((banner) => {
            const start = toMillis(banner.startsAt);
            const end = toMillis(banner.endsAt);
            if (start && now < start) return false;
            if (end && now > end) return false;
            return Boolean(banner.imageUrl);
          })
          .slice(0, 2);

        if (active) setBanners(loaded);
      } catch (err) {
        console.error("[customer][home] banner load error", err);
      } finally {
        if (active) setBannerLoading(false);
      }
    };

    loadBanners();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!banners.length) return;
    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        banners.map(async (banner) => {
          if (!banner.imageUrl || isHttpUrl(banner.imageUrl)) {
            return [banner.id, banner.imageUrl] as const;
          }

          try {
            if (isGsUrl(banner.imageUrl) || !isHttpUrl(banner.imageUrl)) {
              const url = await getDownloadURL(ref(storage, banner.imageUrl));
              return [banner.id, url] as const;
            }
          } catch {
            return [banner.id, ""] as const;
          }

          return [banner.id, banner.imageUrl] as const;
        })
      );

      if (cancelled) return;
      setBannerImages((prev) => {
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
  }, [banners, bannerIds.size]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => {
      setBannerIndex((prev) => {
        const next = (prev + 1) % banners.length;
        bannerListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 5000);

    return () => clearInterval(id);
  }, [banners.length]);

  useEffect(() => {
    if (!uid) {
      setRegionKey(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "customerUsers", uid));
        if (!snap.exists()) return;
        const data = snap.data() as { addressDong?: string; addressRoad?: string };
        const next = deriveRegionKey(data.addressDong || data.addressRoad || "");
        if (active) setRegionKey(next);
      } catch (err) {
        console.warn("[customer][home] address load error", err);
      }
    })();
    return () => {
      active = false;
    };
  }, [uid]);

  useEffect(() => {
    let active = true;
    const weekKey = getWeekKey(new Date());

    const loadAds = async () => {
      setAdLoading(true);
      try {
        if (!regionKey) {
          if (active) setAdPartners([]);
          return;
        }
        let bidSnap;
        try {
          bidSnap = await getDocs(
            query(
              collection(db, "partnerAdPlacements"),
              where("category", "==", adCategory),
              where("weekKey", "==", weekKey),
              orderBy("rank", "asc"),
              limit(50)
            )
          );
        } catch (err) {
          console.warn("[customer][home] bid query fallback", err);
          bidSnap = await getDocs(
            query(
              collection(db, "partnerAdPlacements"),
              where("category", "==", adCategory),
              where("weekKey", "==", weekKey),
              limit(50)
            )
          );
        }

        const bids = bidSnap.docs.map((docSnap) => docSnap.data() as PartnerAdPlacementDoc);
        const filtered = bids.filter((bid) => {
          const key = bid.regionKey ?? bid.region ?? "";
          return key === regionKey;
        });
        const sorted = [...filtered].sort((a, b) => {
          const rankGap = Number(a.rank ?? 0) - Number(b.rank ?? 0);
          if (rankGap !== 0) return rankGap;
          const amountGap = Number(b.amount ?? 0) - Number(a.amount ?? 0);
          if (amountGap !== 0) return amountGap;
          const aTime = toMillis(a.createdAt) ?? 0;
          const bTime = toMillis(b.createdAt) ?? 0;
          return aTime - bTime;
        });

        const partnerIds: string[] = [];
        for (const bid of sorted) {
          if (!bid.partnerId) continue;
          if (partnerIds.includes(bid.partnerId)) continue;
          partnerIds.push(bid.partnerId);
          if (partnerIds.length >= 5) break;
        }

        if (!partnerIds.length) {
          if (active) setAdPartners([]);
          return;
        }

        const partnerSnap = await getDocs(
          query(collection(db, "partners"), where(documentId(), "in", partnerIds))
        );

        const partnerMap = new Map<string, PartnerItem>();
        partnerSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as PartnerDoc;
          if (data.isActive === false) return;
          partnerMap.set(docSnap.id, mapPartner(docSnap.id, data));
        });

        const ordered = partnerIds
          .map((id) => partnerMap.get(id))
          .filter(Boolean) as PartnerItem[];
        if (active) setAdPartners(ordered);
      } catch (err) {
        console.error("[customer][home] ads error", err);
        if (active) setAdPartners([]);
      } finally {
        if (active) setAdLoading(false);
      }
    };

    loadAds();
    return () => {
      active = false;
    };
  }, [adCategory, regionKey]);

  const handleBannerPress = (banner: BannerItem) => {
    if (banner.type === "partner" && banner.partnerId) {
      router.push({ pathname: "/partners/[id]", params: { id: banner.partnerId } } as any);
      return;
    }
    if (banner.type === "external" && banner.url) {
      Linking.openURL(banner.url).catch((err) => {
        console.warn("[customer][home] banner url error", err);
      });
    }
  };

  const handleImageLoad = (service: string, event: any) => {
    const { width, height } = event.nativeEvent.source;
    setImageDimensions((prev) => ({
      ...prev,
      [service]: { width, height },
    }));
  };

  return (
    <Screen scroll style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.headerTitle}>{LABELS.headers.home}</Text>
          <Text style={styles.headerSubtitle}>원하는 서비스를 빠르게 찾아보세요.</Text>
        </View>
        <View style={styles.headerActions}>
          {uid ? (
            <>
              <NotificationBell href="/notifications" />
              <TouchableOpacity
                onPress={() => router.push("/profile")}
                style={styles.iconBtn}
              >
                <FontAwesome name="user" size={18} color={colors.text} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/login", params: { force: "1" } })}
              style={styles.loginBtn}
            >
              <Text style={styles.loginBtnText}>로그인</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Card style={styles.heroCard}>
        <View style={styles.heroHeaderRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>빠른 견적</Text>
            <Text style={styles.heroTitle}>맞춤 견적을 바로 받아보세요.</Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>무료</Text>
          </View>
        </View>
        <Text style={styles.heroDesc}>
          요청을 등록하면 검증된 파트너가 견적을 보내드립니다.
        </Text>
        <PrimaryButton
          label={LABELS.actions.newRequest}
          onPress={() => {
            if (!uid) {
              router.push({ pathname: "/login", params: { force: "1" } });
              return;
            }
            router.push("/(customer)/requests/new-chat");
          }}
        />
      </Card>

      <View style={styles.serviceIconsSection}>
        <View style={styles.serviceIconsGrid}>
          {SERVICE_CATEGORIES.map((service) => {
            const serviceImage = getServiceImage(service);
            const imageStyle = {
              width: 144,
              height: 144,
              resizeMode: "contain" as const,
            };
            return (
              <TouchableOpacity
                key={service}
                style={styles.serviceIconButton}
                activeOpacity={0.7}
                onPress={() => {
                  if (!uid) {
                    router.push({ pathname: "/login", params: { force: "1" } });
                    return;
                  }
                  router.push({
                    pathname: "/(customer)/requests/new-chat",
                    params: { serviceType: service },
                  });
                }}
              >
                <Image
                  source={serviceImage}
                  style={[imageStyle, service === "이사" && { marginLeft: -8 }]}
                  onLoad={(event) => handleImageLoad(service, event)}
                />
                <Text style={styles.serviceIconLabel}>{service}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>추천 배너</Text>
      </View>

      <View style={styles.bannerSection}>
        {bannerLoading ? (
          <View style={styles.bannerSkeleton} />
        ) : banners.length ? (
          <>
            <FlatList
              ref={bannerListRef}
              data={banners}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.bannerList}
              snapToInterval={BANNER_WIDTH + BANNER_GAP}
              decelerationRate="fast"
              onMomentumScrollEnd={(event) => {
                const offsetX = event.nativeEvent.contentOffset.x;
                const nextIndex = Math.round(offsetX / (BANNER_WIDTH + BANNER_GAP));
                setBannerIndex(Math.min(Math.max(nextIndex, 0), banners.length - 1));
              }}
              renderItem={({ item }) => {
                const image = bannerImages[item.id] ?? item.imageUrl;
                return (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => handleBannerPress(item)}
                  >
                    <Card style={styles.bannerCard}>
                      {image ? (
                        <Image source={{ uri: image }} style={styles.bannerImage} />
                      ) : (
                        <View style={styles.bannerFallback} />
                      )}
                      <View style={styles.bannerOverlay}>
                        <Text style={styles.bannerTitle}>{item.title}</Text>
                      </View>
                    </Card>
                  </TouchableOpacity>
                );
              }}
            />
            {banners.length > 1 && (
              <View style={styles.bannerDots}>
                {banners.map((banner, idx) => (
                  <View
                    key={banner.id}
                    style={[
                      styles.bannerDot,
                      idx === bannerIndex && styles.bannerDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <Text style={styles.emptyHint}>현재 광고 배너가 없습니다.</Text>
        )}
      </View>

      <View style={styles.adSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>추천 파트너</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {SERVICE_CATEGORIES.map((item) => {
            const active = item === adCategory;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => {
                  setAdCategory(item);
                  adListRef.current?.scrollToOffset({ offset: 0, animated: false });
                }}
              >
                <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {adLoading ? (
          <View style={styles.adLoading}>
            <Text style={styles.emptyHint}>추천 파트너를 불러오는 중...</Text>
          </View>
        ) : adPartners.length ? (
          <FlatList
            ref={adListRef}
            horizontal
            data={adPartners}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recommendList}
            renderItem={({ item }) => (
              <View style={[styles.recommendItem, { width: adCardWidth }]}>
                <Card style={[styles.partnerCard, styles.partnerCardGrid]}>
                  <View style={styles.cardImageWrap}>
                    {isHttpUrl(item.imageUrl) ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
                    ) : (
                      <View style={styles.cardImagePlaceholder} />
                    )}
                    <View style={styles.adBadge}>
                      <Text style={styles.adBadgeText}>추천업체</Text>
                    </View>
                  </View>
                  <Text style={styles.partnerName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.ratingRow}>
                    <FontAwesome name="star" size={12} color="#F5B301" />
                    <Text style={styles.partnerMeta}>
                      평점 {item.ratingAvg.toFixed(1)} · 리뷰 {item.reviewCount}
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
              </View>
            )}
          />
        ) : (
          <Text style={styles.adEmptyHint}>현재 추천 파트너가 없습니다.</Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2ED" },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
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
  loginBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  loginBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  heroCopy: { flex: 1, gap: 6 },
  heroEyebrow: { fontSize: 12, fontWeight: "700", color: colors.subtext },
  heroTitle: { fontSize: 20, fontWeight: "800", color: colors.text, lineHeight: 26 },
  heroDesc: { color: colors.subtext, fontSize: 13 },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.08)",
  },
  heroBadgeText: { fontSize: 11, fontWeight: "800", color: colors.text },
  serviceIconsSection: {
    gap: 0,
    marginTop: -45,
  },
  serviceIconsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  serviceIconButton: {
    flex: 1,
    alignItems: "center",
    gap: 0,
  },
  serviceIconImage: {
    width: 144,
    height: 144,
    resizeMode: "contain",
  },
  serviceIconLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    marginTop: -48,
  },
  sectionHeader: { marginTop: spacing.xs },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  bannerSection: { gap: spacing.sm },
  bannerList: { gap: BANNER_GAP },
  bannerCard: {
    padding: 0,
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    overflow: "hidden",
    borderRadius: 16,
  },
  bannerImage: { width: "100%", height: "100%" },
  bannerFallback: { width: "100%", height: "100%", backgroundColor: colors.border },
  bannerOverlay: {
    position: "absolute",
    left: 16,
    bottom: 14,
    right: 16,
  },
  bannerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  bannerSkeleton: {
    height: BANNER_HEIGHT,
    borderRadius: radius.lg,
    backgroundColor: colors.border,
  },
  bannerDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
  },
  bannerDotActive: {
    backgroundColor: "#111827",
  },
  emptyHint: { color: colors.subtext, fontSize: 12 },
  adSection: { gap: spacing.sm },
  adEmptyHint: { color: colors.subtext, fontSize: 12 },
  categoryRow: { gap: spacing.xs, alignItems: "center" },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#FFF7F1",
    borderWidth: 1,
    borderColor: "#F2E6DB",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  categoryChipTextActive: { color: "#FFFFFF" },
  adLoading: { paddingVertical: spacing.sm },
  recommendList: { gap: spacing.md },
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
  partnerName: { fontWeight: "800", color: colors.text, fontSize: 15 },
  partnerMeta: { color: colors.subtext, fontSize: 11 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.xs },
  primaryBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 11 },
});

