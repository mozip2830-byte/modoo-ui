import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { doc, onSnapshot } from "firebase/firestore";

import { ChatDoc, QuoteDoc, RequestDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { db } from "@/src/firebase";
import { buildChatId, ensureChatDoc, subscribeChat } from "@/src/actions/chatActions";
import { subscribeMyQuote, subscribeQuotesForRequest } from "@/src/actions/quoteActions";
import { submitQuoteWithBilling } from "@/src/actions/partnerActions";
import { createNotification } from "@/src/actions/notificationActions";
import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { usePartnerUser } from "@/src/lib/usePartnerUser";
import { Screen } from "@/src/components/Screen";

const QUOTE_LIMIT = 10;

export default function PartnerRequestDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const partnerId = useAuthUid();
  const { user } = usePartnerUser(partnerId);
  const requestId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const [request, setRequest] = useState<RequestDoc | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [quote, setQuote] = useState<QuoteDoc | null>(null);
  const [quoteCount, setQuoteCount] = useState(0);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [memo, setMemo] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatUnread, setChatUnread] = useState(false);

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
        console.error("[partner][request] load error", err);
        setRequestError(LABELS.messages.errorLoadRequest);
        setLoading(false);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [requestId]);

  useEffect(() => {
    if (!requestId) return;
    const unsub = subscribeQuotesForRequest({
      requestId,
      order: "asc",
      limit: QUOTE_LIMIT,
      onData: (quotes) => {
        setQuoteCount(quotes.length);
      },
      onError: (err) => {
        console.error("[partner][quotes] count error", err);
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [requestId]);

  useEffect(() => {
    if (!requestId || !partnerId) return;

    const unsub = subscribeMyQuote({
      requestId,
      partnerId,
      onData: (data) => {
        setQuote(data);
        if (data) {
          setPriceInput(String(data.price ?? ""));
          setMemo(data.memo ?? "");
          setSubmittedNotice("제출 완료");
        } else {
          setSubmittedNotice(null);
        }
        setQuoteError(null);
      },
      onError: (err) => {
        console.error("[partner][quote] load error", err);
        setQuoteError(LABELS.messages.errorLoadQuotes);
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId, requestId]);

  useEffect(() => {
    if (!requestId || !partnerId || !request?.customerId || !quote) {
      setChatUnread(false);
      return;
    }

    const chatId = buildChatId(requestId, partnerId, request.customerId);
    const unsub = subscribeChat({
      chatId,
      onData: (chat: ChatDoc | null) => {
        if (!chat || !chat.lastMessageAt) {
          setChatUnread(false);
          return;
        }
        const lastRead = chat.lastReadAtPartner as any;
        const lastMessage = chat.lastMessageAt as any;
        if (!lastRead) {
          setChatUnread(true);
          return;
        }
        try {
          const lastReadMs = lastRead.toMillis ? lastRead.toMillis() : 0;
          const lastMessageMs = lastMessage.toMillis ? lastMessage.toMillis() : 0;
          setChatUnread(lastMessageMs > lastReadMs);
        } catch {
          setChatUnread(false);
        }
      },
      onError: (err) => {
        console.error("[partner][chat] subscribe error", err);
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId, quote, request?.customerId, requestId]);

  const handleSubmit = async () => {
    if (!partnerId) {
      setSubmitError(LABELS.messages.loginRequired);
      return;
    }

    if (user?.verificationStatus !== "승인") {
      Alert.alert("견적 제한", "견적 제안은 사업자 인증 후에만 가능합니다.");
      router.push("/(partner)/verification");
      return;
    }

    if (!requestId) {
      setSubmitError("요청 ID가 없습니다.");
      return;
    }

    if (request?.status && request.status !== "open" && !quote) {
      setSubmitError("현재 요청에는 견적을 제출할 수 없습니다.");
      return;
    }
    if (request?.isClosed && !quote) {
      setSubmitError("견적이 마감되었습니다.");
      return;
    }

    if (!request?.customerId) {
      setSubmitError("고객 정보가 없습니다.");
      return;
    }

    const normalized = priceInput.replace(/,/g, "");
    const price = Number(normalized);
    if (!Number.isFinite(price) || price <= 0) {
      setSubmitError("정확한 금액을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmittedNotice(null);

    try {
      await submitQuoteWithBilling({
        requestId,
        partnerId,
        customerId: request.customerId,
        price,
        memo: memo.trim(),
      });
      setSubmittedNotice("제출 완료");
    } catch (err: unknown) {
      console.error("[partner][quote] submit error", err);
      const message = err instanceof Error ? err.message : "제출에 실패했습니다.";
      if (message === "NEED_POINTS") {
        createNotification({
          uid: partnerId,
          type: "points_low",
          title: "포인트가 부족해요",
          body: "견적 제안을 위해 포인트 충전 또는 구독이 필요합니다.",
        }).catch(() => {});
        Alert.alert("포인트 부족", "포인트 충전이 필요합니다.", [
          { text: "취소", style: "cancel" },
          { text: "충전하기", onPress: () => router.push("/(partner)/billing") },
        ]);
        setSubmitError("포인트가 부족합니다.");
      } else {
        setSubmitError(message);
        Alert.alert("견적 제출 실패", message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChat = async () => {
    if (!requestId || !partnerId) {
      setChatError(LABELS.messages.errorOpenChat);
      return;
    }

    try {
      const chatId = await ensureChatDoc({
        requestId,
        role: "partner",
        uid: partnerId,
        partnerId,
      });
      router.push({
        pathname: `/(partner)/chats/${chatId}`,
        params: { requestId },
      });
    } catch (err) {
      console.error("[partner][chat] open error", err);
      const message = err instanceof Error ? err.message : LABELS.messages.errorOpenChat;
      setChatError(message);
      Alert.alert("채팅 오류", message);
    }
  };

  const canChat = Boolean(quote && request?.customerId);
  const effectiveQuoteCount = request?.quoteCount ?? quoteCount;
  const limitReached = (request?.isClosed || effectiveQuoteCount >= QUOTE_LIMIT) && !quote;
  const statusLabel =
    request?.isClosed || request?.status === "closed" ? LABELS.status.closed : LABELS.status.open;
  const statusTone = statusLabel === LABELS.status.closed ? "warning" : "success";

  return (
    <Screen style={styles.container}>
      <AppHeader
        title={LABELS.headers.requestDetail}
        subtitle="견적과 채팅을 관리해요."
        rightAction={<NotificationBell href="/(partner)/notifications" />}
      />

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator />
          <Text style={styles.muted}>{LABELS.messages.loading}</Text>
        </View>
      ) : requestError ? (
        <EmptyState title={requestError} />
      ) : request ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.requestCard}>
            <CardRow>
              <View style={styles.requestText}>
                <Text style={styles.requestTitle}>{request.title}</Text>
                <Text style={styles.requestSub}>{request.location}</Text>
              </View>
              <Chip label={statusLabel} tone={statusTone} />
            </CardRow>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{LABELS.labels.budget}</Text>
              <Text style={styles.metaValue}>
                {request.budget ? `${request.budget.toLocaleString()}원` : "-"}
              </Text>
            </View>
            <Text style={styles.metaLabel}>{LABELS.labels.status}</Text>
            <Text style={styles.metaValue}>{statusLabel}</Text>
            <Text style={styles.timeText}>
              {request.createdAt ? formatTimestamp(request.createdAt as never) : LABELS.messages.justNow}
            </Text>
            {request.description ? <Text style={styles.description}>{request.description}</Text> : null}
          </Card>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{LABELS.labels.myQuote}</Text>
            <Card>
              {quote ? (
                <>
                  <Text style={styles.quoteValue}>
                    {LABELS.labels.price}: {quote.price.toLocaleString()}원
                  </Text>
                  {quote.memo ? (
                    <Text style={styles.quoteSub}>
                      {LABELS.labels.memo}: {quote.memo}
                    </Text>
                  ) : null}
                  {submittedNotice ? <Text style={styles.successText}>{submittedNotice}</Text> : null}
                </>
              ) : (
                <Text style={styles.muted}>아직 견적을 제출하지 않았습니다.</Text>
              )}
            </Card>
            {request.isClosed && !quote ? <Text style={styles.notice}>요청이 마감되었습니다.</Text> : null}
          </View>

          <View style={styles.section}>
            {canChat ? (
              <View style={styles.chatRow}>
                <PrimaryButton label="채팅하기" onPress={handleChat} />
                {chatUnread ? <Chip label="새 메시지" tone="warning" /> : null}
              </View>
            ) : (
              <Text style={styles.muted}>견적 제출 후 채팅을 시작할 수 있습니다.</Text>
            )}
            {chatError ? <Text style={styles.errorText}>{chatError}</Text> : null}
          </View>

          <View style={styles.section}>
            <Card style={styles.formCard}>
              <CardRow style={styles.formHeader}>
                <Text style={styles.sectionTitle}>{LABELS.labels.quotes}</Text>
                <Text style={styles.limitText}>
                  {effectiveQuoteCount}/{QUOTE_LIMIT}
                </Text>
              </CardRow>
              {limitReached ? <Text style={styles.notice}>견적 마감 (10/10)</Text> : null}
              {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
              {quoteError ? <Text style={styles.errorText}>{quoteError}</Text> : null}

              <Text style={styles.inputLabel}>{LABELS.labels.price}</Text>
              <TextInput
                value={priceInput}
                onChangeText={setPriceInput}
                placeholder="예: 120000"
                keyboardType="number-pad"
                style={styles.input}
                editable={!submitting && !limitReached}
              />

              <Text style={styles.inputLabel}>{LABELS.labels.memo}</Text>
              <TextInput
                value={memo}
                onChangeText={setMemo}
                placeholder="고객에게 전달할 메모"
                style={[styles.input, styles.textArea]}
                multiline
                editable={!submitting && !limitReached}
              />

              <PrimaryButton
                label={submitting ? LABELS.actions.submitting : LABELS.actions.submit}
                onPress={handleSubmit}
                disabled={submitting || limitReached}
              />
            </Card>
          </View>
        </ScrollView>
      ) : (
        <EmptyState title={LABELS.messages.requestNotFound} />
      )}

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>{LABELS.actions.back}</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  stateBox: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  muted: { color: colors.subtext, fontSize: 13 },
  errorText: { color: colors.danger, marginTop: spacing.sm },
  notice: { marginTop: spacing.sm, color: colors.text, fontWeight: "600" },
  requestCard: { gap: spacing.sm },
  requestText: { flex: 1 },
  requestTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  requestSub: { marginTop: spacing.xs, color: colors.subtext, fontSize: 13 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { color: colors.subtext, fontSize: 12 },
  metaValue: { color: colors.text, fontWeight: "600", fontSize: 13 },
  timeText: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  description: { marginTop: spacing.sm, color: colors.text, lineHeight: 20 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  quoteValue: { fontWeight: "700", color: colors.text },
  quoteSub: { marginTop: spacing.xs, color: colors.subtext },
  successText: { marginTop: spacing.sm, color: colors.success, fontWeight: "700" },
  chatRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  formCard: { gap: spacing.sm },
  formHeader: { marginBottom: spacing.xs },
  limitText: { color: colors.subtext, fontWeight: "600" },
  inputLabel: { marginTop: spacing.xs, color: colors.text, fontWeight: "600" },
  input: {
    marginTop: spacing.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  textArea: { height: 110, textAlignVertical: "top" },
  backButton: {
    position: "absolute",
    left: spacing.lg,
    top: spacing.lg,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.card,
  },
  backText: { color: colors.text, fontWeight: "700", fontSize: 12 },
});
