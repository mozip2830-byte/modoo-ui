import { useEffect, useMemo, useState } from "react";

import {

  FlatList,

  

  StyleSheet,

  Text,

  TextInput,

  TouchableOpacity,

  View,

} from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";



import {

  ensureChatDoc,

  sendMessage,

  subscribeMessages,

  updateChatRead,

} from "@/src/actions/chatActions";

import { useAuthUid } from "@/src/lib/useAuthUid";

import type { MessageDoc } from "@/src/types/models";

import { formatTimestamp } from "@/src/utils/time";

import { LABELS } from "@/src/constants/labels";

import { colors, radius, spacing } from "@/src/ui/tokens";

import { Screen } from "@/src/components/Screen";



export default function CustomerChatRoomScreen() {

  const router = useRouter();

  const { id, requestId, partnerId } = useLocalSearchParams<{

    id: string;

    requestId?: string;

    partnerId?: string;

  }>();

  const initialChatId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const customerId = useAuthUid();



  const [chatId, setChatId] = useState<string | null>(initialChatId ?? null);

  const [messages, setMessages] = useState<MessageDoc[]>([]);

  const [text, setText] = useState("");

  const [error, setError] = useState<string | null>(null);



  useEffect(() => {

    if (!customerId) {

      setError(LABELS.messages.loginRequired);

      return;

    }



    if (!requestId) {

      if (!initialChatId) {

        setError("梨꾪똿 ID媛� �뾾�뒿�땲�떎.");

      }

      return;

    }



    const partner = Array.isArray(partnerId) ? partnerId[0] : partnerId;

    ensureChatDoc({ requestId, role: "customer", uid: customerId, partnerId: partner ?? undefined })

      .then((nextChatId) => {

        setChatId(nextChatId);

        setError(null);

      })

      .catch((err) => {

        console.error("[customer][chat] ensure error", err);

        setError(err instanceof Error ? err.message : LABELS.messages.errorOpenChat);

      });

  }, [customerId, initialChatId, partnerId, requestId]);



  useEffect(() => {

    if (!chatId) return;



    const unsub = subscribeMessages(

      chatId,

      (msgs) => {

        setMessages(msgs);

      },

      (err) => {

        console.error("[customer][messages] onSnapshot error", err);

        setError(LABELS.messages.errorLoadChats);

      }

    );



    return () => {

      if (unsub) unsub();

    };

  }, [chatId]);



  useEffect(() => {

    if (!chatId || !customerId) return;

    updateChatRead({ chatId, role: "customer" }).catch((err) => {

      console.error("[customer][chat] read update error", err);

    });

  }, [chatId, customerId]);



  const onSend = async () => {

    if (!chatId || !customerId) {

      setError(LABELS.messages.loginRequired);

      return;

    }



    const trimmed = text.trim();

    if (!trimmed) return;



    setText("");

    try {

      await sendMessage({

        chatId,

        senderRole: "customer",

        senderId: customerId,

        text: trimmed,

      });

    } catch (err) {

      console.error("[customer][messages] send error", err);

      setError("硫붿떆吏�瑜� 蹂대궡吏� 紐삵뻽�뒿�땲�떎.");

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

              item.senderRole === "customer" ? styles.bubbleMine : styles.bubbleOther,

            ]}

          >

            <Text

              style={[

                styles.bubbleText,

                item.senderRole === "customer" && styles.bubbleTextMine,

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

          placeholder="硫붿떆吏�瑜� �엯�젰�븯�꽭�슂"

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

    paddingHorizontal: spacing.lg,

    flexDirection: "row",

    alignItems: "center",

    backgroundColor: colors.bg,

  },

  backBtn: {

    width: 52,

    height: 36,

    alignItems: "flex-start",

    justifyContent: "center",

  },

  backText: { color: colors.text, fontWeight: "700" },

  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: colors.text },

  list: { padding: spacing.lg, gap: spacing.sm },

  bubble: {

    maxWidth: "80%",

    paddingVertical: spacing.sm,

    paddingHorizontal: spacing.md,

    borderRadius: radius.lg,

  },

  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.primary },

  bubbleOther: {

    alignSelf: "flex-start",

    backgroundColor: colors.card,

  },

  bubbleText: { color: colors.text },

  bubbleTextMine: { color: "#FFFFFF" },

  bubbleTime: { marginTop: spacing.xs, color: colors.subtext, fontSize: 11 },

  inputBar: {

    flexDirection: "row",

    paddingHorizontal: spacing.lg,

    paddingVertical: spacing.md,

    gap: spacing.sm,

    backgroundColor: colors.card,

  },

  input: {

    flex: 1,

    height: 44,

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: 999,

    paddingHorizontal: spacing.md,

    backgroundColor: colors.bg,

  },

  sendBtn: {

    height: 44,

    paddingHorizontal: spacing.md,

    borderRadius: 999,

    backgroundColor: colors.primary,

    alignItems: "center",

    justifyContent: "center",

  },

  sendText: { color: "#FFFFFF", fontWeight: "800" },

  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },

});

