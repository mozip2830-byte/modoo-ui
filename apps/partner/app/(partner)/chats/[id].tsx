import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import {
  ensureChatDoc,
  sendMessage,
  subscribeChat,
  subscribeMessages,
  updateChatRead,
} from "@/src/actions/chatActions";
import { pickImages, uploadImage } from "@/src/actions/storageActions";
import { createOrUpdateQuoteTransaction, subscribeMyQuote } from "@/src/actions/quoteActions";
import { Screen } from "@/src/components/Screen";
import { QuoteMessageCard } from "@/src/components/QuoteMessageCard";
import { QuoteFormModal } from "@/src/components/QuoteFormModal";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { autoRecompress } from "@/src/lib/imageCompress";
import type { ChatDoc, MessageDoc, QuoteDoc, QuoteItem } from "@/src/types/models";
import { colors, spacing } from "@/src/ui/tokens";
import FontAwesome from "@expo/vector-icons/FontAwesome";

const INPUT_HEIGHT = 38;

function toChatDate(value?: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameDay(a: Date | null, b: Date | null) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatChatTime(value?: unknown) {
  const date = toChatDate(value);
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatChatDate(value?: unknown) {
  const date = toChatDate(value);
  if (!date) return "";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function parseChatIdParts(chatId: string | null) {
  // chatId: `${requestId}_${partnerId}_${customerId}`
  if (!chatId) return { requestIdFromChat: "", partnerIdFromChat: "", customerIdFromChat: "" };
  const parts = chatId.split("_");
  if (parts.length < 3) return { requestIdFromChat: "", partnerIdFromChat: "", customerIdFromChat: "" };

  const requestIdFromChat = parts[0] ?? "";
  const partnerIdFromChat = parts[1] ?? "";
  const customerIdFromChat = parts.slice(2).join("_");
  return { requestIdFromChat, partnerIdFromChat, customerIdFromChat };
}

export default function PartnerChatRoomScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { id, requestId } = useLocalSearchParams<{ id: string; requestId?: string }>();
  const initialChatId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const { uid: partnerId, ready } = useAuthUid();

  const { requestIdFromChat, partnerIdFromChat, customerIdFromChat } = useMemo(
    () => parseChatIdParts(initialChatId ?? null),
    [initialChatId]
  );

  const effectiveRequestId = useMemo(() => {
    const fromParam = Array.isArray(requestId) ? requestId[0] : requestId;
    return fromParam ?? requestIdFromChat ?? "";
  }, [requestId, requestIdFromChat]);

  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState(true);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [chatInfo, setChatInfo] = useState<ChatDoc | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [myQuote, setMyQuote] = useState<QuoteDoc | null>(null);

  const listRef = useRef<FlatList<MessageDoc>>(null);

  // ✅ 키보드 show/hide 때 맨 아래로 스크롤(입력 따라오게 UX 보강)
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const s1 = Keyboard.addListener(showEvt, () => {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    const s2 = Keyboard.addListener(hideEvt, () => {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });

    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  // ✅ ensureChatDoc 성공 후에만 chatId 설정
  useEffect(() => {
    if (!ready || !partnerId) {
      setError(LABELS.messages.loginRequired);
      setEnsuring(false);
      return;
    }

    if (!initialChatId) {
      setError("채팅 ID가 없습니다.");
      setEnsuring(false);
      return;
    }

    if (!customerIdFromChat) {
      setError("채팅 ID 형식이 올바르지 않습니다. (customerId 누락)");
      setEnsuring(false);
      return;
    }

    if (partnerIdFromChat && partnerIdFromChat !== partnerId) {
      setError("로그인 계정과 채팅방 업체 정보가 일치하지 않습니다. 다시 로그인해 주세요.");
      setEnsuring(false);
      return;
    }

    if (!effectiveRequestId) {
      setError("요청 ID가 없습니다.");
      setEnsuring(false);
      return;
    }

    setEnsuring(true);
    setError(null);

    ensureChatDoc({
      requestId: effectiveRequestId,
      role: "partner",
      uid: partnerId,
      partnerId,
      customerId: customerIdFromChat,
    })
      .then((nextChatId) => {
        setChatId(nextChatId);
        setError(null);
        setEnsuring(false);
      })
      .catch((err) => {
        console.error("[partner][chat] ensure error", err);
        setError(err instanceof Error ? err.message : LABELS.messages.errorOpenChat);
        setChatId(null);
        setEnsuring(false);
      });
  }, [ready, partnerId, initialChatId, customerIdFromChat, partnerIdFromChat, effectiveRequestId]);

  // ✅ chatId 확정 후 구독
  useEffect(() => {
    if (!chatId) return;

    const unsub = subscribeMessages(
      chatId,
      (msgs) => setMessages(msgs),
      (err) => {
        console.error("[partner][messages] onSnapshot error", err);
        setError(LABELS.messages.errorLoadChats);
      }
    );

    return () => unsub?.();
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    const unsub = subscribeChat({
      chatId,
      onData: (chat) => setChatInfo(chat),
      onError: (err) => {
        console.error("[partner][chat] info error", err);
      },
    });
    return () => unsub?.();
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !partnerId) return;
    let active = true;
    const run = async () => {
      const snap = await getDoc(doc(db, "partnerUsers", partnerId));
      if (!active || !snap.exists()) return;
      const phone = (snap.data() as { phone?: string }).phone;
      if (!phone || phone === chatInfo?.partnerPhone) return;
      await updateDoc(doc(db, "chats", chatId), { partnerPhone: phone });
    };
    run().catch((err) => console.warn("[partner][chat] phone update error", err));
    return () => {
      active = false;
    };
  }, [chatId, partnerId, chatInfo?.partnerPhone]);

  // ✅ 읽음 처리
  useEffect(() => {
    if (!chatId || !partnerId) return;
    updateChatRead({ chatId, role: "partner" }).catch((err) => {
      console.error("[partner][chat] read update error", err);
    });
  }, [chatId, partnerId]);

  // ✅ 새 메시지 오면 아래로
  useEffect(() => {
    if (!messages.length) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  // ✅ 내 견적 구독
  useEffect(() => {
    if (!chatId || !partnerId || !effectiveRequestId) return;

    const unsub = subscribeMyQuote({
      requestId: effectiveRequestId,
      partnerId,
      onData: setMyQuote,
      onError: (err) => console.error("[chat] quote sub error", err),
    });

    return () => unsub?.();
  }, [chatId, partnerId, effectiveRequestId]);

  const handleSubmitQuote = async (
    items: QuoteItem[],
    memo: string,
    roomCount: number | null,
    bathroomCount: number | null,
    verandaCount: number | null,
    depositRatio: number,
    selectedAreas: string[]
  ) => {
    if (!chatId || !partnerId || !effectiveRequestId) {
      setError("채팅 정보가 없습니다.");
      return;
    }

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    try {
      // 1. QuoteDoc 저장 (입찰권 차감)
      await createOrUpdateQuoteTransaction({
        requestId: effectiveRequestId,
        partnerId,
        customerId: customerIdFromChat,
        price: totalAmount,
        memo,
        items,
        submittedFrom: "chat",
      });

      // 2. 견적서 메시지 전송
      const messageText = myQuote
        ? `견적서를 수정했습니다. 총 ${totalAmount.toLocaleString()}원`
        : `견적서를 보냈습니다. 총 ${totalAmount.toLocaleString()}원`;

      const quoteDataObj: any = {
        items,
        totalAmount,
        memo,
        quoteId: partnerId,
      };

      if (roomCount !== null) quoteDataObj.roomCount = roomCount;
      if (bathroomCount !== null) quoteDataObj.bathroomCount = bathroomCount;
      if (verandaCount !== null) quoteDataObj.verandaCount = verandaCount;
      if (depositRatio !== null && depositRatio !== undefined) quoteDataObj.depositRatio = depositRatio;
      if (selectedAreas.length > 0) quoteDataObj.selectedAreas = selectedAreas;

      await sendMessage({
        chatId,
        senderRole: "partner",
        senderId: partnerId,
        text: messageText,
        type: "quote",
        quoteData: quoteDataObj,
      });

      setShowQuoteModal(false);
    } catch (err) {
      console.error("[partner][chat] submit quote error", err);
      const errorMsg = err instanceof Error ? err.message : "견적서 제출에 실패했습니다.";
      setError(errorMsg);
    }
  };

  const handleCall = async () => {
    const phone = chatInfo?.customerPhone;
    if (!phone) {
      setError("고객 전화번호가 없습니다.");
      return;
    }
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch (err) {
      console.warn("[partner][chat] call error", err);
      setError("전화 연결에 실패했습니다.");
    }
  };

  const handleSendImages = async () => {
    if (!chatId || !partnerId) {
      setError(LABELS.messages.loginRequired);
      return;
    }

    try {
      const assets = await pickImages({ maxCount: 10 });
      if (!assets.length) return;

      setUploadingImages(true);
      const uploadedUrls: string[] = [];
      const timestamp = Date.now();
      for (const [index, asset] of assets.entries()) {
        const prepared = await autoRecompress(
          { uri: asset.uri, maxSize: 1600, quality: 0.75 },
          2 * 1024 * 1024
        );
        const uploaded = await uploadImage({
          uri: prepared.uri,
          storagePath: `chatImages/${chatId}/${timestamp}-${index}.jpg`,
          contentType: "image/jpeg",
        });
        uploadedUrls.push(uploaded.url);
      }

      await sendMessage({
        chatId,
        senderRole: "partner",
        senderId: partnerId,
        text: text.trim(),
        imageUrls: uploadedUrls,
      });
      if (text.trim()) {
        setText("");
      }
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      console.error("[partner][messages] image send error", err);
      setError("사진을 보내지 못했습니다.");
    } finally {
      setUploadingImages(false);
    }
  };

  const onSend = async () => {
    if (!chatId || !partnerId) {
      setError(LABELS.messages.loginRequired);
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setText("");
    try {
      await sendMessage({
        chatId,
        senderRole: "partner",
        senderId: partnerId,
        text: trimmed,
      });
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      console.error("[partner][messages] send error", err);
      setError("메시지를 보내지 못했습니다.");
    }
  };

  return (
    <Screen
      scroll={false}
      keyboardAvoiding={false} // ✅ Screen 내부 KAV 끄기(이중 보정/공백 방지)
      edges={["top"]}          // ✅ 하단 safe-area는 입력바에서만 처리
      style={styles.container}
    >
      <View style={styles.flex}>
        {/* ✅ 헤더는 키보드 영향 없이 고정 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{LABELS.actions.back}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{LABELS.headers.chats}</Text>
          <View style={styles.headerActions}>
            {chatId && !ensuring && effectiveRequestId ? (
              <TouchableOpacity
                onPress={() => {
                  setShowQuoteModal(true);
                }}
                style={styles.headerQuoteBtn}
                disabled={ensuring}
              >
                <FontAwesome name="plus" size={12} color="#FFFFFF" />
                <Text style={styles.headerQuoteBtnText}>견적 제출/수정</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleCall}
              style={[
                styles.callBtn,
                (!chatInfo?.customerPhone || chatInfo?.paymentStatus !== "completed") &&
                  styles.callBtnDisabled,
              ]}
              disabled={!chatInfo?.customerPhone || chatInfo?.paymentStatus !== "completed"}
            >
              <FontAwesome
                name="phone"
                size={16}
                color={
                  chatInfo?.customerPhone && chatInfo?.paymentStatus === "completed"
                    ? colors.primary
                    : colors.subtext
                }
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ✅ 메시지 + 입력바만 키보드에 따라 이동 */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={styles.flex}>
            {ensuring ? (
              <View style={styles.loadingBox}>
                <Text style={styles.loadingText}>채팅방 연결 중...</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <FlatList
              ref={listRef}
              style={styles.flex}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item, index }) => {
                const currentDate = toChatDate(item.createdAt);
                const prevDate = index > 0 ? toChatDate(messages[index - 1]?.createdAt) : null;
                const showDate = !!currentDate && !isSameDay(currentDate, prevDate);
                return (
                  <>
                    {showDate ? (
                      <View style={styles.dateSeparator}>
                        <Text style={styles.dateSeparatorText}>{formatChatDate(item.createdAt as never)}</Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.messageRow,
                        item.senderRole === "partner" ? styles.messageRowMine : styles.messageRowOther,
                      ]}
                    >
                      <View
                        style={[
                          styles.bubble,
                          item.senderRole === "partner" ? styles.bubbleMine : styles.bubbleOther,
                        ]}
                      >
                    {item.type === "quote" && item.quoteData ? (
                      <QuoteMessageCard data={item.quoteData} />
                    ) : item.text && item.text.trim() !== "." ? (
                      item.text.startsWith("안녕하세요 파트너 ") ? (
                        <View style={styles.quoteCard}>
                          <Text style={styles.quoteGreeting}>{item.text.split("\n")[0]}</Text>
                          <Text style={styles.quoteSub}>{item.text.split("\n")[1]}</Text>
                          <View style={styles.quoteDivider} />
                          <Text style={styles.quoteAmount}>{item.text.split("\n")[2]}</Text>
                          <Text style={styles.quoteMemo}>{item.text.split("\n")[3]}</Text>
                          <Text style={styles.quoteSub}>{item.text.split("\n")[4]}</Text>
                        </View>
                      ) : (
                        <Text style={[styles.bubbleText, item.senderRole === "partner" && styles.bubbleTextMine]}>
                          {item.text}
                        </Text>
                      )
                    ) : null}
                    {item.imageUrls?.length ? (
                      <View style={styles.imageGrid}>
                        {item.imageUrls.map((url, index) => (
                          <TouchableOpacity
                            key={`${url}-${index}`}
                            onPress={() => setPreviewUrl(url)}
                            activeOpacity={0.9}
                          >
                            <Image source={{ uri: url }} style={styles.imageItem} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                      </View>
                      <Text style={styles.bubbleTime}>
                        {item.createdAt ? formatChatTime(item.createdAt as never) : LABELS.messages.justNow}
                      </Text>
                    </View>
                  </>
                );
              }}
            />

            {/* ✅ 하단 컴포저 래퍼: Safe Area 한 번에 처리 */}
            <View style={[styles.composerWrapper, { paddingBottom: insets.bottom }]}>
              {/* 입력바 */}
              <View style={styles.inputBar}>
                <TouchableOpacity
                  onPress={handleSendImages}
                  style={[styles.attachBtn, (ensuring || uploadingImages || !chatId) && styles.attachBtnDisabled]}
                  disabled={ensuring || uploadingImages || !chatId}
                >
                  <Text style={styles.attachText}>사진</Text>
                </TouchableOpacity>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="메시지를 입력하세요"
                  style={styles.input}
                  returnKeyType="send"
                  onSubmitEditing={onSend}
                  editable={!!chatId && !ensuring && !uploadingImages}
                  onFocus={() => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))}
                />
                <TouchableOpacity
                  onPress={onSend}
                  style={[styles.sendBtn, (!chatId || ensuring || uploadingImages) && styles.sendBtnDisabled]}
                  activeOpacity={0.85}
                  disabled={!chatId || ensuring || uploadingImages}
                >
                  <Text style={styles.sendText}>{LABELS.actions.send}</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      <Modal visible={!!previewUrl} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
        <View style={styles.previewBackdrop}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewUrl(null)}>
            <Text style={styles.previewCloseText}>닫기</Text>
          </TouchableOpacity>
          {previewUrl ? (
            <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      <QuoteFormModal
        visible={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        onSubmit={handleSubmitQuote}
        initialItems={myQuote?.items}
        initialMemo={myQuote?.memo ?? ""}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    height: 56,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  backBtn: { width: 52, height: 36, alignItems: "flex-start", justifyContent: "center" },
  backText: { color: colors.text, fontWeight: "700" },
  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: colors.text },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerQuoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 6,
    gap: spacing.xs,
  },
  headerQuoteBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  callBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  callBtnDisabled: { opacity: 0.4 },
  callText: { color: colors.primary, fontWeight: "800" },

  loadingBox: { padding: spacing.md, alignItems: "center" },
  loadingText: { color: colors.subtext, fontSize: 13 },

  error: { color: colors.danger, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },

  list: {
    padding: spacing.md,
    gap: spacing.sm,
    // ✅ 입력바가 아래에 별도 존재하므로, 리스트에 추가 paddingBottom 크게 주지 않음
    paddingBottom: spacing.md,
  },

  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs, maxWidth: "100%" },
  messageRowMine: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  messageRowOther: { alignSelf: "flex-start" },
  bubble: {
    maxWidth: "80%",
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
  },
  bubbleMine: {
    backgroundColor: "#F2E5D5",
    borderWidth: 1,
    borderColor: "#E3CDB8",
  },
  bubbleOther: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.text },
  bubbleTextMine: { color: "#111827" },
  imageGrid: { marginTop: spacing.xs, flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  imageItem: { width: 160, height: 120, borderRadius: 12, backgroundColor: colors.card },

  quoteCard: {
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quoteGreeting: { fontSize: 13, fontWeight: "700", color: colors.text },
  quoteSub: { marginTop: spacing.xs, color: colors.subtext, lineHeight: 18 },
  quoteDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  quoteAmount: { fontSize: 16, fontWeight: "800", color: colors.text },
  quoteMemo: { marginTop: spacing.xs, color: colors.text, lineHeight: 18 },

  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  previewImage: { width: "100%", height: "80%" },
  previewClose: {
    position: "absolute",
    top: spacing.lg,
    right: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  previewCloseText: { color: "#FFFFFF", fontWeight: "700" },
  bubbleTime: { marginTop: 4, color: colors.subtext, fontSize: 11 },
  dateSeparator: {
    alignSelf: "center",
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateSeparatorText: { color: colors.subtext, fontSize: 11, fontWeight: "600" },

  composerWrapper: {
    backgroundColor: colors.card,
  },
  inputBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  attachBtn: {
    height: INPUT_HEIGHT,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  attachBtnDisabled: { opacity: 0.5 },
  attachText: { color: colors.text, fontWeight: "700" },
  input: {
    flex: 1,
    height: INPUT_HEIGHT,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bg,
  },
  sendBtn: {
    height: INPUT_HEIGHT,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: "#FFFFFF", fontWeight: "800" },

});
