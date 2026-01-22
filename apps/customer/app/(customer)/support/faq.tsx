import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { colors, spacing } from "@/src/ui/tokens";

const FAQS = [
  { q: "견적 요청은 어떤 절차로 진행되나요?", a: "홈화면에서 요청을 만들고, 파트너들이 견적을 제출합니다." },
  { q: "채팅 기록은 어디서 확인하나요?", a: "채팅 탭에서 최신 대화를 확인할 수 있습니다." },
  { q: "요청을 취소할 수 있나요?", a: "요청 상세에서 상태를 변경하여 취소할 수 있습니다." },
];

export default function CustomerFaqScreen() {
  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="자주 묻는 질문" subtitle="바로 도움을 드리기 위한 정리입니다." />
      <Card style={styles.card}>
        {FAQS.map((item) => (
          <View key={item.q} style={styles.faqItem}>
            <Text style={styles.q}>{item.q}</Text>
            <Text style={styles.a}>{item.a}</Text>
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
  faqItem: { gap: 6 },
  q: { fontWeight: "700", color: colors.text },
  a: { color: colors.subtext, fontSize: 12, lineHeight: 18 },
});
