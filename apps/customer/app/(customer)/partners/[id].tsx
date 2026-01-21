import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
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
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { colors, radius, spacing } from "@/src/ui/tokens";

type PartnerPhoto = {
  thumbUrl?: string | null;
  thumburl?: string | null;
  url?: string | null;
  thumbPath?: string | null;
  storagePath?: string | null;
  createdAt?: unknown;
  isPrimary?: boolean;
};

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

  // gs:// 또는 Storage path 모두 getDownloadURL로 변환 시도
  if (v.startsWith("gs://") || v.startsWith("/") || v.includes("/")) {
    try {
      return await getDownloadURL(ref(storage, v));
    } catch {
      // 그대로 써볼 수 있는 http(s)일 수도 있으니 아래로
    }
  }

  // http(s) 등 일반 URL
  return v;
}

export default function PartnerProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const partnerId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const [partner, setPartner] = useState<PartnerDoc | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [reviewPhotos, setReviewPhotos] = useState<Record<string, string[]>>({});
  const [reviewAuthors, setReviewAuthors] = useState<Record<string, string>>({});
  const [reviewSort, setReviewSort] = useState<
    "latest" | "rating_desc" | "rating_asc"
  >("latest");
  const [reviewSortOpen, setReviewSortOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!partnerId) {
      setError("업체 ID가 없습니다.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        // 1) Partner
        const partnerSnap = await getDoc(doc(db, "partners", partnerId));
        if (!active) return;
        setPartner(partnerSnap.exists() ? (partnerSnap.data() as PartnerDoc) : null);

        // 2) Partner Photos (subcollection)
        const photoSnap = await getDocs(
          query(
            collection(db, "partners", partnerId, "photos"),
            orderBy("isPrimary", "desc"),
            orderBy("createdAt", "desc"),
            limit(8)
          )
        );

        const photoDocs = photoSnap.docs.map((docSnap) => docSnap.data() as PartnerPhoto);
        const photoUrls = await Promise.all(
          photoDocs.map(async (photo) => {
            // 우선 url 계열 먼저
            const raw =
              photo.url ?? photo.thumbUrl ?? photo.thumburl ?? null;

            // url이 없으면 path 계열로
            const path = photo.thumbPath ?? photo.storagePath ?? null;

            // url/gs:///path 모두 처리
            const resolved = await resolveStorageUrl(raw);
            if (resolved) return resolved;

            const resolvedByPath = await resolveStorageUrl(path);
            if (resolvedByPath) return resolvedByPath;

            return null;
          })
        );

        if (active) {
          setPhotos(photoUrls.filter(Boolean) as string[]);
        }

        // 3) Reviews (collection)
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
                  return [customerId, customerId] as const;
                }
                const data = customerSnap.data() as { name?: string; email?: string };
                const name = data.name?.trim() || data.email?.trim() || customerId;
                return [customerId, name] as const;
              } catch {
                return [customerId, customerId] as const;
              }
            })
          );
          setReviewAuthors(Object.fromEntries(entries));
        }

        // 4) Review Photos (subcollection)
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
              next[rid] = urls;
            });
            return next;
          });
        }
      } catch (err) {
        console.error("[customer][partner] profile load error", err);
        if (active) setError("업체 정보를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [partnerId]);

  const displayName = partner?.name ?? "업체명 미등록";
  const approvedStatus = partner?.approvedStatus ?? "상태 미등록";
  const isActive = partner?.isActive ?? false;
  const ratingAvg = Number(partner?.ratingAvg ?? 0);
  const reviewCount = Number(partner?.reviewCount ?? 0);

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

  const reviewSortLabel =
    reviewSort === "rating_desc"
      ? "평점 높은순"
      : reviewSort === "rating_asc"
        ? "평점 낮은순"
        : "최신순";

  return (
    <Screen style={styles.container}>
      <AppHeader
        title="업체 프로필"
        subtitle="업체 정보를 확인하세요."
        rightAction={
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Text style={styles.iconText}>뒤로</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.muted}>불러오는 중...</Text>
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.sectionCard}>
            <View style={styles.heroRow}>
              <TouchableOpacity
                style={styles.avatar}
                disabled={!photos[0]}
                onPress={() => {
                  if (!photos[0]) return;
                  setPhotoViewerPhotos(photos);
                  setPhotoViewerIndex(0);
                  setPhotoViewerOpen(true);
                }}
              >
                {photos[0] ? (
                  <Image source={{ uri: photos[0] }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder} />
                )}
              </TouchableOpacity>

              <View style={styles.heroInfo}>
                <Text style={styles.heroName}>{displayName}</Text>
                <Text style={styles.heroMeta}>{approvedStatus}</Text>
                <View style={styles.heroChips}>
                  <Chip
                    label={isActive ? "활동중" : "비활동"}
                    tone={isActive ? "default" : "warning"}
                  />
                  {(partner as any)?.businessVerified ? (
                    <Chip label="사업자 인증" tone="success" />
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statText}>평점 {ratingAvg.toFixed(1)}</Text>
              <Text style={styles.statText}>리뷰 {reviewCount}</Text>
            </View>
          </Card>

          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>업체 소개</Text>
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

          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>프로필 사진</Text>
            {photos.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
              >
                {photos.map((url, index) => (
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
              </ScrollView>
            ) : (
              <Text style={styles.muted}>등록된 사진이 없습니다.</Text>
            )}
          </Card>

          <Card style={styles.sectionCard}>
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

            {sortedReviews.length ? (
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
              <Text style={styles.viewerClose}>✕</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  iconBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.card,
  },
  iconText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  loadingBox: { padding: spacing.lg, alignItems: "center", gap: spacing.sm },
  muted: { color: colors.subtext, fontSize: 12 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg },
  sectionCard: { gap: spacing.sm },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionBody: { color: colors.text, lineHeight: 20, fontSize: 13 },

  sortDropdown: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
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
  avatarPlaceholder: { width: "100%", height: "100%", backgroundColor: colors.border },

  photoRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  photoItem: { width: 96, height: 96, borderRadius: 12, backgroundColor: colors.border },

  reviewList: { gap: spacing.sm },
  reviewItem: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewHeaderLeft: { gap: 4 },
  reviewAuthor: { color: colors.text, fontSize: 12, fontWeight: "700" },
  reviewStars: { flexDirection: "row", gap: 2 },
  reviewStar: { color: "#D1D5DB", fontSize: 16 },
  reviewStarActive: { color: "#FBBF24" },
  reviewText: { color: colors.text, marginTop: spacing.xs },
  reviewDate: { color: colors.subtext, fontSize: 12, marginTop: spacing.xs },

  reviewPhotos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  reviewPhoto: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.border },

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
  viewerClose: { color: "#FFFFFF", fontWeight: "900", fontSize: 18 },
  viewerPage: { alignItems: "center", justifyContent: "center" },
  viewerImage: { resizeMode: "contain" },
});
