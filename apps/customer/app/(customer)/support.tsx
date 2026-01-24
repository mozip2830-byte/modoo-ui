import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";

const FAQS = [
  {
    q: "견적 요청은 어떤 순서로 진행되나요?",
    a: "요청을 등록하면 파트너가 확인 후 견적을 보내드립니다.",
  },
  {
    q: "채팅 기록은 어디서 확인하나요?",
    a: "채팅 탭에서 최신 대화를 확인할 수 있습니다.",
  },
  {
    q: "요청을 취소할 수 있나요?",
    a: "요청 상세 화면에서 상태를 변경해 취소할 수 있습니다.",
  },
];

export default function CustomerSupportScreen() {
  const router = useRouter();

  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="고객지원" subtitle="문의하신 내용을 빠르게 도와드립니다." />
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>자주 묻는 질문</Text>
        <View style={styles.faqList}>
          {FAQS.map((item) => (
            <View key={item.q} style={styles.faqItem}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Text style={styles.faqA}>{item.a}</Text>
            </View>
          ))}
        </View>
        <SecondaryButton label="자주 묻는 질문" onPress={() => router.push("/(customer)/support/faq")} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>문의하기</Text>
        <Text style={styles.desc}>운영시간: 평일 10:00 ~ 18:00 (점심 12:00 ~ 13:00)</Text>
        <PrimaryButton label="1:1 문의 남기기" onPress={() => router.push("/(customer)/support/inquiry")} />
        <SecondaryButton label="문의 내역 보기" onPress={() => router.push("/(customer)/support/history")} />
        <SecondaryButton label="공지사항" onPress={() => router.push("/(customer)/support/notices")} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { gap: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  desc: { fontSize: 12, color: colors.subtext },
  faqList: { gap: spacing.sm },
  faqItem: { gap: 4 },
  faqQ: { fontSize: 13, fontWeight: "700", color: colors.text },
  faqA: { fontSize: 12, color: colors.subtext },
});
