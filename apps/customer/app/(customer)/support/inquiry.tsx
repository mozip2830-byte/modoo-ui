import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { colors, spacing } from "@/src/ui/tokens";

export default function CustomerInquiryScreen() {
  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="문의하기" subtitle="문의 접수 방법을 안내합니다." />
      <Card style={styles.card}>
        <Text style={styles.title}>1:1 문의 안내</Text>
        <Text style={styles.desc}>직접 문의 접수를 준비 중입니다. 개선되면 알려드릴게요.</Text>
        <Text style={styles.title}>영업시간</Text>
        <Text style={styles.desc}>평일 10:00 ~ 18:00 (점심 12:00 ~ 13:00)</Text>
        <Text style={styles.title}>이메일</Text>
        <Text style={styles.desc}>support@modoo.local</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { gap: spacing.md },
  title: { fontWeight: "700", color: colors.text },
  desc: { color: colors.subtext, fontSize: 12, lineHeight: 18 },
});
