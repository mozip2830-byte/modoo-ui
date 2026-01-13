import { useRouter } from "expo-router";
import { useMemo } from "react";
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity } from "react-native";

type RequestItem = {
  id: string;
  title: string;
  location: string;
  budget: number;
  createdAtText: string;
};

export default function PartnerRequestsTab() {
  const router = useRouter();

  const items = useMemo<RequestItem[]>(
    () => [
      { id: "req_001", title: "주방 수리", location: "서울 강서구", budget: 120000, createdAtText: "2026. 1. 13. 오전 9:00" },
      { id: "req_002", title: "거실 도배", location: "인천 부평구", budget: 200000, createdAtText: "2026. 1. 13. 오전 8:30" },
      { id: "req_003", title: "욕실 누수", location: "경기 김포", budget: 150000, createdAtText: "2026. 1. 13. 오전 8:10" },
    ],
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>요청 목록</Text>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/(partner)/requests/${item.id}`)}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMeta}>{item.location}</Text>
            <Text style={styles.cardMeta}>예산: {item.budget.toLocaleString()}원</Text>
            <Text style={styles.cardMeta}>{item.createdAtText}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  list: { gap: 12, paddingBottom: 24 },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardMeta: { marginTop: 6, color: "#6B7280" },
});
