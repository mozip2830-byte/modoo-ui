import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { colors, spacing } from "@/src/ui/tokens";

const SAMPLE_REQUESTS = [
  {
    id: "REQ-240201",
    title: "거실+주방 부분 리모델링",
    location: "서울 강남구",
    status: "진행중",
    tone: "warning" as const,
  },
  {
    id: "REQ-240122",
    title: "입주 청소 견적",
    location: "경기 성남시",
    status: "완료",
    tone: "success" as const,
  },
  {
    id: "REQ-240115",
    title: "에어컨 분해 세척",
    location: "서울 마포구",
    status: "대기",
    tone: "default" as const,
  },
];

export default function RequestManagementScreen() {
  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="요청 관리" subtitle="요청 내역을 확인하세요." />
      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>진행중</Text>
          <Text style={styles.summaryValue}>1</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>완료</Text>
          <Text style={styles.summaryValue}>2</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>최근 요청</Text>
      <View style={styles.list}>
        {SAMPLE_REQUESTS.map((item) => (
          <Card key={item.id} style={styles.requestCard}>
            <View style={styles.requestHeader}>
              <Text style={styles.requestTitle}>{item.title}</Text>
              <Chip label={item.status} tone={item.tone} />
            </View>
            <Text style={styles.requestMeta}>{item.location}</Text>
            <Text style={styles.requestMeta}>요청 번호 {item.id}</Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  summaryRow: { flexDirection: "row", gap: spacing.sm },
  summaryCard: { flex: 1, alignItems: "center", gap: spacing.xs },
  summaryLabel: { fontSize: 12, color: colors.subtext },
  summaryValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  list: { gap: spacing.sm },
  requestCard: { gap: spacing.xs },
  requestHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  requestTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },
  requestMeta: { fontSize: 12, color: colors.subtext },
});
