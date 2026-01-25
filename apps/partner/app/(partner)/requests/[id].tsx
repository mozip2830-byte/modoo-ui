import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ensureChatDoc, sendMessage, subscribeChat } from "@/src/actions/chatActions";
import { createNotification } from "@/src/actions/notificationActions";
import { submitQuoteWithBilling } from "@/src/actions/partnerActions";
import { subscribeMyQuote, subscribeQuotesForRequest } from "@/src/actions/quoteActions";
import { subscribeQuoteTemplates } from "@/src/actions/quoteTemplateActions";
import { pickImages, uploadImage } from "@/src/actions/storageActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { autoRecompress } from "@/src/lib/imageCompress";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { usePartnerUser } from "@/src/lib/usePartnerUser";
import { ChatDoc, QuoteDoc, QuoteTemplateDoc, RequestDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

const QUOTE_LIMIT = 10;

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

export default function PartnerRequestDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { uid: partnerId, ready } = useAuthUid();
  const { user } = usePartnerUser(partnerId);
  const requestId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const [request, setRequest] = useState<RequestDoc | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [quote, setQuote] = useState<QuoteDoc | null>(null);

  // ✅ A 방식: quoteCount는 requests.quoteCount가 아니라 quotes 서브컬렉션 실제 개수(SSOT)
  const [quoteCount, setQuoteCount] = useState(0);

  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [memo, setMemo] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatUnread, setChatUnread] = useState(false);
  const [quotePhotos, setQuotePhotos] = useState<{ uri: string; remote?: boolean }[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [templates, setTemplates] = useState<QuoteTemplateDoc[]>([]);
  const [partnerDisplayName, setPartnerDisplayName] = useState("파트너");

  // ✅ 핵심 추가: chat ensure 관련 상태
  // - ensuredChatId: ensure 성공 후에만 값이 설정됨 → 이 값이 있어야 subscribeChat 가능
  // - chatEnsureAttempted: 같은 requestId에 대해 1회만 ensure 시도 (무한루프 방지)
  const [ensuredChatId, setEnsuredChatId] = useState<string | null>(null);
  const chatEnsureAttempted = useRef<string | null>(null);

  useEffect(() => {
    if (!requestId) return;
    chatEnsureAttempted.current = null;
    setEnsuredChatId(null);
  }, [requestId]);

  useEffect(() => {
    // ✅ auth ready + partnerId + requestId 준비되기 전에는 구독 시작 금지
    if (!ready || !partnerId || !requestId) {
      if (!requestId) setRequestError("요청 ID가 없습니다.");
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
  }, [ready, partnerId, requestId]);

  useEffect(() => {
    if (!partnerId) {
      setTemplates([]);
      return;
    }

    const unsub = subscribeQuoteTemplates(partnerId, (items) => {
      setTemplates(items);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  useEffect(() => {
    if (!partnerId) {
      setPartnerDisplayName("파트너");
      return;
    }

    const unsub = onSnapshot(
      doc(db, "partners", partnerId),
      (snap) => {
        if (!snap.exists()) {
          setPartnerDisplayName(`파트너 ${partnerId.slice(0, 4)}`);
          return;
        }
        const data = snap.data() as { companyName?: string; name?: string };
        const name = (data.companyName ?? data.name ?? "").trim();
        setPartnerDisplayName(name || `파트너 ${partnerId.slice(0, 4)}`);
      },
      () => {
        setPartnerDisplayName(`파트너 ${partnerId.slice(0, 4)}`);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  // ✅ 파트너는 본인 quote만 조회 가능 (Firestore rules 최소권한)
  // quoteCount는 본인 quote 존재 여부(0 또는 1)로 표시
  useEffect(() => {
    // ✅ auth ready 가드 추가
    if (!ready || !partnerId || !requestId) return;

    const unsub = subscribeQuotesForRequest({
      requestId,
      partnerId, // 필수: 파트너는 본인 quote만 조회
      order: "asc",
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
  }, [ready, partnerId, requestId]);

  useEffect(() => {
    if (!partnerId) {
      setTemplates([]);
      return;
    }

    const unsub = subscribeQuoteTemplates(partnerId, (items) => {
      setTemplates(items);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  useEffect(() => {
    // ✅ auth ready 가드 추가
    if (!ready || !partnerId || !requestId) return;

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
  }, [ready, partnerId, requestId]);

  useEffect(() => {
    if (!partnerId) {
      setTemplates([]);
      return;
    }

    const unsub = subscribeQuoteTemplates(partnerId, (items) => {
      setTemplates(items);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  // ✅ 핵심 변경: quote가 존재하면 chat 문서를 자동 ensure (1회만)
  // - chat 문서가 없을 때 subscribeChat을 먼저 호출하면 permission-denied 발생
  // - 따라서 ensure → subscribe 순서를 강제함
  useEffect(() => {
    // 조건 체크: auth ready + quote 존재 + request.customerId 존재
    if (
      !ready ||
      !partnerId ||
      !requestId ||
      !request?.customerId ||
      !quote ||
      quote.requestId !== requestId
    ) {
      return;
    }

    // 같은 requestId에 대해 이미 ensure 시도했으면 스킵 (무한 호출 방지)
    if (chatEnsureAttempted.current === requestId) {
      return;
    }
    chatEnsureAttempted.current = requestId;

    // ensureChatDoc 호출 → 성공 시 ensuredChatId 설정
    ensureChatDoc({
      requestId,
      role: "partner",
      uid: partnerId,
      partnerId,
      customerId: request.customerId,
    })
      .then((chatId) => {
        console.log("[partner][chat] ensure success", { chatId });
        setEnsuredChatId(chatId);
        setChatError(null);
      })
      .catch((err) => {
        console.error("[partner][chat] ensure error", err);
        // ensure 실패 시 chatId를 null로 유지 → subscribeChat 호출 안 됨
        setEnsuredChatId(null);
        // 비즈니스 에러(견적 없음 등)는 조용히 처리
        if (err instanceof Error && err.message.includes("견적")) {
          // 견적 없음은 정상 흐름이므로 에러 표시 안 함
        } else {
          setChatError("채팅방 연결에 실패했습니다.");
        }
      });
  }, [ready, partnerId, requestId, request?.customerId, quote]);

  // ✅ 핵심 변경: ensuredChatId가 존재할 때만 subscribeChat 호출
  // - chat 문서가 ensure된 이후에만 구독 → permission-denied 방지
  useEffect(() => {
    // ensuredChatId가 없으면 절대 구독하지 않음
    if (!ensuredChatId) {
      setChatUnread(false);
      return;
    }

    console.log("[partner][chat] subscribe start", { chatId: ensuredChatId });

    const unsub = subscribeChat({
      chatId: ensuredChatId,
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
  }, [ensuredChatId]);

  // ✅ A 방식: "마감"은 quotes 개수 기반(또는 고객/관리자가 실제로 닫은 상태)로 판단
  const reachedLimit = quoteCount >= QUOTE_LIMIT;
  const requestClosedByOwnerOrAdmin = request?.status === "closed";
  const isClosedNow = requestClosedByOwnerOrAdmin || reachedLimit;
  const maxQuoteImages = 10;
  const remainingQuoteImages = Math.max(0, maxQuoteImages - quotePhotos.length);

  const handlePickQuoteImages = async () => {
    if (remainingQuoteImages <= 0) return;
    try {
      const assets = await pickImages({ maxCount: remainingQuoteImages });
      if (!assets.length) return;
      setQuotePhotos((prev) => [...prev, ...assets.map((asset) => ({ uri: asset.uri, remote: false }))]);
    } catch (err) {
      console.error("[partner][quote] pick images error", err);
      Alert.alert("사진 선택 실패", "사진을 선택하지 못했습니다.");
    }
  };

  const handleRemoveQuoteImage = (index: number) => {
    setQuotePhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleApplyTemplate = (template: QuoteTemplateDoc) => {
    setMemo(template.memo ?? "");
    setQuotePhotos((template.photoUrls ?? []).map((url) => ({ uri: url, remote: true })));
  };

  const handleSubmit = async () => {
    console.log("[partner][quote] handleSubmit start", {
      requestId,
      partnerId,
      hasRequestCustomerId: Boolean(request?.customerId),
      priceInput,
      memoLength: memo.trim().length,
      photoCount: quotePhotos.length,
    });
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

    // 고객/관리자가 닫은 요청이면 신규 제출 금지(기존 견적 수정은 허용)
    if (request?.status && request.status !== "open" && !quote) {
      setSubmitError("현재 요청에는 견적을 제출할 수 없습니다.");
      return;
    }

    // ✅ A 방식: request.isClosed뿐 아니라 quoteCount(실시간) 기준으로도 마감 처리
    if (isClosedNow && !quote) {
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
      console.log("[partner][quote] submitQuoteWithBilling start", { requestId, partnerId });
      await submitQuoteWithBilling({
        requestId,
        partnerId,
        customerId: request.customerId,
        price,
        memo: memo.trim(),
      });
      console.log("[partner][quote] submitQuoteWithBilling success", { requestId, partnerId });
      const trimmedMemo = memo.trim();
      const summaryText = [
        `안녕하세요 파트너 ${partnerDisplayName} 입니다`,
        "고객님께서 요청하신 견적이 도착하였습니다",
        `견적금액 : ${price.toLocaleString()}원`,
        `견적내역 : ${trimmedMemo || "없음"}`,
        "문의사항은 채팅을 통해 물어보세요",
      ].join("\n");
      let nextChatId = ensuredChatId;
      if (nextChatId && !nextChatId.startsWith(`${requestId}_`)) {
        nextChatId = null;
      }
      let uploadedUrls: string[] = [];

      if (!nextChatId) {
        nextChatId = await ensureChatDoc({
          requestId,
          role: "partner",
          uid: partnerId,
          partnerId,
          customerId: request.customerId,
        });
        setEnsuredChatId(nextChatId);
      }

      if (nextChatId) {
        try {
          console.log("[partner][quote] send summary message", { chatId: nextChatId });
          await sendMessage({
            chatId: nextChatId,
            senderRole: "partner",
            senderId: partnerId,
            text: summaryText,
          });
        } catch (err) {
          console.error("[partner][quote] send summary message error", err);
          Alert.alert("채팅 전송 실패", "견적 요약 전송에 실패했습니다. 다시 시도해주세요.");
          return;
        }
      }

      const remoteUrls = quotePhotos.filter((photo) => photo.remote).map((photo) => photo.uri);
      if (quotePhotos.length) {
        try {
          if (!nextChatId) {
            nextChatId = await ensureChatDoc({
              requestId,
              role: "partner",
              uid: partnerId,
              partnerId,
              customerId: request.customerId,
            });
            setEnsuredChatId(nextChatId);
          }

          setUploadingImages(true);
          const timestamp = Date.now();
          for (const [index, photo] of quotePhotos.entries()) {
            if (photo.remote) continue;
            const prepared = await autoRecompress(
              { uri: photo.uri, maxSize: 1600, quality: 0.75 },
              2 * 1024 * 1024
            );
            const uploaded = await uploadImage({
              uri: prepared.uri,
              storagePath: `chatImages/${nextChatId}/${timestamp}-${index}.jpg`,
              contentType: "image/jpeg",
            });
            uploadedUrls.push(uploaded.url);
          }
        } catch (err) {
          console.error("[partner][quote] upload images error", err);
          Alert.alert("사진 업로드 실패", "사진 업로드에 실패했습니다.");
        } finally {
          setUploadingImages(false);
        }
      }

      const allUrls = [...remoteUrls, ...uploadedUrls];
      if (allUrls.length) {
        try {
          await updateDoc(doc(db, "requests", requestId, "quotes", partnerId), {
            photoUrls: allUrls,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error("[partner][quote] update photoUrls error", err);
        }
      }

      if (nextChatId && allUrls.length) {
        try {
          console.log("[partner][quote] send image message", {
            chatId: nextChatId,
            count: allUrls.length,
          });
          for (const url of allUrls) {
            await sendMessage({
              chatId: nextChatId,
              senderRole: "partner",
              senderId: partnerId,
              imageUrls: [url],
            });
          }
        } catch (err) {
          console.error("[partner][quote] send image message error", err);
          Alert.alert("채팅 전송 실패", "견적 사진 전송에 실패했습니다. 다시 시도해주세요.");
        }
      }

      setQuotePhotos([]);
      setSubmittedNotice("제출 완료");
    } catch (err: unknown) {
      console.error("[partner][quote] submit error", err);
      const message = err instanceof Error ? err.message : "제출에 실패했습니다.";
      if (message === "NEED_TICKETS") {
        createNotification({
          uid: partnerId,
          type: "points_low",
          title: "입찰권이 부족해요",
          body: "견적 제안을 위해 입찰권 충전 또는 구독이 필요합니다.",
        }).catch(() => {});
        Alert.alert("입찰권 부족", "입찰권 충전이 필요합니다.", [
          { text: "취소", style: "cancel" },
          { text: "충전하기", onPress: () => router.push("/(partner)/billing") },
        ]);
        setSubmitError("입찰권이 부족합니다.");
      } else {
        setSubmitError(message);
        Alert.alert("견적 제출 실패", message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ handleChat: ensuredChatId가 있으면 바로 라우팅, 없으면 ensure 후 라우팅
  const handleChat = async () => {
    if (!requestId || !partnerId) {
      setChatError(LABELS.messages.loginRequired);
      Alert.alert("채팅 오류", LABELS.messages.loginRequired);
      return;
    }

    if (!request?.customerId) {
      setChatError("고객 정보가 없습니다.");
      Alert.alert("채팅 오류", "고객 정보가 없습니다.");
      return;
    }

    // ensuredChatId가 이미 있으면 바로 라우팅 (중복 ensure 방지)
    if (ensuredChatId) {
      router.push({
        pathname: "/(partner)/chats/[id]",
        params: { id: ensuredChatId, requestId },
      } as any);
      return;
    }

    // ensuredChatId가 없으면 ensure 후 라우팅
    try {
      const payload = {
        requestId,
        role: "partner" as const,
        uid: partnerId,
        partnerId,
        customerId: request.customerId,
      };

      console.log("[partner][chat] handleChat ensureChatDoc input", payload);

      const chatId = await ensureChatDoc(payload);
      setEnsuredChatId(chatId); // 상태도 업데이트

      console.log("[partner][chat] handleChat ensureChatDoc output", { chatId });

      router.push({
        pathname: "/(partner)/chats/[id]",
        params: { id: chatId, requestId },
      } as any);
    } catch (err) {
      console.error("[partner][chat] open error", err);
      const message = err instanceof Error ? err.message : LABELS.messages.errorOpenChat;
      setChatError(message);
      Alert.alert("채팅 오류", message);
    }
  };

  const canChat = Boolean(quote && request?.customerId);

  // ✅ A 방식: request.quoteCount는 더 이상 사용하지 않음
  const effectiveQuoteCount = quoteCount;

  // ✅ A 방식: 마감 판단도 quoteCount 기반 + (고객/관리자 닫음)만 반영
  const limitReached = (isClosedNow || effectiveQuoteCount >= QUOTE_LIMIT) && !quote;

  // ✅ 상태 뱃지도 A 방식(실시간 마감) 반영
  const statusLabel = isClosedNow ? LABELS.status.closed : LABELS.status.open;
  const statusTone = isClosedNow ? "warning" : "success";

  return (
    <Screen scroll={false} style={styles.container}>
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
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
          <Card style={styles.requestCard}>
            <CardRow>
              <View style={styles.requestText}>
                <Text style={styles.requestTitle}>
                  {(request as any).serviceType ?? "-"}
                  {(request as any).serviceSubType ? ` / ${(request as any).serviceSubType}` : ""}
                </Text>
              </View>
              <Chip label={statusLabel} tone={statusTone} />
            </CardRow>
            <View style={styles.subRow}>
              <Text style={styles.requestSub} numberOfLines={1}>
                {(request as any).addressRoad ?? (request as any).addressDong ?? "-"}
              </Text>
              <Text style={styles.requestMeta}>견적 {quoteCount}건</Text>
            </View>
            {(request as any).addressJibun ? (
              <Text style={styles.requestMeta}>
                지번 {(request as any).addressJibun}
              </Text>
            ) : null}
            {(request as any).zonecode ? (
              <Text style={styles.requestMeta}>
                우편번호 {(request as any).zonecode}
              </Text>
            ) : null}
            <Text style={styles.requestMeta}>
              {request.createdAt ? formatTimestamp(request.createdAt as never) : LABELS.messages.justNow}
            </Text>
            {(request as any).desiredDateMs ? (
              <Text style={styles.requestMeta}>
                희망 {formatDateValue((request as any).desiredDateMs)}
              </Text>
            ) : null}
            {(request as any).cleaningPyeong != null ? (
              <Text style={styles.requestMeta}>평수 {(request as any).cleaningPyeong}평</Text>
            ) : null}
            {(request as any).roomCount != null ? (
              <Text style={styles.requestMeta}>방 {(request as any).roomCount}개</Text>
            ) : null}
            {(request as any).bathroomCount != null ? (
              <Text style={styles.requestMeta}>화장실 {(request as any).bathroomCount}개</Text>
            ) : null}
            {(request as any).verandaCount != null ? (
              <Text style={styles.requestMeta}>베란다 {(request as any).verandaCount}개</Text>
            ) : null}
            {(request as any).extraFieldKey && (request as any).extraFieldValue != null ? (
              <Text style={styles.requestMeta}>
                {(request as any).extraFieldLabel ?? "추가 정보"} {(request as any).extraFieldValue}
              </Text>
            ) : null}
            {(request as any).note ? (
              <Text style={styles.requestNote} numberOfLines={2}>
                요청사항: {(request as any).note}
              </Text>
            ) : null}
            {request.description ? (
              <Text style={styles.requestNote} numberOfLines={2}>
                특이사항: {request.description}
              </Text>
            ) : null}
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
                  {submittedNotice ? (
                    <Text style={styles.successText}>{submittedNotice}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.muted}>아직 견적을 제출하지 않았습니다.</Text>
              )}
            </Card>
            {quote ? (
              <View style={styles.templateManageRow}>
                <SecondaryButton
                  label="견적 저장 관리"
                  onPress={() => router.push("/(partner)/templates")}
                />
              </View>
            ) : null}

            {/* ✅ A 방식: 마감 안내도 실시간 quoteCount 기반 */}
            {isClosedNow && !quote ? (
              <Text style={styles.notice}>요청이 마감되었습니다.</Text>
            ) : null}
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

          {!quote ? (
          <>
          <View style={styles.section}>
            <View style={styles.templateCard}>
  <Text style={styles.sectionTitle}>견적 템플릿</Text>

  {templates.length === 0 ? (
    <Text style={styles.muted}>저장된 템플릿이 없습니다.</Text>
  ) : (
    <View style={styles.templateList}>
      {templates.map((item) => (
        <View key={item.id} style={styles.templateItem}>
          <View style={styles.templateText}>
            <Text style={styles.templateTitle}>{item.title}</Text>

            <Text style={styles.templateMeta} numberOfLines={1}>
              {item.memo}
            </Text>

            <Text style={styles.templateMeta}>
              사진 {item.photoUrls?.length ?? 0}장
            </Text>
          </View>

          <View style={styles.templateActions}>
            <SecondaryButton label="적용" onPress={() => handleApplyTemplate(item)} />
          </View>
        </View>
      ))}
    </View>
  )}
</View>

<SecondaryButton
  label="템플릿 관리하기"
  onPress={() => router.push("/(partner)/templates")}
/>
          </View>

          <View style={styles.section}>
            <Card style={styles.formCard}>
              <CardRow style={styles.formHeader}>
                <Text style={styles.sectionTitle}>{LABELS.labels.quotes}</Text>
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
                maxLength={500}
                style={[styles.input, styles.textArea]}
                multiline
                editable={!submitting && !limitReached}
              />

              <View style={styles.photoRow}>
                <Text style={styles.inputLabel}>
                  사진 ({quotePhotos.length}/{maxQuoteImages})
                </Text>
                <SecondaryButton
                  label="사진 첨부"
                  onPress={handlePickQuoteImages}
                  disabled={submitting || uploadingImages || limitReached || remainingQuoteImages <= 0}
                />
              </View>
              {quotePhotos.length ? (
                <View style={styles.photoGrid}>
                  {quotePhotos.map((photo, index) => (
                    <View key={`${photo.uri}-${index}`} style={styles.photoItem}>
                      <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                      <TouchableOpacity
                        style={styles.photoRemove}
                        onPress={() => handleRemoveQuoteImage(index)}
                      >
                        <Text style={styles.photoRemoveText}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              <PrimaryButton
                label={
                  submitting || uploadingImages ? LABELS.actions.submitting : LABELS.actions.submit
                }
                onPress={handleSubmit}
                disabled={submitting || uploadingImages || limitReached}
              />
            </Card>
          </View>
          </>
          ) : null}
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
  requestSub: { color: colors.subtext, fontSize: 13, flex: 1 },
  subRow: { marginTop: spacing.xs, flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  requestMeta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  requestNote: { marginTop: spacing.xs, color: colors.text, fontSize: 12, lineHeight: 18 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  quoteValue: { fontWeight: "700", color: colors.text },
  quoteSub: { marginTop: spacing.xs, color: colors.subtext },
  successText: { marginTop: spacing.sm, color: colors.success, fontWeight: "700" },
  chatRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  formCard: { gap: spacing.sm, padding: spacing.md },
  formHeader: { marginBottom: spacing.xs },
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
  photoRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoItem: { width: 92, gap: spacing.xs },
  photoImage: { width: 92, height: 92, borderRadius: 12, backgroundColor: colors.card },
  photoRemove: {
    alignItems: "center",
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoRemoveText: { fontSize: 12, color: colors.text, fontWeight: "600" },
  templateCard: { gap: spacing.sm, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  templateList: { gap: spacing.sm },
  templateItem: { padding: spacing.sm, borderRadius: 12, backgroundColor: colors.card },
  templateText: { gap: 4 },
  templateTitle: { fontWeight: "700", color: colors.text },
  templateMeta: { color: colors.subtext, fontSize: 12 },
  templateActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  templateManageRow: { marginTop: spacing.sm },
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
