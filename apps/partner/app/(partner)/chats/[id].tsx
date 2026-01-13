import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  markChatRead,
  markMessageDeleted,
  sendImageMessage,
  sendMessage,
  setChatHidden,
  subscribeMessages,
} from "@/src/actions/chatActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { MessageDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";

export default function PartnerChatRoomScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);
  const partnerId = useAuthUid();

  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sendingImage, setSendingImage] = useState(false);

  useEffect(() => {
    if (!chatId) return;

    const unsub = subscribeMessages(
      chatId,
      (msgs) => {
        setMessages(msgs);
        setError(null);
      },
      (err) => {
        console.error("[partner][messages] onSnapshot error", err);
        setError("Unable to load messages.");
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    markChatRead({ chatId, role: "partner" }).catch((err) => {
      console.error("[partner][chats] mark read error", err);
    });
  }, [chatId]);

  const visibleMessages = useMemo(
    () => messages.filter((msg) => !msg.deletedForPartner),
    [messages]
  );

  const onSend = async () => {
    if (!chatId || !partnerId) return;
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
    } catch (err) {
      console.error("[partner][messages] send error", err);
      setError("Unable to send message.");
    }
  };

  const onPickImage = async () => {
    if (!chatId || !partnerId || sendingImage) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];

    // ImagePicker asset can include fileSize, but it's not guaranteed on all platforms.
    let sizeBytes: number | undefined =
      typeof asset.fileSize === "number" ? asset.fileSize : undefined;

    if (!sizeBytes) {
      // Ask FileSystem for size and safely handle the union return type.
      const info = await FileSystem.getInfoAsync(asset.uri);
if (info.exists && "size" in info) {
  sizeBytes = typeof (info as any).size === "number" ? (info as any).size : undefined;
}

    }

    setSendingImage(true);
    try {
      await sendImageMessage({
        chatId,
        senderRole: "partner",
        senderId: partnerId,
        uri: asset.uri,
        mimeType: asset.mimeType ?? undefined,
        sizeBytes,
      });
    } catch (err) {
      console.error("[partner][messages] image send error", err);
      setError("Unable to send image.");
    } finally {
      setSendingImage(false);
    }
  };

  const onDeleteMessage = (messageId: string) => {
    if (!chatId) return;
    Alert.alert("Delete", "Delete this message for you?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          markMessageDeleted({ chatId, messageId, role: "partner" }).catch(
            (err) => {
              console.error("[partner][messages] delete error", err);
            }
          ),
      },
    ]);
  };

  const onHideChat = () => {
    if (!chatId) return;
    Alert.alert("Hide chat", "Hide this chat from your list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Hide",
        style: "destructive",
        onPress: () =>
          setChatHidden({ chatId, role: "partner", hidden: true })
            .then(() => router.back())
            .catch((err) => {
              console.error("[partner][chats] hide error", err);
              setError("Unable to hide chat.");
            }),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat</Text>
        <TouchableOpacity onPress={onHideChat} style={styles.hideBtn}>
          <Text style={styles.hideText}>Hide</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={visibleMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            onLongPress={() => onDeleteMessage(item.id)}
            activeOpacity={0.9}
            style={[
              styles.bubble,
              item.senderRole === "partner"
                ? styles.bubbleMine
                : styles.bubbleOther,
            ]}
          >
            {item.type === "image" && item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.image} />
            ) : (
              <Text
                style={[
                  styles.bubbleText,
                  item.senderRole === "partner" && styles.bubbleTextMine,
                ]}
              >
                {item.text}
              </Text>
            )}
            <Text style={styles.bubbleTime}>
              {item.createdAt ? formatTimestamp(item.createdAt as never) : "Just now"}
            </Text>
          </TouchableOpacity>
        )}
      />

      <View style={styles.inputBar}>
        <TouchableOpacity
          onPress={onPickImage}
          style={[styles.attachBtn, sendingImage && styles.attachBtnDisabled]}
          disabled={sendingImage}
        >
          <Text style={styles.attachText}>{sendingImage ? "..." : "+"}</Text>
        </TouchableOpacity>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type a message"
          style={styles.input}
        />
        <TouchableOpacity onPress={onSend} style={styles.sendBtn}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 52,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backText: { color: "#111827", fontWeight: "700" },
  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: "#111827" },
  hideBtn: { width: 52, alignItems: "flex-end" },
  hideText: { color: "#111827", fontWeight: "700" },
  list: { padding: 12, gap: 10 },
  bubble: {
    maxWidth: "80%",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: "#111827" },
  bubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  bubbleText: { color: "#111827" },
  bubbleTextMine: { color: "#FFFFFF" },
  bubbleTime: { marginTop: 4, color: "#6B7280", fontSize: 11 },
  image: { width: 200, height: 200, borderRadius: 12 },
  inputBar: {
    flexDirection: "row",
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  attachBtn: {
    width: 40,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtnDisabled: { opacity: 0.6 },
  attachText: { fontSize: 20, fontWeight: "700" },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
  },
  sendBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: "#FFFFFF", fontWeight: "800" },
  error: { color: "#DC2626", paddingHorizontal: 12, paddingVertical: 6 },
});
