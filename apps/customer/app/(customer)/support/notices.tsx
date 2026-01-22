import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { colors, spacing } from "@/src/ui/tokens";

const NOTICES = [
  { title: "서비스 점검 안내", date: "2026-01-20", body: "일시적으로 서비스 점검이 진행됩니다." },
  { title: "새로운 파트너 등록 정책", date: "2026-01-15", body: "파트너 승인 절차가 개선됩니다." },
];

export default function CustomerNoticesScreen() {
  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="공지사항" subtitle="서비스 안내를 확인하세요." />
      <Card style={styles.card}>
        {NOTICES.map((notice) => (
          <View key={notice.title} style={styles.noticeItem}>
            <Text style={styles.noticeTitle}>{notice.title}</Text>
            <Text style={styles.noticeDate}>{notice.date}</Text>
            <Text style={styles.noticeBody}>{notice.body}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { gap: spacing.md },
  noticeItem: { gap: 6 },
  noticeTitle: { fontWeight: "700", color: colors.text },
  noticeDate: { color: colors.subtext, fontSize: 12 },
  noticeBody: { color: colors.text, fontSize: 13, lineHeight: 18 },
});
