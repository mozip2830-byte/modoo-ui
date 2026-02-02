// apps/customer/app/(customer)/requests/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ensureChatDoc } from "@/src/actions/chatActions";
import { subscribeQuotesForRequest } from "@/src/actions/quoteActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db, storage } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { QuoteDoc, RequestDoc } from "@/src/types/models";
import { SecondaryButton } from "@/src/ui/components/Buttons";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

const QUOTE_LIMIT = 10;

type PartnerMeta = {
  photoUrl?: string | null;
  reviewCount: number;
  avgRating: number;
  displayName: string;
};

function formatNumberSafe(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed.toLocaleString("ko-KR");
  }
  return "-";
}

function formatDateValue(value: unknown) {
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

export default function CustomerRequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const auth = useAuthUid();
  const customerId = auth.uid ?? null;
  const ready = auth.status === "ready";

  const [request, setRequest] = useState<RequestDoc | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [partnerMeta, setPartnerMeta] = useState<Record<string, PartnerMeta>>({});

  const selectedPartnerId = (request as any)?.selectedPartnerId ?? null;

  useEffect(() => {
    if (!requestId) {
      setRequestError("요청 ID가 없습니다.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setRequestError(null);

    const unsub = onSnapshot(
      doc(db, "requests", requestId),
      (snap) => {
        if (!snap.exists()) {
          setRequest(null);
          setRequestError(LABELS.messages.requestNotFound);
        } else {
          setRequest({ id: snap.id, ...(snap.data() as Omit<RequestDoc, "id">) });
          setRequestError(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[customer][request] load error", err);
        setRequestError(LABELS.messages.errorLoadRequest);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [requestId]);

  useEffect(() => {
    if (!requestId) return;

    const unsub = subscribeQuotesForRequest({
      requestId,
      order: "asc",
      limit: QUOTE_LIMIT,
      onData: (data) => {
        setQuotes(data);
        setQuotesError(null);
      },
      onError: (err) => {
        console.error("[customer][quotes] load error", err);
        setQuotesError(LABELS.messages.errorLoadQuotes);
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [requestId]);

  useEffect(() => {
    if (!requestId || !selectedPartnerId) return;
    if (quotes.some((quote) => quote.partnerId === selectedPartnerId)) return;

    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "requests", requestId, "quotes", selectedPartnerId));
        if (!active || !snap.exists()) return;
        const data = { id: snap.id, ...(snap.data() as Omit<QuoteDoc, "id">) };
        setQuotes((prev) => {
          if (prev.some((quote) => quote.partnerId === selectedPartnerId)) return prev;
          return [data, ...prev];
        });
      } catch (err) {
        console.warn("[customer][quotes] selected load error", err);
      }
    })();

    return () => {
      active = false;
    };
  }, [quotes, requestId, selectedPartnerId]);

  useEffect(() => {
    if (!quotes.length) return;
    let cancelled = false;

    const loadPartnerMeta = async () => {
      const entries = await Promise.all(
        quotes.map(async (quote) => {
          try {
            let photoSnap;
            try {
              photoSnap = await getDocs(
                query(
                  collection(db, "partners", quote.partnerId, "photos"),
                  orderBy("isPrimary", "desc"),
                  orderBy("createdAt", "desc"),
                  limit(1)
                )
              );
            } catch (err) {
              console.warn("[customer][quotes] photo query fallback", err);
              photoSnap = await getDocs(
                query(collection(db, "partners", quote.partnerId, "photos"), limit(1))
              );
            }

            const photoDoc = photoSnap.docs[0]?.data() as
              | {
                  thumbUrl?: string;
                  thumburl?: string;
                  url?: string;
                  thumbPath?: string;
                  storagePath?: string;
                }
              | undefined;

            let photoUrl =
              (photoDoc as any)?.thumbUrl ?? (photoDoc as any)?.thumburl ?? photoDoc?.url ?? null;
            if (typeof photoUrl === "string") {
              photoUrl = photoUrl.trim();
            }

            const storagePath = photoDoc?.thumbPath ?? photoDoc?.storagePath ?? null;

            if (photoUrl && photoUrl.startsWith("gs://")) {
              try {
                photoUrl = await getDownloadURL(ref(storage, photoUrl));
              } catch {
                photoUrl = null;
              }
            }

            if (!photoUrl && storagePath) {
              try {
                photoUrl = await getDownloadURL(ref(storage, storagePath));
              } catch {
                photoUrl = null;
              }
            }

            const reviewsSnap = await getDocs(
              query(collection(db, "reviews"), where("partnerId", "==", quote.partnerId))
            );
            const reviewCount = reviewsSnap.size;

            const total = reviewsSnap.docs.reduce((sum, docSnap) => {
              const rating = (docSnap.data() as { rating?: number }).rating ?? 0;
              return sum + rating;
            }, 0);
            const avgRating = reviewCount ? total / reviewCount : 0;

            const partnerSnap = await getDoc(doc(db, "partners", quote.partnerId));
            const partnerDoc = partnerSnap.exists() ? partnerSnap.data() : undefined;
            const rawName =
              (partnerDoc as any)?.name ??
              (partnerDoc as any)?.companyName ??
              (quote as any)?.partnerName ??
              (quote as any)?.companyName ??
              null;
            const displayName =
              typeof rawName === "string" && rawName.trim().length > 0
                ? rawName.trim()
                : `${quote.partnerId.slice(0, 6)}...`;

            return [
              quote.partnerId,
              {
                photoUrl,
                reviewCount,
                avgRating,
                displayName,
              },
            ] as [string, PartnerMeta];
          } catch (err) {
            console.error("[customer][quotes] meta load error", err);
            const fallbackName =
              (quote as any)?.partnerName ?? (quote as any)?.companyName ?? null;
            const displayName =
              typeof fallbackName === "string" && fallbackName.trim().length > 0
                ? fallbackName.trim()
                : `${quote.partnerId.slice(0, 6)}...`;
            return [
              quote.partnerId,
              {
                photoUrl: null,
                reviewCount: 0,
                avgRating: 0,
                displayName,
              },
            ] as [string, PartnerMeta];
          }
        })
      );

      if (!cancelled) {
        const next: Record<string, PartnerMeta> = {};
        entries.forEach(([partnerId, meta]) => {
          next[partnerId] = meta;
        });
        setPartnerMeta(next);
      }
    };

    loadPartnerMeta().catch((err) => {
      console.error("[customer][quotes] meta error", err);
    });

    return () => {
      cancelled = true;
    };
  }, [quotes]);

  const handleChat = async (quote: QuoteDoc) => {
    if (!requestId) return;

    if (!ready) {
      Alert.alert("잠시만요", "로그인 상태를 확인 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!customerId) {
      setRequestError(LABELS.messages.loginRequired);
      Alert.alert("로그인 필요", LABELS.messages.loginRequired);
      return;
    }

    try {
      const chatId = await ensureChatDoc({
        requestId,
        role: "customer",
        uid: customerId,
        partnerId: quote.partnerId,
        customerId,
      });

      router.push({
        pathname: "/chats/[id]",
        params: { id: chatId, requestId, partnerId: quote.partnerId },
      } as any);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err) {
        const fbErr = err as { code: string; message: string };
        console.error("[customer][chat] open error (FirebaseError)", {
          code: fbErr.code,
          message: fbErr.message,
        });
      } else {
        console.error("[customer][chat] open error", err);
      }
      const message = err instanceof Error ? err.message : LABELS.messages.errorOpenChat;
      Alert.alert("채팅 오류", message);
    }
  };

  const quoteCount = request?.quoteCount ?? quotes.length;
  const displayQuoteCount = quotes.length;
  const isClosed = Boolean(request?.isClosed) || quoteCount >= QUOTE_LIMIT;
  const reviewIdForRequest = (request as any)?.reviewId ?? null;
  const reviewedPartnerId = (request as any)?.reviewedPartnerId ?? null;

  useEffect(() => {
    if (!requestId) return;
    if (quotes.length < QUOTE_LIMIT) return;
    if (request?.isClosed) return;

    updateDoc(doc(db, "requests", requestId), {
      isClosed: true,
      closedAt: serverTimestamp(),
    }).catch((err) => {
      console.error("[customer][request] auto close error", err);
    });
  }, [quotes.length, request?.isClosed, requestId]);

  const handleComplete = async (quote: QuoteDoc) => {
    if (!requestId) return;

    if (!ready) {
      Alert.alert("잠시만요", "로그인 상태를 확인 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!customerId) {
      setRequestError("로그인이 필요합니다.");
      Alert.alert("로그인 필요", "로그인이 필요합니다.");
      return;
    }

    if (selectedPartnerId && selectedPartnerId !== quote.partnerId) {
      Alert.alert("거래완료", "이미 거래완료 업체를 선택했습니다.");
      return;
    }

    Alert.alert(
      "거래완료",
      "해당 업체를 거래완료로 선택하고 리뷰를 작성하시겠어요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "확인",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "requests", requestId), {
                selectedPartnerId: quote.partnerId,
              });

              router.push({
                pathname: "/reviews/new",
                params: { partnerId: quote.partnerId, requestId, source: "completed" },
              } as any);
            } catch (err) {
              console.error("[customer][request] complete error", err);
              Alert.alert("거래완료 실패", "잠시 후 다시 시도해 주세요.");
            }
          },
        },
      ]
    );
  };

  const listHeader = (
    <>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{LABELS.actions.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{LABELS.headers.requestDetail}</Text>
        <View style={{ width: 52 }} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.muted}>{LABELS.messages.loading}</Text>
        </View>
      ) : requestError ? (
        <Text style={styles.error}>{requestError}</Text>
      ) : request ? (
        <>
          <Card style={styles.summaryCard}>
            <Text style={styles.title}>
              {(request as any).serviceType
                ? `${(request as any).serviceType}${
                    (request as any).serviceSubType ? ` / ${(request as any).serviceSubType}` : ""
                  }`
                : request.title ?? "요청 상세"}
            </Text>
            <CardRow style={styles.summaryRow}>
              <Text style={styles.meta}>
                {(() => {
                  const addressRoad =
                    (request as any).addressRoad ??
                    (request as any).address ??
                    request.location ??
                    null;
                  const addressDong = (request as any).addressDong ?? null;
                  const addressDetail = (request as any).addressDetail ?? null;
                  if (!addressRoad && !addressDong) return "-";
                  const base = addressRoad ?? addressDong;
                  const withDong =
                    addressRoad && addressDong ? `${base} (${addressDong})` : base;
                  return addressDetail ? `${withDong} ${addressDetail}` : withDong;
                })()}
              </Text>
              <Chip label={isClosed ? "마감" : "접수"} tone={isClosed ? "warning" : "default"} />
            </CardRow>

            {(request as any).serviceType ? (
              <InfoRow
                label="서비스"
                value={`${(request as any).serviceType}${
                  (request as any).serviceSubType ? ` / ${(request as any).serviceSubType}` : ""
                }`}
              />
            ) : null}
            {(request as any).addressRoad || (request as any).addressDong ? (
              <InfoRow
                label="주소"
                value={`${
                  (request as any).addressRoad ?? (request as any).addressDong ?? "-"
                }${
                  (request as any).addressRoad && (request as any).addressDong
                    ? ` (${(request as any).addressDong})`
                    : ""
                }${
                  (request as any).addressDetail ? ` ${(request as any).addressDetail}` : ""
                }`}
              />
            ) : null}
            {(request as any).zonecode ? (
              <InfoRow label="우편번호" value={String((request as any).zonecode)} />
            ) : null}
            {(request as any).desiredDateMs ? (
              <InfoRow label="희망 날짜" value={formatDateValue((request as any).desiredDateMs)} />
            ) : null}
            <InfoRow
              label="요청 일시"
              value={request.createdAt ? formatTimestamp(request.createdAt as never) : "방금"}
            />
            {(request as any).cleaningPyeong != null ? (
              <InfoRow label="평수" value={`${(request as any).cleaningPyeong}평`} />
            ) : null}
            {(request as any).roomCount != null ? (
              <InfoRow label="방" value={`${(request as any).roomCount}개`} />
            ) : null}
            {(request as any).bathroomCount != null ? (
              <InfoRow label="욕실" value={`${(request as any).bathroomCount}개`} />
            ) : null}
            {(request as any).verandaCount != null ? (
              <InfoRow label="베란다" value={`${(request as any).verandaCount}개`} />
            ) : null}
            {(request as any).extraFieldKey && (request as any).extraFieldValue != null ? (
              <InfoRow
                label={(request as any).extraFieldLabel ?? "추가 정보"}
                value={String((request as any).extraFieldValue)}
              />
            ) : null}
            {(request as any).note ? (
              <InfoRow label="특이사항" value={(request as any).note} multiline />
            ) : null}
            {request.description ? (
              <InfoRow label="요청사항" value={request.description} multiline />
            ) : null}
          </Card>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>받은 견적</Text>
            <Chip
              label={`${displayQuoteCount}/${QUOTE_LIMIT}`}
              tone={isClosed ? "warning" : "default"}
            />
          </View>

          {isClosed ? <Text style={styles.notice}>마감</Text> : null}
          {quotesError ? <Text style={styles.error}>{quotesError}</Text> : null}

          {!ready ? (
            <Text style={styles.mutedInline}>로그인 상태를 확인 중입니다.</Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.muted}>{LABELS.messages.requestNotFound}</Text>
      )}
    </>
  );

  return (
    <Screen scroll={false} style={styles.container}>
      <FlatList
        data={quotes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !loading && !requestError && request ? (
            <EmptyState
              title={LABELS.messages.noQuotes}
              description="아직 도착한 견적이 없습니다. 조금만 기다려 주세요."
            />
          ) : null
        }
        renderItem={({ item }) => {
          const meta = partnerMeta[item.partnerId];
          const chatDisabled = !ready || !customerId;
          const displayName =
            meta?.displayName ??
            (item.partnerId ? `${item.partnerId.slice(0, 6)}...` : "-");
          const priceLabel = formatNumberSafe(item.price);
          const priceText = priceLabel === "-" ? "견적금액 -" : `견적금액 ${priceLabel}원`;
          const isSelected = selectedPartnerId === item.partnerId;
          const reviewReady = isSelected && reviewedPartnerId === item.partnerId && reviewIdForRequest;

          return (
            <Card style={styles.quoteCard}>
              <CardRow style={styles.quoteTopRow}>
                <View style={styles.partnerRow}>
                  <View style={styles.partnerAvatar}>
                    {meta?.photoUrl ? (
                      <Image source={{ uri: meta.photoUrl }} style={styles.partnerImage} />
                    ) : (
                      <View style={styles.partnerPlaceholder} />
                    )}
                  </View>
                  <View style={styles.partnerMeta}>
                    <Text style={styles.partnerName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <Text style={styles.partnerSub} numberOfLines={1}>
                      평점 {meta ? meta.avgRating.toFixed(1) : "0.0"} · 리뷰{" "}
                      {meta ? meta.reviewCount : 0}
                    </Text>
                  </View>
                </View>
                <View style={styles.quoteStatusCol}>
                  <Chip
                    label={
                      item.status === "declined"
                        ? "거절됨"
                        : item.status === "accepted"
                          ? "확정됨"
                          : "열림"
                    }
                    tone={
                      item.status === "declined"
                        ? "default"
                        : item.status === "accepted"
                          ? "success"
                          : "default"
                    }
                  />
                  <Text style={styles.quotePrice}>{priceText}</Text>
                </View>
              </CardRow>

              {item.memo ? <Text style={styles.quoteMemo}>제안 내용: {item.memo}</Text> : null}

              <View style={styles.actionRow}>
                <SecondaryButton label="채팅" onPress={() => handleChat(item)} disabled={chatDisabled} />
                <SecondaryButton
                  label="프로필 보기"
                  onPress={() =>
                    router.push({
                      pathname: "/partners/[id]",
                      params: { id: item.partnerId },
                    } as any)
                  }
                />
                {!selectedPartnerId ? (
                  <SecondaryButton label="거래완료" onPress={() => handleComplete(item)} />
                ) : isSelected ? (
                  <SecondaryButton
                    label={reviewReady ? "리뷰 수정" : "리뷰 작성"}
                    onPress={() =>
                      router.push({
                        pathname: "/reviews/new",
                        params: {
                          partnerId: item.partnerId,
                          requestId,
                          source: "completed",
                          reviewId: reviewIdForRequest ?? undefined,
                        },
                      } as any)
                    }
                  />
                ) : (
                  <SecondaryButton label="거래완료" disabled />
                )}
              </View>

              {isSelected ? (
                <Text style={styles.selectedHint}>거래완료 업체</Text>
              ) : null}

              {(!ready || !customerId) && (
                <Text style={styles.actionHint}>로그인 후 채팅/거래완료를 진행할 수 있습니다.</Text>
              )}
            </Card>
          );
        }}
      />
    </Screen>
  );
}

function InfoRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={multiline ? 3 : 1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
  },
  backBtn: {
    width: 52,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backText: { color: colors.text, fontWeight: "700" },
  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: colors.text },
  loadingBox: { padding: 16, alignItems: "center", gap: 8 },
  muted: { color: colors.subtext, paddingTop: spacing.sm },
  mutedInline: { color: colors.subtext, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  error: { color: colors.danger, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  notice: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontWeight: "700",
  },
  summaryCard: { marginTop: spacing.lg },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  meta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 13 },
  summaryRow: { marginTop: spacing.sm, alignItems: "center" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.xs },
  infoLabel: { width: 76, color: colors.subtext, fontWeight: "700" },
  infoValue: { flex: 1, color: colors.text, fontWeight: "600" },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  quoteCard: { marginBottom: spacing.md },
  quoteTopRow: { alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  partnerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, minWidth: 0 },
  partnerAvatar: { width: 52, height: 52, borderRadius: 26, overflow: "hidden" },
  partnerImage: { width: "100%", height: "100%" },
  partnerPlaceholder: { width: "100%", height: "100%", backgroundColor: colors.border },
  partnerMeta: { flex: 1, minWidth: 0 },
  partnerName: { fontWeight: "700", color: colors.text, fontSize: 15 },
  partnerSub: { color: colors.subtext, fontSize: 12, marginTop: spacing.xs },
  quoteStatusCol: { alignItems: "flex-end", gap: spacing.xs },
  quotePrice: { fontWeight: "800", color: colors.text, fontSize: 16, textAlign: "right" },
  quoteMemo: { marginTop: spacing.sm, color: colors.text, fontSize: 13 },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: "flex-end",
  },
  selectedHint: { marginTop: spacing.sm, color: colors.primary, fontWeight: "700" },
  actionHint: { marginTop: spacing.sm, color: colors.subtext, fontSize: 12 },
});
