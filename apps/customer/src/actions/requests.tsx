import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { subscribeMyRequests } from "@/src/actions/requestActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { RequestDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

export default function CustomerRequestsScreen() {
  const router = useRouter();
  const { uid } = useAuthUid();
  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    const unsub = subscribeMyRequests(
      uid,
      (data) => {
        setRequests(data);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load requests", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid]);

  const handlePress = (id: string) => {
    // 요청 상세 페이지로 이동
    router.push(`/(customer)/requests/${id}` as any);
  };

  const renderItem = ({ item }: { item: RequestDoc }) => {
    // 마감 여부 판단
    const isClosed = item.isClosed || item.status === "closed";
    const statusLabel = isClosed ? LABELS.status.closed : LABELS.status.open;
    const statusTone = isClosed ? "gray" : "success";

    return (
      <TouchableOpacity onPress={() => handlePress(item.id)} activeOpacity={0.7}>
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {item.serviceType}
              {item.serviceSubType ? ` / ${item.serviceSubType}` : ""}
            </Text>
            <Chip label={statusLabel} tone={statusTone} />
          </View>
          
          <Text style={styles.address} numberOfLines={1}>
            {item.addressRoad ?? item.addressDong ?? "주소 미입력"}
          </Text>
          
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              견적 {item.quoteCount ?? 0}건
            </Text>
            <Text style={styles.date}>
              {item.createdAt ? formatTimestamp(item.createdAt as any) : "방금"}
            </Text>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <Screen style={styles.container}>
      <AppHeader title="내 요청 관리" />
      
      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>{LABELS.messages.loading}</Text>
        </View>
      ) : requests.length === 0 ? (
        <EmptyState 
          title={LABELS.messages.noRequests} 
          description={`현재 로그인된 계정(${uid ? "연동됨" : "UID 없음"})으로 작성된 요청이 없습니다.`} 
        />
      ) : (
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: colors.subtext },
  listContent: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.xs },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  address: { fontSize: 14, color: colors.subtext },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  meta: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  date: { fontSize: 12, color: colors.subtext },
});