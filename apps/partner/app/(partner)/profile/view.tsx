import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, listAll, ref } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { Screen } from "@/src/components/Screen";
import { db, storage } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { PartnerDoc, ReviewDoc } from "@/src/types/models";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { colors, radius, spacing } from "@/src/ui/tokens";

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
      return null;
    }
  }

  return v;
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

    const urls: Array<{ full: string; preview: string }> = [];
    for (const item of photosResult.items) {
      if (item.name === "thumbs") continue;
      const thumbUrl = thumbMap.get(item.name);
      const fullUrl = await getDownloadURL(item);
      urls.push({
        full: fullUrl,
        preview: thumbUrl ?? fullUrl,
      });
    }

    return urls;
  } catch (err) {
    console.warn("[partner][profile] storage list error", err);
    return [];
  }
}

export default function PartnerProfileViewScreen() {
  const router = useRouter();
  const { width: viewerWidth } = Dimensions.get("window");
  const { uid: partnerId } = useAuthUid();

  const [partner, setPartner] = useState<PartnerDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [reviewAuthors, setReviewAuthors] = useState<Record<string, string>>({});
  const [reviewPhotos, setReviewPhotos] = useState<Record<string, string[]>>({});
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewSort, setReviewSort] = useState<"latest" | "rating_desc" | "rating_asc">(
    "latest"
  );
  const [reviewSortOpen, setReviewSortOpen] = useState(false);
  const [photos, setPhotos] = useState<Array<{ full: string; preview: string }>>([]);
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const [photoLimit, setPhotoLimit] = useState(4);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState<string[]>([]);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [selectedReview, setSelectedReview] = useState<ReviewDoc | null>(null);
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);

  // 파트너 정보 로드
  useEffect(() => {
    if (!partnerId) {
      setError("파트너 정보를 불러올 수 없습니다.");
      setLoading(false);
      return;
    }

    let active = true;
    const unsub = onSnapshot(
      doc(db, "partners", partnerId),
      (snap) => {
        if (!active) return;
        if (!snap.exists()) {
          setError("파트너 정보를 찾을 수 없습니다.");
          setPartner(null);
          setLoading(false);
          return;
        }
        const data = snap.data() as PartnerDoc;
        setPartner(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        if (active) {
          console.error("[partner][profile] load error", err);
          setError("프로필을 불러오지 못했습니다.");
          setLoading(false);
        }
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [partnerId]);

  // 사진 로드
  useEffect(() => {
    if (!partnerId) return;
    let active = true;
    const loadPhotos = async () => {
      const urls = await listPartnerStoragePhotos(partnerId);
      if (active) setPhotos(urls);
    };
    loadPhotos();
    return () => {
      active = false;
    };
  }, [partnerId]);

  // 리뷰 로드
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
              limit(10)
            )
          );
        } catch {
          reviewSnap = await getDocs(
            query(collection(db, "reviews"), where("partnerId", "==", partnerId), limit(10))
          );
        }

        if (active) {
          const items = reviewSnap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<ReviewDoc, "id">),
          }));
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
        console.error("[partner][profile] review load error", err);
      } finally {
        if (active) setReviewsLoading(false);
      }
    };

    const timer = setTimeout(load, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [partnerId]);

  const photoPreviews = useMemo(
    () => photos.map((entry) => entry.preview),
    [photos]
  );
  const fullPhotos = useMemo(
    () => photos.map((entry) => entry.full),
    [photos]
  );

  const visiblePhotos = useMemo(() => {
    if (photosExpanded) return photoPreviews;
    return photoPreviews.slice(0, photoLimit);
  }, [photoPreviews, photosExpanded, photoLimit]);

  const displayName = partner?.companyName ?? partner?.name ?? "파트너명 미등록";
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

  const reviewSortLabel =
    reviewSort === "rating_desc"
      ? "평점 높은순"
      : reviewSort === "rating_asc"
        ? "평점 낮은순"
        : "최신순";

  const handleOpenReply = (review: ReviewDoc) => {
    setSelectedReview(review);
    setReplyText((review as any)?.partnerReply || "");
    setReplyModalVisible(true);
  };

  const handleSaveReply = async () => {
    if (!selectedReview) return;

    if (!replyText.trim()) {
      Alert.alert("알림", "답글을 입력해 주세요.");
      return;
    }

    setReplySaving(true);
    try {
      await updateDoc(doc(db, "reviews", selectedReview.id), {
        partnerReply: replyText.trim(),
        partnerReplyAt: new Date(),
      });

      setReviews((prev) =>
        prev.map((review) =>
          review.id === selectedReview.id
            ? { ...review, partnerReply: replyText.trim(), partnerReplyAt: new Date() }
            : review
        )
      );

      Alert.alert("완료", "답글이 저장되었습니다.");
      setReplyModalVisible(false);
      setSelectedReview(null);
      setReplyText("");
    } catch (err) {
      console.error("[partner][profile] reply save error", err);
      Alert.alert("오류", "답글 저장에 실패했습니다.");
    } finally {
      setReplySaving(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.muted}>불러오는 중...</Text>
        </View>
      </Screen>
    );
  }

  if (error || !partner) {
    return (
      <Screen style={styles.container}>
        <View style={styles.loadingBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>돌아가기</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>뒤로</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>내 프로필</Text>
          <Text style={styles.headerSubtitle}>고객들이 보는 내 프로필입니다.</Text>
        </View>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 헤로 섹션 */}
        <Card style={[styles.cardSurface, styles.sectionCard]}>
          <View style={styles.heroRow}>
            <TouchableOpacity
              style={styles.avatar}
              disabled={!photoPreviews[0]}
              onPress={() => {
                if (!fullPhotos[0]) return;
                setPhotoViewerPhotos(fullPhotos);
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
                <Chip label={isActive ? "운영중" : "비활성"} tone={isActive ? "default" : "warning"} />
                {partner.businessVerified ? <Chip label="사업자 인증" tone="success" /> : null}
              </View>
            </View>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statText}>평점 {displayRatingAvg.toFixed(1)}</Text>
            <Text style={styles.statText}>리뷰 {formatNumber(displayReviewCount)}</Text>
          </View>
        </Card>

        {/* 파트너 소개 */}
        <Card style={[styles.cardSurface, styles.sectionCard]}>
          <Text style={styles.sectionTitle}>파트너 소개</Text>
          <Text style={styles.sectionBody}>
            {formatValue(
              partner.description ?? (partner as any)?.intro,
              "소개가 등록되어 있지 않습니다."
            )}
          </Text>
        </Card>

        {/* 프로필 사진 */}
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
                    setPhotoViewerPhotos(fullPhotos);
                    setPhotoViewerIndex(index);
                    setPhotoViewerOpen(true);
                  }}
                >
                  <Image source={{ uri: url }} style={styles.photoItem} />
                </TouchableOpacity>
              ))}
              {!photosExpanded && fullPhotos.length > visiblePhotos.length ? (
                <TouchableOpacity
                  style={styles.photoMore}
                  onPress={() => {
                    setPhotosExpanded(true);
                    setPhotoLimit(fullPhotos.length);
                  }}
                >
                  <Text style={styles.photoMoreText}>+{fullPhotos.length - visiblePhotos.length}</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          ) : (
            <Text style={styles.muted}>등록된 사진이 없습니다.</Text>
          )}
        </Card>

        {/* 리뷰 */}
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
                          <Text style={styles.partnerReplyLabel}>내 답글</Text>
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

                    <TouchableOpacity
                      style={styles.replyBtn}
                      onPress={() => handleOpenReply(review)}
                    >
                      <Text style={styles.replyBtnText}>
                        {(review as any)?.partnerReply ? "답글 수정" : "답글 작성"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.muted}>아직 리뷰가 없습니다.</Text>
          )}
        </Card>
      </ScrollView>

      {/* 답글 작성 모달 */}
      <Modal
        visible={replyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReplyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>답글 작성</Text>
              <TouchableOpacity
                onPress={() => setReplyModalVisible(false)}
                disabled={replySaving}
              >
                <FontAwesome name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {selectedReview && (
              <View style={styles.modalBody}>
                <View style={styles.originReviewBox}>
                  <Text style={styles.originReviewLabel}>원본 리뷰</Text>
                  <Text style={styles.originReviewText}>{selectedReview.text}</Text>
                  <Text style={styles.originReviewRating}>
                    평점: {Number(selectedReview.rating ?? 0).toFixed(1)}
                  </Text>
                </View>

                <Text style={styles.inputLabel}>답글</Text>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="리뷰에 대한 답글을 작성해 주세요."
                  multiline
                  maxLength={500}
                  style={styles.replyInput}
                  editable={!replySaving}
                />

                <Text style={styles.charCount}>{replyText.length}/500</Text>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, replySaving && styles.btnDisabled]}
                    onPress={() => setReplyModalVisible(false)}
                    disabled={replySaving}
                  >
                    <Text style={styles.cancelBtnText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, replySaving && styles.btnDisabled]}
                    onPress={handleSaveReply}
                    disabled={replySaving}
                  >
                    <Text style={styles.submitBtnText}>
                      {replySaving ? "저장 중..." : "저장"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* 사진 뷰어 모달 */}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2ED" },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerTop: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 52, height: 36, alignItems: "flex-start", justifyContent: "center" },
  backText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  headerSubtitle: { marginTop: 4, color: colors.subtext, fontSize: 11 },
  backLink: { marginTop: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  backLinkText: { color: colors.primary, fontWeight: "600" },

  cardSurface: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionCard: { gap: spacing.sm, padding: spacing.lg },
  loadingBox: { padding: spacing.lg, alignItems: "center", gap: spacing.sm, flex: 1, justifyContent: "center" },
  muted: { color: colors.subtext, fontSize: 12 },
  error: { color: colors.danger, textAlign: "center" },

  heroRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg },
  avatar: { width: 100, height: 100, borderRadius: 12, overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  avatarPlaceholder: { width: "100%", height: "100%", backgroundColor: colors.bg },
  heroInfo: { flex: 1, gap: spacing.sm },
  heroName: { fontSize: 16, fontWeight: "800", color: colors.text },
  heroChips: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },

  statRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  statText: { fontSize: 13, color: colors.text, fontWeight: "600" },

  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionBody: { color: colors.text, lineHeight: 20, fontSize: 13 },

  photoRow: { gap: spacing.sm },
  photoItem: { width: 160, height: 120, borderRadius: 8, backgroundColor: colors.bg },
  photoMore: {
    width: 160,
    height: 120,
    borderRadius: 8,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  photoMoreText: { fontSize: 18, fontWeight: "800", color: colors.primary },

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

  reviewList: { marginTop: spacing.sm, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  reviewItem: { gap: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewHeaderLeft: { gap: spacing.xs },
  reviewAuthor: { fontSize: 12, fontWeight: "700", color: colors.text },
  reviewStars: { flexDirection: "row", gap: 1 },
  reviewStar: { fontSize: 11, color: "#D1D5DB", letterSpacing: 1 },
  reviewStarActive: { color: colors.primary },
  reviewDate: { fontSize: 11, color: colors.subtext },
  reviewText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  reviewPhotos: { marginTop: spacing.sm, flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  reviewPhoto: { width: 80, height: 80, borderRadius: 8, backgroundColor: colors.bg },

  replyBtn: {
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
  },
  replyBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },

  partnerReplyBox: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.bg, borderRadius: 8, gap: spacing.xs, marginTop: spacing.sm },
  partnerReplyHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  partnerReplyLabel: { fontSize: 12, fontWeight: "700", color: colors.primary },
  partnerReplyText: { color: colors.text, fontSize: 12, lineHeight: 16 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: spacing.lg },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalBody: { paddingHorizontal: spacing.lg, gap: spacing.md },

  originReviewBox: { backgroundColor: colors.bg, padding: spacing.md, borderRadius: 8, gap: spacing.xs },
  originReviewLabel: { fontSize: 12, fontWeight: "700", color: colors.subtext },
  originReviewText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  originReviewRating: { fontSize: 12, color: colors.subtext },

  inputLabel: { fontSize: 12, fontWeight: "700", color: colors.text },
  replyInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.text, minHeight: 100, textAlignVertical: "top" },
  charCount: { fontSize: 11, color: colors.subtext, textAlign: "right" },

  modalFooter: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: colors.text },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center" },
  submitBtnText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  btnDisabled: { opacity: 0.5 },

  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "flex-end",
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  viewerCount: { color: "#FFFFFF", fontWeight: "600", fontSize: 12 },
  viewerClose: { color: "#FFFFFF", fontWeight: "600", fontSize: 12 },
  viewerPage: { justifyContent: "center", alignItems: "center" },
  viewerImage: { resizeMode: "contain" },
});
