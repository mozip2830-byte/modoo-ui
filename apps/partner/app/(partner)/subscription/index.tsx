import { useState } from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { colors, spacing } from "@/src/ui/tokens";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { usePartnerEntitlement } from "@/src/lib/usePartnerEntitlement";
import { updateSubscriptionSettings } from "@/src/actions/partnerActions";
import { Screen } from "@/src/components/Screen";

const PAY_METHODS: Array<"kakaopay" | "card" | "bank" | "toss"> = [
  "kakaopay",
  "card",
  "bank",
  "toss",
];

export default function SubscriptionManageScreen() {
  const { uid: partnerId } = useAuthUid();
  // SSOT: partnerUsers에서 구독 상태 읽기
  const { partnerUser, subscriptionActive } = usePartnerEntitlement(partnerId);
  const [saving, setSaving] = useState(false);
  const [autoRenew, setAutoRenew] = useState(false);
  const [provider, setProvider] = useState<"kakaopay" | "card" | "bank" | "toss">("kakaopay");

  const handleToggle = async (value: boolean) => {
    if (!partnerId) return;
    setSaving(true);
    try {
      await updateSubscriptionSettings({ partnerId, autoRenew: value });
      setAutoRenew(value);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeProvider = async (method: "kakaopay" | "card" | "bank" | "toss") => {
    if (!partnerId) return;
    setSaving(true);
    try {
      await updateSubscriptionSettings({ partnerId, provider: method });
      setProvider(method);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll style={styles.container}>
      <AppHeader title="구독 관리" subtitle="구독 상태와 결제 수단을 관리해요." />
      <Card style={styles.card}>
        <CardRow>
          <Text style={styles.label}>상태</Text>
          <Chip label={subscriptionActive ? "활성" : "비활성"} tone={subscriptionActive ? "success" : "warning"} />
        </CardRow>
        <Text style={styles.meta}>플랜: {partnerUser?.subscriptionPlan ?? "-"}</Text>
        <Text style={styles.meta}>
          구독 상태: {partnerUser?.subscriptionStatus ?? "none"}
        </Text>
      </Card>

      <Card style={styles.card}>
        <CardRow>
          <Text style={styles.label}>자동 갱신</Text>
          <Switch
            value={autoRenew}
            onValueChange={handleToggle}
            disabled={saving}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </CardRow>
        <Text style={styles.meta}>자동 갱신은 결제일에 구독이 연장됩니다.</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.label}>결제 수단</Text>
        <View style={styles.methodRow}>
          {PAY_METHODS.map((method) => (
            <TouchableOpacity
              key={method}
              style={[styles.methodChip, provider === method && styles.methodChipActive]}
              onPress={() => handleChangeProvider(method)}
              disabled={saving}
            >
              <Text style={[styles.methodText, provider === method && styles.methodTextActive]}>
                {method === "kakaopay"
                  ? "카카오페이"
                  : method === "card"
                  ? "신용카드"
                  : method === "bank"
                  ? "계좌이체"
                  : "토스"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  label: { fontWeight: "700", color: colors.text },
  meta: { color: colors.subtext, fontSize: 12 },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  methodChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  methodTextActive: { color: "#FFFFFF" },
});
