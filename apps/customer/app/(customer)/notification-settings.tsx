import { StyleSheet, Switch, Text, View } from "react-native";
import { useState } from "react";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { colors, spacing } from "@/src/ui/tokens";

export default function NotificationSettingsScreen() {
  const [allEnabled, setAllEnabled] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [quoteEnabled, setQuoteEnabled] = useState(true);
  const [marketingEnabled, setMarketingEnabled] = useState(false);

  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="알림 설정" subtitle="알림 수신을 관리하세요." />
      <Card style={styles.card}>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>전체 알림</Text>
            <Text style={styles.desc}>모든 알림을 한 번에 켜거나 끕니다.</Text>
          </View>
          <Switch value={allEnabled} onValueChange={setAllEnabled} />
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>채팅 알림</Text>
            <Text style={styles.desc}>새 메시지 수신 알림</Text>
          </View>
          <Switch value={chatEnabled} onValueChange={setChatEnabled} />
        </View>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>견적 알림</Text>
            <Text style={styles.desc}>새 견적 도착 알림</Text>
          </View>
          <Switch value={quoteEnabled} onValueChange={setQuoteEnabled} />
        </View>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>마케팅 알림</Text>
            <Text style={styles.desc}>프로모션 및 이벤트 소식</Text>
          </View>
          <Switch value={marketingEnabled} onValueChange={setMarketingEnabled} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { gap: spacing.md },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  label: { fontSize: 14, fontWeight: "700", color: colors.text },
  desc: { marginTop: 2, fontSize: 12, color: colors.subtext },
});
