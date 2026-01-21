// apps/customer/app/chats/[id].tsx
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
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { MessageDoc } from "@/src/types/models";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

const INPUT_HEIGHT = 44;

function resolveAuth(auth: unknown): { customerId: string | null; ready: boolean } {
  // 프로젝트마다 useAuthUid() 반환형이 달라질 수 있어 방어
  if (typeof auth === "string") return { customerId: auth, ready: true };
  if (auth && typeof auth === "object") {
    const uid = (auth as any).uid ?? null;
    const ready = (auth as any).ready ?? true;
    return { customerId: uid, ready: Boolean(ready) };
  }
  return { customerId: null, ready: false };
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

/**
 * ✅ FirebaseError 감지 및 로깅 헬퍼
 */
function isFirebaseError(err: unknown): err is { code: string; message: string } {
  return err != null && typeof err === "object" && "code" in err && "message" in err;
}

function logFirebaseError(tag: string, err: unknown, extra?: Record<string, unknown>) {
  if (isFirebaseError(err)) {
    console.error(`[customer][chatroom] ${tag}`, {
      code: err.code,
      message: err.message,
      ...extra,
    });
    return { code: err.code, message: err.message };
  }
  console.error(`[customer][chatroom] ${tag}`, { error: err, ...extra });
  return { code: "unknown", message: err instanceof Error ? err.message : String(err) };
}

export default function CustomerChatRoomScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // request 상세에서 push:
  // pathname: "/(customer)/chats/[id]"
  // params: { id: chatId, requestId, partnerId }
  const { id, requestId, partnerId } = useLocalSearchParams<{
    id: string;
    requestId?: string;
    partnerId?: string;
  }>();

  // ✅ params.id가 배열일 수 있으니 단일 문자열로 정규화
  const initialChatId = useMemo(() => (Array.isArray(id) ? id[0] : id) ?? null, [id]);

  const auth = useAuthUid();
  const { customerId, ready } = useMemo(() => resolveAuth(auth), [auth]);

  const { requestIdFromChat, partnerIdFromChat, customerIdFromChat } = useMemo(
    () => parseChatIdParts(initialChatId),
    [initialChatId]
  );

  const effectiveRequestId = useMemo(() => {
    const fromParam = Array.isArray(requestId) ? requestId[0] : requestId;
    return fromParam ?? requestIdFromChat ?? "";
  }, [requestId, requestIdFromChat]);

  const effectivePartnerId = useMemo(() => {
    const fromParam = Array.isArray(partnerId) ? partnerId[0] : partnerId;
    return fromParam ?? partnerIdFromChat ?? "";
  }, [partnerId, partnerIdFromChat]);

  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState(false);
  // ✅ permission-denied 전용 상태 (subscribeMessages 실패 시 UX 분리)
  const [permissionError, setPermissionError] = useState(false);

  const listRef = useRef<FlatList<MessageDoc>>(null);

  // 키보드 show/hide 시 아래로
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

  /**
   * ✅ 1) chatId 확정 로직
   * - 가장 안전: params로 id(chatId)가 오면 ensureChatDoc 재호출하지 않고 그대로 사용
   * - fallback: id가 없고 requestId/partnerId만 있을 때만 ensureChatDoc(role=customer)
   */
  useEffect(() => {
    // 로그인 준비 전엔 아무 것도 하지 않음 (permission-denied 방지)
    if (!ready) {
      console.log("[customer][chatroom] waiting for auth ready...");
      return;
    }

    if (!customerId) {
      console.log("[customer][chatroom] no customerId, showing login required");
      setError(LABELS.messages.loginRequired);
      return;
    }

    // ✅ chatId가 없으면 early return + 안내
    if (!initialChatId && !effectiveRequestId) {
      console.log("[customer][chatroom] no chatId or requestId, cannot proceed");
      setError("채팅 정보를 찾을 수 없습니다. (chatId/requestId 누락)");
      setChatId(null);
      return;
    }

    // 1) chatId가 param으로 온 경우: 그대로 사용 (재호출 금지)
    if (initialChatId) {
      console.log("[customer][chatroom] using initialChatId from params", { initialChatId });

      // chatId에 들어있는 customerId가 현재 로그인 customerId와 다르면 차단(데이터 꼬임 방지)
      if (customerIdFromChat && customerIdFromChat !== customerId) {
        console.error("[customer][chatroom] customerId mismatch", {
          customerIdFromChat,
          customerId,
        });
        setError("로그인 계정과 채팅방 고객 정보가 일치하지 않습니다. 다시 로그인해 주세요.");
        setChatId(null);
        return;
      }

      // partnerId param이 있고, chatId 파싱 값과 다르면 경고(치명적이면 차단 가능)
      if (effectivePartnerId && partnerIdFromChat && effectivePartnerId !== partnerIdFromChat) {
        console.warn("[customer][chatroom] partnerId mismatch (warning only)", {
          effectivePartnerId,
          partnerIdFromChat,
          chatId: initialChatId,
        });
      }

      setError(null);
      setPermissionError(false);
      setChatId(initialChatId);
      return;
    }

    // 2) fallback: chatId가 없으면 requestId + partnerId로 생성 시도
    if (!effectiveRequestId || !effectivePartnerId) {
      console.log("[customer][chatroom] missing requestId or partnerId for fallback ensure");
      setError("채팅 정보를 찾을 수 없습니다. (requestId/partnerId 누락)");
      setChatId(null);
      return;
    }

    console.log("[customer][chatroom] fallback: calling ensureChatDoc", {
      effectiveRequestId,
      effectivePartnerId,
      customerId,
    });

    setEnsuring(true);
    setError(null);
    setPermissionError(false);

    ensureChatDoc({
      requestId: effectiveRequestId,
      role: "customer",
      uid: customerId,
      partnerId: effectivePartnerId,
      customerId, // 명시해도 안전
    })
      .then((nextChatId) => {
        console.log("[customer][chatroom] ensureChatDoc success", { nextChatId });
        setChatId(nextChatId);
        setError(null);
      })
      .catch((err) => {
        const { code, message } = logFirebaseError("ensureChatDoc error", err, {
          effectiveRequestId,
          effectivePartnerId,
          customerId,
        });
        if (code === "permission-denied") {
          setError("채팅방 생성 권한이 없습니다. 로그인 상태와 요청 소유권을 확인해 주세요.");
          setPermissionError(true);
        } else {
          setError(message || LABELS.messages.errorOpenChat);
        }
        setChatId(null);
      })
      .finally(() => setEnsuring(false));
  }, [
    ready,
    customerId,
    initialChatId,
    effectiveRequestId,
    effectivePartnerId,
    customerIdFromChat,
    partnerIdFromChat,
  ]);

  /**
   * ✅ 2) 메시지 구독
   * - chatId + ready + customerId 가드 필수
   * - permission-denied 시 사용자에게 안내 문구 표시
   */
  useEffect(() => {
    if (!chatId || !ready || !customerId) {
      console.log("[customer][chatroom] subscribeMessages skipped (missing deps)", {
        chatId,
        ready,
        customerId,
      });
      return;
    }

    console.log("[customer][chatroom] subscribeMessages start", { chatId, customerId });

    const unsub = subscribeMessages(
      chatId,
      (msgs) => {
        console.log("[customer][chatroom] subscribeMessages onData", { count: msgs.length });
        setMessages(msgs);
        setPermissionError(false); // 성공하면 permission error 해제
        // 구독 성공하면 에러 클리어 (updateChatRead 실패 에러는 유지하지 않음)
        setError(null);
      },
      (err) => {
        const { code, message } = logFirebaseError("subscribeMessages error", err, {
          chatId,
          customerId,
        });

        if (code === "permission-denied") {
          setPermissionError(true);
          setError("권한 문제로 메시지를 불러올 수 없습니다. 로그인 상태와 요청 소유권을 확인해 주세요.");
        } else {
          setError(message || LABELS.messages.errorLoadChats);
        }
        // ✅ 무한 재시도/루프 방지: 에러 시 메시지 비우고 그대로 둠
      }
    );

    return () => {
      console.log("[customer][chatroom] subscribeMessages cleanup", { chatId });
      unsub?.();
    };
  }, [chatId, ready, customerId]);

  /**
   * ✅ 3) 읽음 처리
   * - chatId + ready + customerId 가드 필수
   * - permission-denied면 에러 로그만 찍고 화면은 계속 열리게 함 (throw 금지)
   */
  useEffect(() => {
    if (!chatId || !ready || !customerId) return;

    console.log("[customer][chatroom] updateChatRead start", { chatId, customerId });

    updateChatRead({ chatId, role: "customer" })
      .then(() => {
        console.log("[customer][chatroom] updateChatRead success", { chatId });
      })
      .catch((err) => {
        // ✅ permission-denied면 에러 로그만 찍고 UX는 막지 않음
        const { code } = logFirebaseError("updateChatRead error", err, { chatId, customerId });
        if (code === "permission-denied") {
          console.warn("[customer][chatroom] updateChatRead permission-denied (ignored for UX)");
        }
        // 읽음 실패는 UX상 치명적이지 않아서 화면 막지 않음 (setError 호출 안 함)
      });
  }, [chatId, ready, customerId]);

  // 새 메시지 오면 아래로
  useEffect(() => {
    if (!messages.length) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const onSend = async () => {
    if (!ready) {
      setError("로그인 정보를 확인 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!chatId || !customerId) {
      setError(LABELS.messages.loginRequired);
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setText("");

    console.log("[customer][chatroom] sendMessage start", { chatId, customerId, textLength: trimmed.length });

    try {
      await sendMessage({
        chatId,
        senderRole: "customer",
        senderId: customerId,
        text: trimmed,
      });
      console.log("[customer][chatroom] sendMessage success", { chatId });
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      const { code, message } = logFirebaseError("sendMessage error", err, { chatId, customerId });
      if (code === "permission-denied") {
        setError("메시지 전송 권한이 없습니다. 로그인 상태를 확인해 주세요.");
      } else {
        setError(message || "메시지를 보내지 못했습니다.");
      }
    }
  };

  const sendDisabled = !ready || ensuring || !chatId || !customerId || permissionError;

  return (
    <Screen
      scroll={false}
      keyboardAvoiding={false} // Screen 내부 KAV 끄기(이중 보정/공백 방지)
      edges={["top"]}
      style={styles.container}
    >
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{LABELS.actions.back}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{LABELS.headers.chats}</Text>
          <View style={{ width: 52 }} />
        </View>

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

            {!ready ? <Text style={styles.mutedInline}>로그인 정보를 확인 중입니다…</Text> : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {/* ✅ permission-denied 전용 안내 (추가 정보 제공) */}
            {permissionError && !ensuring ? (
              <View style={styles.permissionBox}>
                <Text style={styles.permissionText}>
                  권한 문제가 발생했습니다. 다음을 확인해 주세요:
                </Text>
                <Text style={styles.permissionHint}>• 로그인 상태가 유효한지</Text>
                <Text style={styles.permissionHint}>• 본인의 요청에 대한 채팅인지</Text>
                <Text style={styles.permissionHint}>• 견적이 정상적으로 등록되었는지</Text>
              </View>
            ) : null}

            <FlatList
              ref={listRef}
              style={styles.flex}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.bubble,
                    item.senderRole === "customer" ? styles.bubbleMine : styles.bubbleOther,
                  ]}
                >
                  {item.text ? (
                    <Text style={[styles.bubbleText, item.senderRole === "customer" && styles.bubbleTextMine]}>
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
              ListEmptyComponent={
                !ensuring && !permissionError && chatId ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>아직 메시지가 없습니다.</Text>
                    <Text style={styles.emptyHint}>첫 메시지를 보내보세요!</Text>
                  </View>
                ) : null
              }
            />

            <View style={[styles.inputBar, { paddingBottom: insets.bottom }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={permissionError ? "권한 문제로 입력 불가" : "메시지를 입력하세요"}
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={onSend}
                editable={!sendDisabled}
                onFocus={() => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))}
              />
              <TouchableOpacity
                onPress={onSend}
                style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
                activeOpacity={0.85}
                disabled={sendDisabled}
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
  mutedInline: { color: colors.subtext, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },

  // ✅ permission-denied 전용 스타일
  permissionBox: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: spacing.md,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  permissionText: {
    color: colors.danger,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  permissionHint: {
    color: colors.text,
    fontSize: 13,
    marginLeft: spacing.xs,
  },

  // ✅ 빈 메시지 안내
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyHint: {
    color: colors.subtext,
    fontSize: 12,
    marginTop: spacing.xs,
  },

  list: {
    padding: spacing.md,
    gap: spacing.sm,
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
