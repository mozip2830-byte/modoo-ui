import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Msg = {
  id: string;
  text: string;
  mine?: boolean;
  createdAt: number;
};

export default function PartnerChatRoomScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();

  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { id: "1", text: "채팅 껍데기 화면입니다.", createdAt: Date.now() - 20000 },
    { id: "2", text: "여기서 Firestore 연동을 붙일 거예요.", mine: true, createdAt: Date.now() - 10000 },
  ]);

  const title = useMemo(() => {
    const v = Array.isArray(roomId) ? roomId[0] : roomId;
    return v ? `채팅방: ${v}` : "채팅방";
  }, [roomId]);

  const onSend = () => {
    const t = text.trim();
    if (!t) return;

    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), text: t, mine: true, createdAt: Date.now() },
    ]);
    setText("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 52 }} />
      </View>

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.mine ? styles.bubbleMine : styles.bubbleOther,
            ]}
          >
            <Text style={[styles.bubbleText, item.mine && styles.bubbleTextMine]}>
              {item.text}
            </Text>
          </View>
        )}
      />

      <View style={styles.inputBar}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="메시지 입력…"
          style={styles.input}
        />
        <TouchableOpacity onPress={onSend} style={styles.sendBtn}>
          <Text style={styles.sendText}>전송</Text>
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

  list: { padding: 12, gap: 10 },

  bubble: {
    maxWidth: "80%",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: "#111827" },
  bubbleOther: { alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB" },
  bubbleText: { color: "#111827" },
  bubbleTextMine: { color: "#FFFFFF" },

  inputBar: {
    flexDirection: "row",
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
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
});
