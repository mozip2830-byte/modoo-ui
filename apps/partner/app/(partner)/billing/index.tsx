import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { Chip } from "@/src/ui/components/Chip";
import { colors, spacing } from "@/src/ui/tokens";
import { calcBilling } from "@/src/lib/billingCalc";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { usePartnerEntitlement } from "@/src/lib/usePartnerEntitlement";
import { cancelSubscription, createPointOrderAndCredit, startSubscription } from "@/src/actions/partnerActions";
import { Screen } from "@/src/components/Screen";

const QUICK_AMOUNTS = [10000, 30000, 50000, 100000, 200000];
const SUBSCRIPTION_SUPPLY = 100000;
const PAY_METHODS: Array<"kakaopay" | "card" | "bank" | "toss"> = [
  "kakaopay",
  "card",
  "bank",
  "toss",
];

type PlanKey = "trial_3d" | "trial_7d" | "month" | "month_auto";

const PLAN_LABELS: Record<PlanKey, string> = {
  trial_3d: "체험 3일",
  trial_7d: "체험 7일",
  month: "월 구독",
  month_auto: "자동 갱신 월 구독",
};

export default function PartnerBillingScreen() {
  const router = useRouter();
  const { uid: partnerId } = useAuthUid();
  // SSOT: partnerUsers에서 포인트/구독 상태 읽기
  const { pointsBalance, subscriptionActive } = usePartnerEntitlement(partnerId);

  const [supplyInput, setSupplyInput] = useState("50000");
  const [submitting, setSubmitting] = useState(false);
  const [plan, setPlan] = useState<PlanKey>("month");
  const [paymentMethod, setPaymentMethod] = useState<"kakaopay" | "card" | "bank" | "toss">(
    "kakaopay"
  );

  const supplyValue = useMemo(() => Number(supplyInput.replace(/,/g, "")) || 0, [supplyInput]);
  const billing = useMemo(() => calcBilling(supplyValue), [supplyValue]);

  const subscriptionSupply = useMemo(() => {
    if (plan === "trial_3d" || plan === "trial_7d") return 0;
    if (plan === "month_auto") return Math.round(SUBSCRIPTION_SUPPLY * 0.85);
    return SUBSCRIPTION_SUPPLY;
  }, [plan]);
  const subscriptionBilling = useMemo(() => calcBilling(subscriptionSupply), [subscriptionSupply]);

  const handleQuickAdd = (amount: number) => {
    const next = supplyValue + amount;
    setSupplyInput(String(next));
  };

  const handleCharge = async () => {
    if (!partnerId) {
      Alert.alert("로그인이 필요합니다");
      return;
    }
    if (billing.amountSupplyKRW <= 0) {
      Alert.alert("결제 금액을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await createPointOrderAndCredit({
        partnerId,
        amountSupplyKRW: billing.amountSupplyKRW,
        provider: paymentMethod,
      });
      Alert.alert("포인트 충전 완료", `${billing.creditedPoints}p가 적립되었습니다.`);
      router.back();
    } catch (error) {
      console.error("[partner][billing] charge error", error);
      Alert.alert("결제 실패", "포인트 충전에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartSubscription = async () => {
    if (!partnerId) {
      Alert.alert("로그인이 필요합니다");
      return;
    }
    setSubmitting(true);
    try {
      await startSubscription({
        partnerId,
        plan,
        autoRenew: plan === "month_auto",
        provider: paymentMethod,
      });
      Alert.alert("구독 시작", "구독이 활성화되었습니다.");
    } catch (error) {
      console.error("[partner][billing] subscription error", error);
      Alert.alert("구독 시작 실패", "구독 시작에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!partnerId) return;
    setSubmitting(true);
    try {
      await cancelSubscription(partnerId);
      Alert.alert("구독 해지", "구독이 해지되었습니다.");
    } catch (error) {
      console.error("[partner][billing] cancel error", error);
      Alert.alert("해지 실패", "구독 해지에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  // 구독 상세(갱신일 등)는 구독 관리 화면에서 확인
  const periodLabel = "";

  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="과금/구독" subtitle="포인트 충전과 구독을 관리해요." />
        <Card style={styles.balanceCard}>
          <Text style={styles.balanceTitle}>현재 보유 포인트</Text>
          <Text style={styles.balanceValue}>{pointsBalance.toLocaleString()}p</Text>
          <Chip label={subscriptionActive ? "구독 활성" : "포인트 이용"} tone="default" />
          {subscriptionActive && periodLabel ? (
            <Text style={styles.subText}>다음 갱신일: {periodLabel}</Text>
          ) : null}
        </Card>

        <Card style={styles.navCard}>
          <Text style={styles.sectionTitle}>내역/관리</Text>
          <View style={styles.navRow}>
            <SecondaryButton label="결제 내역" onPress={() => router.push("/(partner)/billing/history")} />
            <SecondaryButton label="포인트 내역" onPress={() => router.push("/(partner)/billing/points")} />
          </View>
          <SecondaryButton label="구독 관리" onPress={() => router.push("/(partner)/subscription")} />
        </Card>

        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>포인트 충전</Text>
          <Text style={styles.helper}>공급가를 입력하면 부가세 포함 결제금액을 계산합니다.</Text>
          <TextInput
            value={supplyInput}
            onChangeText={setSupplyInput}
            keyboardType="number-pad"
            placeholder="예: 50000"
            style={styles.input}
          />

          <Text style={styles.helper}>빠른 금액 추가</Text>
          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((amount) => (
              <TouchableOpacity key={amount} style={styles.quickButton} onPress={() => handleQuickAdd(amount)}>
                <Text style={styles.quickText}>+{amount.toLocaleString()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.helper}>결제 수단 선택</Text>
          <View style={styles.planRow}>
            {PAY_METHODS.map((method) => (
              <TouchableOpacity
                key={method}
                style={[styles.planChip, paymentMethod === method && styles.planChipActive]}
                onPress={() => setPaymentMethod(method)}
              >
                <Text style={[styles.planText, paymentMethod === method && styles.planTextActive]}>
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

        <Card style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>포인트 결제 요약</Text>
          <CardRow style={styles.row}>
            <Text style={styles.label}>부가세(10%)</Text>
            <Text style={styles.value}>
              {(billing.amountPayKRW - billing.amountSupplyKRW).toLocaleString()}원
            </Text>
          </CardRow>
          <CardRow style={styles.row}>
            <Text style={styles.label}>결제금액(부가세 포함)</Text>
            <Text style={styles.totalValue}>{billing.amountPayKRW.toLocaleString()}원</Text>
          </CardRow>
          <View style={styles.pointsBox}>
            <Text style={styles.label}>기본 포인트</Text>
            <Text style={styles.value}>{billing.basePoints.toLocaleString()}p</Text>
            <Text style={styles.label}>보너스 포인트</Text>
            <Text style={styles.value}>+{billing.bonusPoints.toLocaleString()}p</Text>
            <Text style={styles.totalLabel}>총 적립</Text>
            <Text style={styles.totalPoints}>{billing.creditedPoints.toLocaleString()}p</Text>
          </View>
        </Card>

        <PrimaryButton
          label={submitting ? "결제 중..." : "포인트 결제하기"}
          onPress={handleCharge}
          disabled={submitting}
        />

        <Card style={styles.subscriptionCard}>
          <Text style={styles.sectionTitle}>구독</Text>
          <Text style={styles.helper}>구독 활성 시 견적 제안이 무제한입니다.</Text>
          <View style={styles.planRow}>
            {(["trial_3d", "trial_7d", "month", "month_auto"] as PlanKey[]).map((value) => (
              <TouchableOpacity
                key={value}
                style={[styles.planChip, plan === value && styles.planChipActive]}
                onPress={() => setPlan(value)}
                disabled={subscriptionActive}
              >
                <Text style={[styles.planText, plan === value && styles.planTextActive]}>
                  {PLAN_LABELS[value]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.helper}>결제 수단</Text>
          <View style={styles.planRow}>
            {PAY_METHODS.map((method) => (
              <TouchableOpacity
                key={method}
                style={[styles.planChip, paymentMethod === method && styles.planChipActive]}
                onPress={() => setPaymentMethod(method)}
                disabled={subscriptionActive}
              >
                <Text style={[styles.planText, paymentMethod === method && styles.planTextActive]}>
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

          <CardRow style={styles.row}>
            <Text style={styles.label}>결제금액(부가세 포함)</Text>
            <Text style={styles.totalValue}>{subscriptionBilling.amountPayKRW.toLocaleString()}원</Text>
          </CardRow>
          <Text style={styles.subText}>자동 갱신은 15% 할인 혜택이 적용됩니다.</Text>

          {subscriptionActive ? (
            <SecondaryButton label={submitting ? "처리 중..." : "구독 해지"} onPress={handleCancelSubscription} disabled={submitting} />
          ) : (
            <PrimaryButton label={submitting ? "처리 중..." : "구독 시작하기"} onPress={handleStartSubscription} disabled={submitting} />
          )}
        </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  balanceCard: { gap: spacing.sm },
  navCard: { gap: spacing.sm },
  navRow: { flexDirection: "row", gap: spacing.sm },
  balanceTitle: { color: colors.subtext, fontSize: 12 },
  balanceValue: { fontSize: 24, fontWeight: "800", color: colors.text },
  subText: { color: colors.subtext, fontSize: 12, marginTop: spacing.xs },
  formCard: { gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  helper: { color: colors.subtext, fontSize: 12 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quickButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  quickText: { color: colors.text, fontWeight: "600" },
  summaryCard: { gap: spacing.sm },
  row: { justifyContent: "space-between" },
  label: { color: colors.subtext, fontSize: 12 },
  value: { color: colors.text, fontWeight: "600" },
  totalValue: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  pointsBox: { marginTop: spacing.sm, gap: spacing.xs },
  totalLabel: { color: colors.text, fontWeight: "700", marginTop: spacing.xs },
  totalPoints: { color: colors.primary, fontWeight: "800", fontSize: 18 },
  subscriptionCard: { gap: spacing.sm },
  planRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  planChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  planChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  planText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  planTextActive: { color: "#FFFFFF" },
});
