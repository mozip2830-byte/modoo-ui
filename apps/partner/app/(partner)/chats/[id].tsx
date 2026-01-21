import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ensureChatDoc, sendMessage, subscribeMessages, updateChatRead } from "@/src/actions/chatActions";
import { pickImages, uploadImage } from "@/src/actions/storageActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { autoRecompress } from "@/src/lib/imageCompress";
import type { MessageDoc } from "@/src/types/models";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

const INPUT_HEIGHT = 44;

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
          <View style={{ width: 52 }} />
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
              renderItem={({ item }) => (
                <View style={[styles.bubble, item.senderRole === "partner" ? styles.bubbleMine : styles.bubbleOther]}>
                  {item.text ? (
                    <Text style={[styles.bubbleText, item.senderRole === "partner" && styles.bubbleTextMine]}>
                      {item.text}
                    </Text>
                  ) : null}
                  {item.imageUrls?.length ? (
                    <View style={styles.imageGrid}>
                      {item.imageUrls.map((url, index) => (
                        <Image
                          key={`${url}-${index}`}
                          source={{ uri: url }}
                          style={styles.imageItem}
                        />
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.bubbleTime}>
                    {item.createdAt ? formatTimestamp(item.createdAt as never) : LABELS.messages.justNow}
                  </Text>
                </View>
              )}
            />

            {/* ✅ 입력바: absolute 제거(핵심). 레이아웃 흐름으로 두면 KAV가 “정확히” 올려줌 */}
            <View style={[styles.inputBar, { paddingBottom: insets.bottom }]}>
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
        </KeyboardAvoidingView>
      </View>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  backBtn: { width: 52, height: 36, alignItems: "flex-start", justifyContent: "center" },
  backText: { color: colors.text, fontWeight: "700" },
  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: colors.text },

  loadingBox: { padding: spacing.md, alignItems: "center" },
  loadingText: { color: colors.subtext, fontSize: 13 },

  error: { color: colors.danger, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },

  list: {
    padding: spacing.md,
    gap: spacing.sm,
    // ✅ 입력바가 아래에 별도 존재하므로, 리스트에 추가 paddingBottom 크게 주지 않음
    paddingBottom: spacing.md,
  },

  bubble: {
    maxWidth: "80%",
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
  },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.primary },
  bubbleOther: { alignSelf: "flex-start", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.text },
  bubbleTextMine: { color: "#FFFFFF" },
  imageGrid: { marginTop: spacing.xs, flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  imageItem: { width: 160, height: 120, borderRadius: 12, backgroundColor: colors.card },
  bubbleTime: { marginTop: 4, color: colors.subtext, fontSize: 11 },

  inputBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  attachBtn: {
    height: INPUT_HEIGHT,
    paddingHorizontal: spacing.md,
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
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
  },
  sendBtn: {
    height: INPUT_HEIGHT,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: "#FFFFFF", fontWeight: "800" },
});
