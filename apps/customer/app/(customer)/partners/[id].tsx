import { useLocalSearchParams, useRouter, usePathname } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, listAll, ref } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Screen } from "@/src/components/Screen";
import { db, storage } from "@/src/firebase";
import type { PartnerDoc, ReviewDoc } from "@/src/types/models";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { colors, radius, spacing } from "@/src/ui/tokens";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthUid } from "@/src/lib/useAuthUid";

function formatValue(value: unknown, fallback = "정보 없음") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  return String(value);
}

function formatNumber(value: unknown, suffix = "") {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value.toLocaleString("ko-KR")}${suffix}`;
  }
  return `-${suffix}`;
}

function formatDate(value: unknown) {
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

function maskName(value: string) {
  const name = value.trim();
  if (!name) return "고객";
  if (name.length === 1) return "*";
  if (name.length === 2) return `${name[0]}*`;
  const mid = Math.floor(name.length / 2);
  return `${name.slice(0, mid)}*${name.slice(mid + 1)}`;
}

async function resolveStorageUrl(maybeUrlOrPath: string | null | undefined) {
  if (!maybeUrlOrPath) return null;
  const v = typeof maybeUrlOrPath === "string" ? maybeUrlOrPath.trim() : null;
  if (!v) return null;

  if (v.startsWith("http://") || v.startsWith("https://")) return v;

  if (v.startsWith("gs://") || v.startsWith("/") || v.startsWith("partners/")) {
    try {
      return await getDownloadURL(ref(storage, v));
    } catch {
      // Fall through to return original URL.
    }
  }

  return v;
}

async function resolveStoragePreviewUrl(
  partnerId: string | undefined,
  maybeUrlOrPath: string | null | undefined
) {
  if (!maybeUrlOrPath) return null;
  const v = typeof maybeUrlOrPath === "string" ? maybeUrlOrPath.trim() : null;
  if (!v) return null;
  if (!partnerId) return resolveStorageUrl(v);
  if (v.startsWith("http://") || v.startsWith("https://")) return v;

  if (v.includes("/photos/thumbs/")) return resolveStorageUrl(v);
  return resolveStorageUrl(v);
}

async function listPartnerStoragePhotos(partnerId: string) {
  try {
    const photosRef = ref(storage, `partners/${partnerId}/photos`);
    const thumbsRef = ref(storage, `partners/${partnerId}/photos/thumbs`);
    const photosResult = await listAll(photosRef);
    let thumbsResult: { items: typeof photosResult.items };
    try {
      thumbsResult = await listAll(thumbsRef);
    } catch {
      thumbsResult = { items: [] as typeof photosResult.items };
    }

    const thumbMap = new Map<string, string>();
    for (const thumbItem of thumbsResult.items) {
      const url = await getDownloadURL(thumbItem);
      thumbMap.set(thumbItem.name, url);
    }

    const urls: string[] = [];
    for (const item of photosResult.items) {
      if (item.name === "thumbs") continue;
      const thumbUrl = thumbMap.get(item.name);
      if (thumbUrl) {
        urls.push(thumbUrl);
        continue;
      }
      const url = await getDownloadURL(item);
      urls.push(url);
    }

    return urls;
  } catch (err) {
    console.warn("[customer][partner] storage list error", err);
    return [];
  }
}

export default function PartnerProfileScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { uid, status } = useAuthUid();
  const { id } = useLocalSearchParams<{ id: string }>();
  const partnerId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const [partner, setPartner] = useState<PartnerDoc | null>(null);
  const [docPhotos, setDocPhotos] = useState<Array<{ full: string; preview: string }>>([]);
  const [subPhotos, setSubPhotos] = useState<Array<{ full: string; preview: string }>>([]);
  const [photoLimit, setPhotoLimit] = useState(3);
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [reviewPhotos, setReviewPhotos] = useState<Record<string, string[]>>({});
  const [reviewAuthors, setReviewAuthors] = useState<Record<string, string>>({});
  const [reviewSort, setReviewSort] = useState<
    "latest" | "rating_desc" | "rating_asc"
  >("latest");
  const [reviewSortOpen, setReviewSortOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!partnerId) {
      setError("파트너 ID가 없습니다.");
      setLoading(false);
      return;
    }

    let active = true;
    setError(null);

    (async () => {
      try {
        const cached = await getDocFromCache(doc(db, "partners", partnerId));
        if (!active || !cached.exists()) return;
        const data = cached.data() as PartnerDoc & {
          profileImages?: string[];
          photoUrl?: string | null;
          imageUrl?: string | null;
          logoUrl?: string | null;
        };
        setPartner(data as PartnerDoc);
        setLoading(false);
      } catch {
        // Cache miss is fine.
      }
    })();

    const partnerUnsub = onSnapshot(
      doc(db, "partners", partnerId),
      (snap) => {
        if (!active) return;
        if (!snap.exists()) {
          setPartner(null);
          setDocPhotos([]);
          setLoading(false);
          return;
        }
        const data = snap.data() as PartnerDoc & {
          profileImages?: string[];
          photoUrl?: string | null;
          imageUrl?: string | null;
          logoUrl?: string | null;
        };
        setPartner(data as PartnerDoc);
        setLoading(false);
        const list = [
          ...(Array.isArray(data.profileImages) ? data.profileImages : []),
          data.photoUrl,
          data.imageUrl,
          data.logoUrl,
        ].filter(Boolean) as string[];
        (async () => {
          const resolved = (
            await Promise.all(
              list.map(async (value) => {
                const full = await resolveStorageUrl(value);
                if (!full) return null;
                const preview = await resolveStoragePreviewUrl(partnerId, value);
                return { full, preview: preview ?? full };
              })
            )
          ).filter((value): value is { full: string; preview: string } => Boolean(value));
          if (active) setDocPhotos(resolved);
        })();
      },
      (err) => {
        console.error("[customer][partner] partner snapshot error", err);
        if (active) setError("파트너 정보를 불러오지 못했습니다.");
      }
    );

    const loadStoragePhotos = async () => {
      const urls = await listPartnerStoragePhotos(partnerId);
      if (active) setSubPhotos(urls.map((url) => ({ full: url, preview: url })));
    };

    const storageTimer = setTimeout(loadStoragePhotos, 600);
    const intervalId = setInterval(loadStoragePhotos, 12000);

    return () => {
      active = false;
      partnerUnsub();
      clearTimeout(storageTimer);
      clearInterval(intervalId);
    };
  }, [partnerId, status, uid]);

  useEffect(() => {
    if (!partnerId) return;

    let active = true;
    setReviewsLoading(true);
    setError(null);

    const load = async () => {
      try {
        let reviewSnap;
        try {
          reviewSnap = await getDocs(
            query(
              collection(db, "reviews"),
              where("partnerId", "==", partnerId),
              orderBy("createdAt", "desc"),
              limit(5)
            )
          );
        } catch (err) {
          console.warn("[customer][partner] review query fallback", err);
          reviewSnap = await getDocs(
            query(collection(db, "reviews"), where("partnerId", "==", partnerId), limit(5))
          );
        }

        if (active) {
          const items = reviewSnap.docs
            .map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<ReviewDoc, "id">),
            }))
            .filter((item) => !(item as { hidden?: boolean }).hidden);
          setReviews(items);

          const uniqueCustomers = Array.from(
            new Set(items.map((item) => item.customerId).filter(Boolean))
          );
          const entries = await Promise.all(
            uniqueCustomers.map(async (customerId) => {
              try {
                const customerSnap = await getDoc(doc(db, "customerUsers", customerId));
                if (!customerSnap.exists()) {
                  return [customerId, "고객"] as const;
                }
                const data = customerSnap.data() as { name?: string; nickname?: string };
                const name = data.nickname?.trim() || data.name?.trim() || "고객";
                return [customerId, name] as const;
              } catch {
                return [customerId, "고객"] as const;
              }
            })
          );
          setReviewAuthors(Object.fromEntries(entries));
        }

        if (active) {
          const photoEntries = await Promise.all(
            reviewSnap.docs.map(async (docSnap) => {
              try {
                const photosSnap = await getDocs(
                  query(collection(db, "reviews", docSnap.id, "photos"), limit(4))
                );

                const urlsRaw = photosSnap.docs
                  .map((photoDoc) => {
                    const data = photoDoc.data() as {
                      thumbUrl?: string;
                      url?: string;
                      storagePath?: string;
                      thumbPath?: string;
                    };
                    return data.url ?? data.thumbUrl ?? data.storagePath ?? data.thumbPath ?? null;
                  })
                  .filter((u): u is string => Boolean(u));

                const urlsResolved = (
                  await Promise.all(urlsRaw.map((u) => resolveStorageUrl(u)))
                ).filter((u): u is string => Boolean(u));

                return [docSnap.id, urlsResolved] as const;
              } catch {
                return [docSnap.id, []] as const;
              }
            })
          );

          setReviewPhotos((prev) => {
            const next = { ...prev };
            photoEntries.forEach(([rid, urls]) => {
              next[rid] = [...urls];
            });
            return next;
          });
        }
      } catch (err) {
        console.error("[customer][partner] profile load error", err);
        if (active) setError("파트너 정보를 불러오지 못했습니다.");
      } finally {
        if (active) setReviewsLoading(false);
      }
    };

    const reviewTimer = setTimeout(load, 300);

    return () => {
      active = false;
      clearTimeout(reviewTimer);
    };
  }, [partnerId]);

  const photoEntries = useMemo(() => {
    const merged = [...subPhotos, ...docPhotos].filter(Boolean) as Array<{
      full: string;
      preview: string;
    }>;
    const seen = new Set<string>();
    const unique: Array<{ full: string; preview: string }> = [];
    for (const entry of merged) {
      const key = entry.full || entry.preview;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(entry);
    }
    return unique;
  }, [subPhotos, docPhotos]);

  const photos = useMemo(() => photoEntries.map((entry) => entry.full), [photoEntries]);
  const photoPreviews = useMemo(
    () => photoEntries.map((entry) => entry.preview),
    [photoEntries]
  );

  const visiblePhotos = useMemo(() => {
    if (photosExpanded) return photoPreviews;
    return photoPreviews.slice(0, photoLimit);
  }, [photoPreviews, photosExpanded, photoLimit]);

  const displayName = partner?.name ?? "파트너명 미등록";
  const isActive = partner?.isActive ?? false;
  const ratingAvg = Number(
    partner?.ratingAvg ?? partner?.trust?.factors?.reviewAvg ?? 0
  );
  const reviewCount = Number(
    partner?.reviewCount ?? partner?.trust?.factors?.reviewCount ?? 0
  );
  const fallbackReviewCount = reviews.length;
  const fallbackRatingAvg = useMemo(() => {
    if (!fallbackReviewCount) return 0;
    const sum = reviews.reduce((acc, item) => acc + Number(item.rating ?? 0), 0);
    return sum / fallbackReviewCount;
  }, [fallbackReviewCount, reviews]);
  const displayReviewCount = reviewCount > 0 ? reviewCount : fallbackReviewCount;
  const displayRatingAvg =
    ratingAvg > 0 ? ratingAvg : fallbackReviewCount > 0 ? fallbackRatingAvg : 0;

  const sortedReviews = useMemo(() => {
    if (reviewSort === "rating_desc") {
      return [...reviews].sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
    }
    if (reviewSort === "rating_asc") {
      return [...reviews].sort((a, b) => Number(a.rating ?? 0) - Number(b.rating ?? 0));
    }
    return reviews;
  }, [reviewSort, reviews]);

  const { width: viewerWidth } = Dimensions.get("window");
  const navHeight = 56 + Math.max(insets.bottom, 0);
  const navItems = [
    { key: "home", label: "홈", icon: "home", href: "/(tabs)/home" },
    { key: "search", label: "파트너 찾기", icon: "search", href: "/(tabs)/search" },
    { key: "quotes", label: "받은 견적", icon: "file-text-o", href: "/(tabs)/quotes" },
    { key: "chats", label: "채팅", icon: "comments", href: "/(tabs)/chats" },
    { key: "profile", label: "내정보", icon: "user", href: "/(tabs)/profile" },
  ] as const;

  const reviewSortLabel =
    reviewSort === "rating_desc"
      ? "평점 높은순"
      : reviewSort === "rating_asc"
        ? "평점 낮은순"
        : "최신순";

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.headerTop}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>파트너 프로필</Text>
          <Text style={styles.headerSubtitle}>파트너 정보를 확인하세요.</Text>
        </View>
        <TouchableOpacity
          style={styles.requestBtn}
          onPress={() => {
            if (!uid) {
              router.push({ pathname: "/login", params: { force: "1" } });
              return;
            }
            if (!partnerId) return;
            router.push({
              pathname: "/(customer)/requests/new-chat",
              params: { partnerId },
            } as any);
          }}
        >
          <Text style={styles.requestBtnText}>견적 요청</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.muted}>불러오는 중...</Text>
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + navHeight }]}>
          <Card style={[styles.cardSurface, styles.sectionCard]}>
            <View style={styles.heroRow}>
              <TouchableOpacity
                style={styles.avatar}
                disabled={!photoPreviews[0]}
                onPress={() => {
                  if (!photos[0]) return;
                  setPhotoViewerPhotos(photos);
                  setPhotoViewerIndex(0);
                  setPhotoViewerOpen(true);
                }}
              >
                {photoPreviews[0] ? (
                  <Image source={{ uri: photoPreviews[0] }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder} />
                )}
              </TouchableOpacity>

              <View style={styles.heroInfo}>
                <Text style={styles.heroName}>{displayName}</Text>
                <View style={styles.heroChips}>
                  <Chip
                    label={isActive ? "운영중" : "비활성"}
                    tone={isActive ? "default" : "warning"}
                  />
                  {(partner as any)?.businessVerified ? (
                    <Chip label="사업자 인증" tone="success" />
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statText}>평점 {displayRatingAvg.toFixed(1)}</Text>
              <Text style={styles.statText}>리뷰 {formatNumber(displayReviewCount)}</Text>
            </View>
          </Card>

          <Card style={[styles.cardSurface, styles.sectionCard]}>
            <Text style={styles.sectionTitle}>파트너 소개</Text>
            <Text style={styles.sectionBody}>
              {formatValue(
                (partner as any)?.description ??
                  (partner as any)?.intro ??
                  (partner as any)?.bio ??
                  (partner as any)?.about,
                "소개가 등록되어 있지 않습니다."
              )}
            </Text>
          </Card>

          <Card style={[styles.cardSurface, styles.sectionCard]}>
            <Text style={styles.sectionTitle}>프로필 사진</Text>
            {visiblePhotos.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
              >
                {visiblePhotos.map((url, index) => (
                  <TouchableOpacity
                    key={`${url}-${index}`}
                    onPress={() => {
                      setPhotoViewerPhotos(photos);
                      setPhotoViewerIndex(index);
                      setPhotoViewerOpen(true);
                    }}
                  >
                    <Image source={{ uri: url }} style={styles.photoItem} />
                  </TouchableOpacity>
                ))}
                {!photosExpanded && photos.length > visiblePhotos.length ? (
                  <TouchableOpacity
                    style={styles.photoMore}
                    onPress={() => {
                      setPhotosExpanded(true);
                      setPhotoLimit(photos.length);
                    }}
                  >
                    <Text style={styles.photoMoreText}>+{photos.length - visiblePhotos.length}</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            ) : (
              <Text style={styles.muted}>등록된 사진이 없습니다.</Text>
            )}
          </Card>

          <Card style={[styles.cardSurface, styles.sectionCard]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>리뷰</Text>
              <TouchableOpacity
                style={styles.sortDropdown}
                onPress={() => setReviewSortOpen((prev) => !prev)}
              >
                <Text style={styles.sortDropdownText}>{reviewSortLabel}</Text>
                <Text style={styles.sortDropdownIcon}>{reviewSortOpen ? "▲" : "▼"}</Text>
              </TouchableOpacity>
            </View>

            {reviewSortOpen ? (
              <View style={styles.sortPanel}>
                <TouchableOpacity
                  style={[
                    styles.sortOption,
                    reviewSort === "rating_desc" && styles.sortOptionActive,
                  ]}
                  onPress={() => {
                    setReviewSort("rating_desc");
                    setReviewSortOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      reviewSort === "rating_desc" && styles.sortOptionTextActive,
                    ]}
                  >
                    평점 높은순
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.sortOption,
                    reviewSort === "rating_asc" && styles.sortOptionActive,
                  ]}
                  onPress={() => {
                    setReviewSort("rating_asc");
                    setReviewSortOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      reviewSort === "rating_asc" && styles.sortOptionTextActive,
                    ]}
                  >
                    평점 낮은순
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sortOption, reviewSort === "latest" && styles.sortOptionActive]}
                  onPress={() => {
                    setReviewSort("latest");
                    setReviewSortOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      reviewSort === "latest" && styles.sortOptionTextActive,
                    ]}
                  >
                    최신순
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {reviewsLoading ? (
              <Text style={styles.muted}>리뷰를 불러오는 중...</Text>
            ) : sortedReviews.length ? (
              <View style={styles.reviewList}>
                {sortedReviews.map((review) => {
                  const rating = Number(review.rating ?? 0);
                  return (
                    <View key={review.id} style={styles.reviewItem}>
                      <View style={styles.reviewHeader}>
                        <View style={styles.reviewHeaderLeft}>
                          <Text style={styles.reviewAuthor}>
                            {maskName(reviewAuthors[review.customerId] ?? "고객")}
                          </Text>
                          <View style={styles.reviewStars}>
                            {[1, 2, 3, 4, 5].map((value) => (
                              <Text
                                key={value}
                                style={[
                                  styles.reviewStar,
                                  value <= rating && styles.reviewStarActive,
                                ]}
                              >
                                {value <= rating ? "★" : "☆"}
                              </Text>
                            ))}
                          </View>
                        </View>
                        <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
                      </View>

                      <Text style={styles.reviewText}>
                        {formatValue((review as any)?.text, "리뷰 내용이 없습니다.")}
                      </Text>

                      {(review as any)?.partnerReply ? (
                        <View style={styles.partnerReplyBox}>
                          <View style={styles.partnerReplyHeader}>
                            <FontAwesome name="reply" size={12} color={colors.primary} />
                            <Text style={styles.partnerReplyLabel}>파트너 답글</Text>
                          </View>
                          <Text style={styles.partnerReplyText}>
                            {(review as any).partnerReply}
                          </Text>
                        </View>
                      ) : null}

                      {reviewPhotos[review.id]?.length ? (
                        <View style={styles.reviewPhotos}>
                          {reviewPhotos[review.id].map((url, index) => (
                            <TouchableOpacity
                              key={`${review.id}-${index}`}
                              onPress={() => {
                                const list = reviewPhotos[review.id] ?? [];
                                if (!list.length) return;
                                setPhotoViewerPhotos(list);
                                setPhotoViewerIndex(index);
                                setPhotoViewerOpen(true);
                              }}
                            >
                              <Image source={{ uri: url }} style={styles.reviewPhoto} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.muted}>아직 리뷰가 없습니다.</Text>
            )}
          </Card>
        </ScrollView>
      )}

      <Modal visible={photoViewerOpen} transparent animationType="fade">
        <View style={styles.viewerBackdrop}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerCount}>
              {photoViewerIndex + 1}/{photoViewerPhotos.length}
            </Text>
            <TouchableOpacity onPress={() => setPhotoViewerOpen(false)}>
              <Text style={styles.viewerClose}>닫기</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: photoViewerIndex * viewerWidth, y: 0 }}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / viewerWidth);
              setPhotoViewerIndex(nextIndex);
            }}
          >
            {photoViewerPhotos.map((url, index) => (
              <View key={`${url}-${index}`} style={[styles.viewerPage, { width: viewerWidth }]}>
                <Image
                  source={{ uri: url }}
                  style={[styles.viewerImage, { width: viewerWidth, height: viewerWidth * 1.8 }]}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
      <View
        style={[
          styles.bottomNav,
          { height: navHeight, paddingBottom: Math.max(insets.bottom, spacing.sm) },
        ]}
      >
        {navItems.map((item) => {
          const active = pathname.includes(`/${item.key}`);
          const color = active ? colors.primary : colors.subtext;
          return (
            <TouchableOpacity
              key={item.key}
              style={styles.navItem}
              onPress={() => router.push(item.href)}
            >
              <FontAwesome name={item.icon} size={20} color={color} />
              <Text style={[styles.navLabel, { color }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2ED" },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerTop: {
    marginTop: spacing.xxl + spacing.sm,
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  headerSubtitle: { marginTop: 4, color: colors.subtext, fontSize: 12 },
  requestBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  requestBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  cardSurface: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  loadingBox: { padding: spacing.lg, alignItems: "center", gap: spacing.sm },
  muted: { color: colors.subtext, fontSize: 12 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg },
  sectionCard: { gap: spacing.sm, padding: spacing.lg },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionBody: { color: colors.text, lineHeight: 20, fontSize: 13 },

  sortDropdown: {
    borderWidth: 1,
    borderColor: "#E8E0D6",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: "#F7F4F0",
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
  },
  sortOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#F7F4F0",
  },
  sortOptionActive: { backgroundColor: colors.primary },
  sortOptionText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  sortOptionTextActive: { color: "#FFFFFF" },

  heroRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 18, fontWeight: "800", color: colors.text },
  heroMeta: { color: colors.subtext, marginTop: spacing.xs },
  heroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },

  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  statText: { color: colors.subtext, fontSize: 12 },

  avatar: { width: 72, height: 72, borderRadius: 36, overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  avatarPlaceholder: { width: "100%", height: "100%", backgroundColor: "#F2E6DB" },

  photoRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  photoItem: { width: 96, height: 96, borderRadius: 12, backgroundColor: "#F2E6DB" },
  photoMore: {
    width: 96,
    height: 96,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F4F0",
    borderWidth: 1,
    borderColor: "#E8E0D6",
  },
  photoMoreText: { color: colors.text, fontWeight: "800" },

  reviewList: { gap: spacing.sm },
  reviewItem: {
    backgroundColor: "#F7F4F0",
    borderRadius: 12,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: "#E8E0D6",
  },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewHeaderLeft: { gap: 4 },
  reviewAuthor: { color: colors.text, fontSize: 12, fontWeight: "700" },
  reviewStars: { flexDirection: "row", gap: 2 },
  reviewStar: { color: "#D1D5DB", fontSize: 16 },
  reviewStarActive: { color: "#FBBF24" },
  reviewText: { color: colors.text, marginTop: spacing.xs },
  reviewDate: { color: colors.subtext, fontSize: 12, marginTop: spacing.xs },

  partnerReplyBox: { marginTop: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.bg, borderRadius: 8, gap: spacing.xs },
  partnerReplyHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  partnerReplyLabel: { fontSize: 12, fontWeight: "700", color: colors.primary },
  partnerReplyText: { fontSize: 12, color: colors.text, lineHeight: 16 },

  reviewPhotos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  reviewPhoto: { width: 64, height: 64, borderRadius: 8, backgroundColor: "#F2E6DB" },

  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
  },
  viewerHeader: {
    position: "absolute",
    top: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewerCount: { color: "#FFFFFF", fontWeight: "700" },
  viewerClose: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  viewerPage: { alignItems: "center", justifyContent: "center" },
  viewerImage: { resizeMode: "contain" },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    paddingTop: 6,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8E0D6",
  },
  navItem: { alignItems: "center", gap: 2 },
  navLabel: { fontSize: 11, fontWeight: "600" },
});
