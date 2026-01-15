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
  where,
} from "firebase/firestore";

import { ensureChatDoc } from "@/src/actions/chatActions";
import { selectPartnerTransaction, subscribeQuotesForRequest } from "@/src/actions/quoteActions";
import { db } from "@/src/firebase";
import { QuoteDoc, RequestDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { LABELS } from "@/src/constants/labels";
import { Card, CardRow } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

const QUOTE_LIMIT = 10;

type PartnerMeta = {
  photoUrl?: string | null;
  reviewCount: number;
  avgRating: number;
  trustScore: number;
  trustBadge: string;
  trustTier: string;
};

export default function CustomerRequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);
  const customerId = useAuthUid();

  const [request, setRequest] = useState<RequestDoc | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [partnerMeta, setPartnerMeta] = useState<Record<string, PartnerMeta>>({});

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

    return () => {
      unsub();
    };
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
    if (!quotes.length) return;
    let cancelled = false;

    const loadPartnerMeta = async () => {
      const entries = await Promise.all(
        quotes.map(async (quote) => {
          const photoSnap = await getDocs(
            query(
              collection(db, "partners", quote.partnerId, "photos"),
              orderBy("isPrimary", "desc"),
              orderBy("createdAt", "desc"),
              limit(1)
            )
          );

          const photoDoc = photoSnap.docs[0]?.data() as
            | { thumbUrl?: string; url?: string }
            | undefined;
          const photoUrl = photoDoc?.thumbUrl ?? photoDoc?.url ?? null;

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

          const trustScore = Number((partnerDoc as any)?.trust?.score ?? 0);
          const trustBadge = String((partnerDoc as any)?.trust?.badge ?? "NEW");
          const trustTier = String((partnerDoc as any)?.trust?.tier ?? "C");

          return [
            quote.partnerId,
            { photoUrl, reviewCount, avgRating, trustScore, trustBadge, trustTier },
          ] as [string, PartnerMeta];
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

  const handleSelect = async (quote: QuoteDoc) => {
    if (!requestId) return;
    if (!customerId) {
      setRequestError(LABELS.messages.loginRequired);
      return;
    }

    setAccepting(quote.id);
    try {
      await selectPartnerTransaction({
        requestId,
        partnerId: quote.partnerId,
      });
    } catch (err) {
      console.error("[customer][quotes] select error", err);
      Alert.alert("선택 실패", "견적을 선택하지 못했습니다.");
    } finally {
      setAccepting(null);
    }
  };

  const handleChat = async (quote: QuoteDoc) => {
    if (!requestId || !customerId) {
      setRequestError(LABELS.messages.loginRequired);
      return;
    }

    try {
      const chatId = await ensureChatDoc({
        requestId,
        role: "customer",
        uid: customerId,
        partnerId: quote.partnerId,
      });
      router.push(`/chats/${chatId}`);
    } catch (err) {
      console.error("[customer][chat] open error", err);
      const message = err instanceof Error ? err.message : LABELS.messages.errorOpenChat;
      Alert.alert("채팅 오류", message);
    }
  };

  const quoteCount = request?.quoteCount ?? quotes.length;
  const isClosed = Boolean(request?.isClosed) || quoteCount >= QUOTE_LIMIT;

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
            <Text style={styles.title}>{request.title}</Text>
            <CardRow style={styles.summaryRow}>
              <Text style={styles.meta}>{request.location}</Text>
              <Chip label={isClosed ? "마감" : "접수"} tone={isClosed ? "warning" : "default"} />
            </CardRow>
            <Text style={styles.meta}>
              {LABELS.labels.budget}: {request.budget.toLocaleString()}
            </Text>
            <Text style={styles.meta}>
              {request.createdAt ? formatTimestamp(request.createdAt as never) : LABELS.messages.justNow}
            </Text>
            {request.description ? <Text style={styles.detail}>{request.description}</Text> : null}
          </Card>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{LABELS.labels.quotes}</Text>
            <Chip label={`${quoteCount}/${QUOTE_LIMIT}`} tone={isClosed ? "warning" : "default"} />
          </View>

          {isClosed ? <Text style={styles.notice}>마감(10/10)</Text> : null}
          {quotesError ? <Text style={styles.error}>{quotesError}</Text> : null}
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
              description="조금만 기다려 주세요."
            />
          ) : null
        }
        renderItem={({ item }) => {
          const meta = partnerMeta[item.partnerId];
          return (
            <Card style={styles.quoteCard}>
              <CardRow>
                <View style={styles.partnerRow}>
                  <View style={styles.partnerAvatar}>
                    {meta?.photoUrl ? (
                      <Image source={{ uri: meta.photoUrl }} style={styles.partnerImage} />
                    ) : (
                      <View style={styles.partnerPlaceholder} />
                    )}
                  </View>
                  <View style={styles.partnerMeta}>
                    <Text style={styles.partnerName}>{item.partnerId}</Text>
                    <Text style={styles.partnerSub}>
                      평점 {meta ? meta.avgRating.toFixed(1) : "0.0"} · 리뷰 {meta ? meta.reviewCount : 0}
                    </Text>
                  </View>
                </View>

                <Chip label={`${item.price.toLocaleString()}원`} />
              </CardRow>

              <View style={styles.trustRow}>
                <Chip label={`${LABELS.labels.trust} ${meta?.trustBadge ?? "NEW"}`} tone="success" />
                <Text style={styles.trustText}>
                  점수 {meta?.trustScore ?? 0} · 등급 {meta?.trustTier ?? "C"}
                </Text>
              </View>

              {item.memo ? <Text style={styles.quoteMemo}>{item.memo}</Text> : null}

              <View style={styles.actionRow}>
                <SecondaryButton label={LABELS.actions.chat} onPress={() => handleChat(item)} />
                <PrimaryButton
                  label={accepting === item.id ? LABELS.actions.selecting : LABELS.actions.select}
                  onPress={() => handleSelect(item)}
                  disabled={accepting === item.id}
                />
              </View>
            </Card>
          );
        }}
      />
    </Screen>
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
  error: { color: colors.danger, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  notice: { marginTop: spacing.xs, paddingHorizontal: spacing.lg, color: colors.text, fontWeight: "700" },
  summaryCard: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  meta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 13 },
  detail: { marginTop: spacing.md, color: colors.text, lineHeight: 20 },
  summaryRow: { marginTop: spacing.sm },
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
  partnerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  partnerAvatar: { width: 48, height: 48, borderRadius: 24, overflow: "hidden" },
  partnerImage: { width: "100%", height: "100%" },
  partnerPlaceholder: { width: "100%", height: "100%", backgroundColor: colors.border },
  partnerMeta: { flex: 1 },
  partnerName: { fontWeight: "700", color: colors.text },
  partnerSub: { color: colors.subtext, fontSize: 12, marginTop: spacing.xs },
  quoteMemo: { marginTop: spacing.sm, color: colors.text, fontSize: 13 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  trustRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  trustText: { color: colors.subtext, fontSize: 12 },
});
