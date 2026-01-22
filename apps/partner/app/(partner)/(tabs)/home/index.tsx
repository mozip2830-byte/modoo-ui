import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db, storage } from "@/src/firebase";
import { useAuthedQueryGuard } from "@/src/lib/useAuthedQueryGuard";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, radius, spacing } from "@/src/ui/tokens";

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

export default function PartnerHomeScreen() {
  const router = useRouter();
  const { enabled, uid } = useAuthedQueryGuard();
  const target = uid ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  const [openRequestCount, setOpenRequestCount] = useState<number | null>(null);
  const [sentQuoteCount, setSentQuoteCount] = useState<number | null>(null);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [bannerImages, setBannerImages] = useState<Record<string, string>>({});
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerListRef = useRef<FlatList<BannerItem>>(null);

  const bannerIds = useMemo(() => new Set(banners.map((item) => item.id)), [banners]);

  useEffect(() => {
    if (!enabled || !uid) {
      setOpenRequestCount(null);
      return;
    }

    const rq = query(
      collection(db, "requests"),
      where("status", "==", "open"),
      where("isClosed", "==", false)
    );

    const unsub = onSnapshot(
      rq,
      (snap) => setOpenRequestCount(snap.size),
      (err: any) => {
        if (err?.code === "permission-denied") return;
        console.error("[home] open requests count error", err);
        setOpenRequestCount(null);
      }
    );

    return () => unsub();
  }, [enabled, uid]);

  useEffect(() => {
    if (!enabled || !uid) {
      setSentQuoteCount(null);
      return;
    }

    const q = query(
      collectionGroup(db, "quotes"),
      where("partnerId", "==", uid),
      where("status", "in", ["sent", "submitted"])
    );

    const unsub = onSnapshot(
      q,
      (snap) => setSentQuoteCount(snap.size),
      (err: any) => {
        if (err?.code === "permission-denied") {
          console.log("[home] sent quotes: permission-denied (ignored)");
          setSentQuoteCount(null);
          return;
        }
        console.error("[home] sent quotes count error", err);
        setSentQuoteCount(null);
      }
    );

    return () => unsub();
  }, [enabled, uid]);

  useEffect(() => {
    let active = true;

    const loadBanners = async () => {
      setBannerLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, "homeBanners"),
            where("active", "==", true),
            where("target", "in", ["partner", "all"]),
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
        console.error("[partner][home] banner load error", err);
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

  const handleBannerPress = (banner: BannerItem) => {
    if (banner.type === "partner") {
      router.push("/(partner)/(tabs)/profile");
      return;
    }
    if (banner.type === "external" && banner.url) {
      Linking.openURL(banner.url).catch((err) => {
        console.warn("[partner][home] banner url error", err);
      });
    }
  };

  return (
    <Screen style={styles.container}>
      <AppHeader
        title={LABELS.headers.home}
        subtitle="요청과 견적을 한눈에 확인하세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/(partner)/notifications" />
            <TouchableOpacity
              onPress={() => router.push(target as any)}
              style={styles.iconBtn}
            >
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

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

      <Card style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>{LABELS.labels.quoteSummary}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{openRequestCount ?? "-"}</Text>
            <Text style={styles.statLabel}>{LABELS.labels.newRequests}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{sentQuoteCount ?? "-"}</Text>
            <Text style={styles.statLabel}>{LABELS.labels.sentQuotes}</Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  bannerSection: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  bannerList: { gap: BANNER_GAP },
  bannerCard: {
    padding: 0,
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    overflow: "hidden",
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
  summaryCard: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statItem: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 28, fontWeight: "800", color: colors.primary },
  statLabel: { marginTop: spacing.xs, fontSize: 12, color: colors.subtext },
  statDivider: { width: 1, height: 40, backgroundColor: colors.border },
});
