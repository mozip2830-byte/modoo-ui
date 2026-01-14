import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  ensureChatDoc,
  sendMessage,
  subscribeMessages,
  updateChatRead } from "@/src/actions/chatActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { MessageDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { LABELS } from "@/src/constants/labels";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

export default function PartnerChatRoomScreen() {
  const router = useRouter();
  const { id, requestId } = useLocalSearchParams<{ id: string; requestId?: string }>();
  const initialChatId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);
  const partnerId = useAuthUid();

  const [chatId, setChatId] = useState<string | null>(initialChatId ?? null);
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId) {
      setError(LABELS.messages.loginRequired);
      return;
    }

    if (!requestId) {
      if (!initialChatId) {
        setError("채팅 ID가 없습니다.");
      }
      return;
    }

    ensureChatDoc({ requestId, role: "partner", uid: partnerId, partnerId })
      .then((nextChatId) => {
        setChatId(nextChatId);
        setError(null);
      })
      .catch((err) => {
        console.error("[partner][chat] ensure error", err);
        setError(err instanceof Error ? err.message : LABELS.messages.errorOpenChat);
      });
  }, [initialChatId, partnerId, requestId]);

  useEffect(() => {
    if (!chatId) return;

    const unsub = subscribeMessages(
      chatId,
      (msgs) => {
        setMessages(msgs);
      },
      (err) => {
        console.error("[partner][messages] onSnapshot error", err);
        setError(LABELS.messages.errorLoadChats);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !partnerId) return;
    updateChatRead({ chatId, role: "partner" }).catch((err) => {
      console.error("[partner][chat] read update error", err);
    });
  }, [chatId, partnerId]);

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
        text: trimmed });
    } catch (err) {
      console.error("[partner][messages] send error", err);
      setError("메시지를 보내지 못했습니다.");
    }
  };

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{LABELS.actions.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{LABELS.headers.chats}</Text>
        <View style={{ width: 52 }} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.senderRole === "partner" ? styles.bubbleMine : styles.bubbleOther,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                item.senderRole === "partner" && styles.bubbleTextMine,
              ]}
            >
              {item.text}
            </Text>
            <Text style={styles.bubbleTime}>
              {item.createdAt ? formatTimestamp(item.createdAt as never) : LABELS.messages.justNow}
            </Text>
          </View>
        )}
      />

      <View style={styles.inputBar}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="메시지를 입력하세요"
          style={styles.input}
        />
        <TouchableOpacity onPress={onSend} style={styles.sendBtn}>
          <Text style={styles.sendText}>{LABELS.actions.send}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 56,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card },
  backBtn: {
    width: 52,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center" },
  backText: { color: colors.text, fontWeight: "700" },
  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: colors.text },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  bubble: {
    maxWidth: "80%",
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 16 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.primary },
  bubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border },
  bubbleText: { color: colors.text },
  bubbleTextMine: { color: "#FFFFFF" },
  bubbleTime: { marginTop: 4, color: colors.subtext, fontSize: 11 },
  inputBar: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg },
  sendBtn: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center" },
  sendText: { color: "#FFFFFF", fontWeight: "800" },
  error: { color: colors.danger, paddingHorizontal: spacing.md, paddingVertical: spacing.sm } });
