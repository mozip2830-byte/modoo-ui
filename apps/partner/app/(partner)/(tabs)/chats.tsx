import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity
} from "react-native";

type Room = {
  id: string;
  title: string;
  lastMessage: string;
};

export default function PartnerChatsScreen() {
  const router = useRouter();

  // ✅ 지금은 껍데기: 더미 데이터
  const [rooms] = useState<Room[]>([
    { id: "room_1", title: "고객A - 주방수리", lastMessage: "견적 확인 부탁드려요" },
    { id: "room_2", title: "고객B - 입주청소", lastMessage: "가능 날짜가 언제인가요?" },
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>채팅</Text>

      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/chats/${item.id}`)}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.lastMessage}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>채팅이 없습니다.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 12, color: "#111827" },
  list: { gap: 12 },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  cardMeta: { marginTop: 6, color: "#6B7280" },
  empty: { color: "#6B7280", paddingVertical: 12 },
});
