import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { colors, radius, spacing } from "@/src/ui/tokens";

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.rowCard}>
        <View style={styles.rowLeft}>
          <View style={styles.iconWrap}>
            <FontAwesome name={icon} size={18} color={colors.text} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.rowTitle}>{title}</Text>
            <Text style={styles.rowSub}>{subtitle}</Text>
          </View>
        </View>
        <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
      </Card>
    </TouchableOpacity>
  );
}

export default function PartnerSupportTab() {
  const comingSoon = (feature: string) => {
    Alert.alert("준비중", `${feature} 기능은 곧 추가됩니다.`);
  };

  return (
    <Screen>
      <AppHeader title="고객센터" subtitle="도움이 필요하신가요?" />

      <View style={styles.container}>
        <Text style={styles.sectionTitle}>바로가기</Text>

        <MenuRow
          icon="envelope-o"
          title="문의하기"
          subtitle="1:1 문의 / 답변 확인"
          onPress={() => comingSoon("문의하기")}
        />
        <MenuRow
          icon="bullhorn"
          title="공지사항"
          subtitle="업데이트 및 중요 안내"
          onPress={() => comingSoon("공지사항")}
        />
        <MenuRow
          icon="question-circle-o"
          title="자주 묻는 질문"
          subtitle="가입/견적/정산/구독"
          onPress={() => comingSoon("자주 묻는 질문")}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>콘텐츠는 추후 추가 예정입니다.</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.subtext,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  rowCard: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  rowSub: {
    color: colors.subtext,
    fontSize: 12,
  },
  footer: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  footerText: {
    color: colors.subtext,
    fontSize: 12,
  },
});
