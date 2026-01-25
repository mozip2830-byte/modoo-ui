import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  cancelSubscription,
  createBidTicketOrderAndCredit,
  createBidTicketOrderWithPoints,
  createCashPointOrderAndCredit,
  startSubscription,
} from "@/src/actions/partnerActions";
import { Screen } from "@/src/components/Screen";
import { calcBidTicketBilling, calcCashPointBilling } from "@/src/lib/billingCalc";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { usePartnerEntitlement } from "@/src/lib/usePartnerEntitlement";
import { usePartnerUser } from "@/src/lib/usePartnerUser";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { Card, CardRow } from "@/src/ui/components/Card";
import { colors, spacing } from "@/src/ui/tokens";

const QUICK_POINT_AMOUNTS = [55_000, 110_000, 550_000, 1_100_000];
const QUICK_TICKET_AMOUNTS = [11_000, 33_000, 55_000, 110_000, 550_000];
const SUBSCRIPTION_SUPPLY = Math.round(2_000_000 * 1.3);

const PAY_METHODS: Array<"kakaopay" | "card" | "bank" | "toss"> = [
  "kakaopay",
  "card",
  "bank",
  "toss",
];

type PlanKey = "month" | "month_auto";

const PLAN_LABELS: Record<PlanKey, string> = {
  month: "1개월 결제",
  month_auto: "매월 자동결제",
};

const PAY_METHOD_LABELS: Record<"kakaopay" | "card" | "bank" | "toss", string> = {
  kakaopay: "카카오페이",
  card: "카드",
  bank: "계좌이체",
  toss: "토스",
};

function toNumberFromInput(value: string) {
  const n = Number(value.replace(/,/g, "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatNumberInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  const safe = digits.length > 12 ? digits.slice(0, 12) : digits;
  const n = Number(safe);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString();
}

export default function PartnerBillingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uid: partnerId } = useAuthUid();

  const { generalTickets, serviceTickets, subscriptionActive } = usePartnerEntitlement(partnerId);
  const { user: partnerUser } = usePartnerUser(partnerId);

  const [pointInput, setPointInput] = useState("55,000");
  const [ticketInput, setTicketInput] = useState("11,000");
  const [submitting, setSubmitting] = useState(false);
  const [plan, setPlan] = useState<PlanKey>("month");
  const [paymentMethod, setPaymentMethod] = useState<"kakaopay" | "card" | "bank" | "toss">(
    "kakaopay"
  );
  const [billingTab, setBillingTab] = useState<"points" | "tickets">("points");
  const [ticketPayMethod, setTicketPayMethod] = useState<"cash" | "card" | "points">("cash");
  const showSubscription = false; // toggle when ready to expose subscription UI

  const pointValue = useMemo(() => toNumberFromInput(pointInput), [pointInput]);
  const ticketValue = useMemo(() => toNumberFromInput(ticketInput), [ticketInput]);

  const pointBilling = useMemo(() => calcCashPointBilling(pointValue), [pointValue]);
  const ticketBilling = useMemo(() => calcBidTicketBilling(ticketValue), [ticketValue]);

  const subscriptionSupply = useMemo(() => SUBSCRIPTION_SUPPLY, []);
  const subscriptionBilling = useMemo(
    () => calcBidTicketBilling(subscriptionSupply),
    [subscriptionSupply]
  );

  const handlePointQuickSelect = (amount: number) => setPointInput(amount.toLocaleString());
  const handleTicketQuickSelect = (amount: number) => setTicketInput(amount.toLocaleString());

  const requirePartnerId = () => {
    if (!partnerId) {
      Alert.alert("오류", "파트너 정보를 불러오지 못했습니다.");
      return false;
    }
    return true;
  };

  const handlePointCharge = async () => {
    if (!requirePartnerId()) return;
    if (pointBilling.displayAmountKRW <= 0) {
      Alert.alert("확인", "충전 금액을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await createCashPointOrderAndCredit({
        partnerId: partnerId!,
        displayAmountKRW: pointBilling.displayAmountKRW,
        amountSupplyKRW: pointBilling.amountSupplyKRW,
        amountPayKRW: pointBilling.amountPayKRW,
        provider: paymentMethod,
      });

      Alert.alert("충전 완료", `${pointBilling.creditedPoints.toLocaleString()}P가 충전되었습니다.`);
      router.back();
    } catch (error) {
      console.error("[partner][billing] point charge error", error);
      Alert.alert("결제 실패", "결제 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTicketCharge = async () => {
    if (!requirePartnerId()) return;
    if (ticketBilling.amountSupplyKRW <= 0) {
      Alert.alert("확인", "충전 금액을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      if (ticketPayMethod === "points") {
        await createBidTicketOrderWithPoints({
          partnerId: partnerId!,
          amountPayKRW: ticketBilling.amountPayKRW,
          creditedPoints: ticketBilling.creditedPoints,
        });
      } else {
        await createBidTicketOrderAndCredit({
          partnerId: partnerId!,
          amountSupplyKRW: ticketBilling.amountSupplyKRW,
          amountPayKRW: ticketBilling.amountPayKRW,
          creditedPoints: ticketBilling.creditedPoints,
          provider: ticketPayMethod === "card" ? "card" : "bank",
        });
      }

      Alert.alert("충전 완료", `${ticketBilling.creditedPoints.toLocaleString()}장이 충전되었습니다.`);
      router.back();
    } catch (error) {
      console.error("[partner][billing] ticket charge error", error);
      Alert.alert("결제 실패", "결제 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartSubscription = async () => {
    if (!requirePartnerId()) return;

    setSubmitting(true);
    try {
      await startSubscription({
        partnerId: partnerId!,
        plan,
        autoRenew: plan === "month_auto",
        provider: paymentMethod,
      });

      Alert.alert("구독 시작", "구독이 시작되었습니다.");
    } catch (error) {
      console.error("[partner][billing] subscription error", error);
      Alert.alert("구독 실패", "구독 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!partnerId) return;

    setSubmitting(true);
    try {
      await cancelSubscription(partnerId);
      Alert.alert("구독 취소", "구독이 취소되었습니다.");
    } catch (error) {
      console.error("[partner][billing] cancel error", error);
      Alert.alert("취소 실패", "취소 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const periodLabel = "";

  return (
    <Screen
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}
    >
      <AppHeader title="포인트/입찰권 충전" subtitle="포인트 또는 입찰권을 충전하세요." />

      <Card style={styles.balanceCard}>
        <Text style={styles.balanceTitle}>보유 포인트</Text>
        <Text style={styles.balanceValue}>
          {Number(partnerUser?.cashPoints ?? 0).toLocaleString()}P
        </Text>
        <Text style={styles.balanceMeta}>포인트는 입찰권 구매에 사용할 수 있습니다.</Text>
      </Card>

      <Card style={styles.balanceCard}>
        <Text style={styles.balanceTitle}>보유 입찰권</Text>
        <Text style={styles.balanceValue}>{generalTickets.toLocaleString()}장</Text>
        <Text style={styles.balanceMeta}>서비스 입찰권 {serviceTickets.toLocaleString()}장</Text>
        {periodLabel ? <Text style={styles.subText}>구독 기간: {periodLabel}</Text> : null}
      </Card>

      <Card style={styles.navCard}>
        <Text style={styles.sectionTitle}>내역/관리</Text>
        <View style={styles.navRow}>
          <SecondaryButton label="입찰 내역" onPress={() => router.push("/(partner)/billing/bids")} />
          <SecondaryButton label="충전 내역" onPress={() => router.push("/(partner)/billing/points")} />
        </View>
      </Card>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabButton, billingTab === "points" && styles.tabButtonActive]}
          onPress={() => setBillingTab("points")}
          disabled={submitting}
        >
          <Text style={[styles.tabText, billingTab === "points" && styles.tabTextActive]}>
            포인트 충전
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, billingTab === "tickets" && styles.tabButtonActive]}
          onPress={() => setBillingTab("tickets")}
          disabled={submitting}
        >
          <Text style={[styles.tabText, billingTab === "tickets" && styles.tabTextActive]}>
            입찰권 충전
          </Text>
        </TouchableOpacity>
      </View>

      {billingTab === "points" ? (
        <>
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>포인트 충전</Text>
            <Text style={styles.helper}>
              충전할 금액을 입력하거나 빠른선택을 이용하세요.
            </Text>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>충전 금액</Text>
              <View style={styles.inputBox}>
                <TextInput
                  value={pointInput}
                  onChangeText={(t) => setPointInput(formatNumberInput(t))}
                  keyboardType="number-pad"
                  placeholder="예) 55,000"
                  placeholderTextColor={colors.subtext}
                  style={styles.textInput}
                  editable={!submitting}
                />
                <Text style={styles.suffix}>원</Text>
              </View>
            </View>

            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>결제 금액</Text>
              <Text style={styles.amountValue}>
                {pointBilling.displayAmountKRW.toLocaleString()}원
              </Text>
            </View>

            <Text style={styles.helper}>빠른 선택</Text>
            <View style={styles.quickRow}>
              {QUICK_POINT_AMOUNTS.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={styles.quickButton}
                  onPress={() => handlePointQuickSelect(amount)}
                  disabled={submitting}
                >
                  <Text style={styles.quickText}>{amount.toLocaleString()}원</Text>
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
                  disabled={submitting}
                >
                  <Text style={[styles.planText, paymentMethod === method && styles.planTextActive]}>
                    {PAY_METHOD_LABELS[method]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          <Card style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>결제 정보</Text>
            <CardRow style={styles.row}>
              <Text style={styles.label}>최종 결제 금액</Text>
              <Text style={styles.totalValue}>
                {pointBilling.amountPayKRW.toLocaleString()}원
              </Text>
            </CardRow>
            <Text style={styles.helper}>표기 금액 기준으로 자동 계산됩니다.</Text>
            <CardRow style={styles.row}>
              <Text style={styles.label}>충전 포인트</Text>
              <Text style={styles.totalPoints}>
                {pointBilling.creditedPoints.toLocaleString()}P
              </Text>
            </CardRow>
          </Card>

          <PrimaryButton
            label={submitting ? "결제 중..." : "포인트 결제"}
            onPress={handlePointCharge}
            disabled={submitting}
          />
        </>
      ) : null}

      {billingTab === "tickets" ? (
        <>
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>입찰권 충전</Text>
            <Text style={styles.helper}>
              충전할 금액을 입력하거나 빠른선택을 이용하세요.
            </Text>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>충전 금액</Text>
              <View style={styles.inputBox}>
                <TextInput
                  value={ticketInput}
                  onChangeText={(t) => setTicketInput(formatNumberInput(t))}
                  keyboardType="number-pad"
                  placeholder="예) 11,000"
                  placeholderTextColor={colors.subtext}
                  style={styles.textInput}
                  editable={!submitting}
                />
                <Text style={styles.suffix}>원</Text>
              </View>
            </View>

            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>공급가</Text>
              <Text style={styles.amountValue}>
                {ticketBilling.amountSupplyKRW.toLocaleString()}원
              </Text>
            </View>

            <Text style={styles.helper}>빠른 선택</Text>
            <View style={styles.quickRow}>
              {QUICK_TICKET_AMOUNTS.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={styles.quickButton}
                  onPress={() => handleTicketQuickSelect(amount)}
                  disabled={submitting}
                >
                  <Text style={styles.quickText}>{amount.toLocaleString()}원</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.helper}>결제 수단</Text>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabButton, ticketPayMethod === "cash" && styles.tabButtonActive]}
                onPress={() => setTicketPayMethod("cash")}
                disabled={submitting}
              >
                <Text style={[styles.tabText, ticketPayMethod === "cash" && styles.tabTextActive]}>
                  현금 결제
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, ticketPayMethod === "card" && styles.tabButtonActive]}
                onPress={() => setTicketPayMethod("card")}
                disabled={submitting}
              >
                <Text style={[styles.tabText, ticketPayMethod === "card" && styles.tabTextActive]}>
                  카드 결제
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, ticketPayMethod === "points" && styles.tabButtonActive]}
                onPress={() => setTicketPayMethod("points")}
                disabled={submitting}
              >
                <Text style={[styles.tabText, ticketPayMethod === "points" && styles.tabTextActive]}>
                  포인트 결제
                </Text>
              </TouchableOpacity>
            </View>

            {ticketPayMethod === "points" ? (
              <Text style={styles.helper}>
                보유 포인트: {Number(partnerUser?.cashPoints ?? 0).toLocaleString()}P +{" "}
                {Number(partnerUser?.cashPointsService ?? 0).toLocaleString()}P (일반 포인트 우선 차감)
              </Text>
            ) : null}
          </Card>

          <Card style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>결제 정보</Text>
            <CardRow style={styles.row}>
              <Text style={styles.label}>최종 결제 금액</Text>
              <Text style={styles.totalValue}>
                {ticketBilling.amountPayKRW.toLocaleString()}원
              </Text>
            </CardRow>
            <Text style={styles.helper}>표기 금액 기준으로 자동 계산됩니다.</Text>

            <View style={styles.pointsBox}>
              <View style={styles.breakdownRow}>
                <Text style={styles.label}>기본 입찰권</Text>
                <Text style={styles.value}>{ticketBilling.basePoints.toLocaleString()}장</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.label}>보너스 입찰권</Text>
                <Text style={styles.value}>+{ticketBilling.bonusPoints.toLocaleString()}장</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.totalLabel}>총 입찰권</Text>
                <Text style={styles.totalPoints}>
                  {ticketBilling.creditedPoints.toLocaleString()}장
                </Text>
              </View>
            </View>
          </Card>

          <PrimaryButton
            label={submitting ? "결제 중..." : "입찰권 결제"}
            onPress={handleTicketCharge}
            disabled={submitting}
          />
        </>
      ) : null}

      {showSubscription ? (
        <Card style={styles.subscriptionCard}>
          <Text style={styles.sectionTitle}>구독</Text>
          <Text style={styles.helper}>정기 구독으로 입찰권을 할인된 가격으로 받으세요.</Text>

          <Text style={styles.helper}>플랜 선택</Text>
          <View style={styles.planRow}>
            {(["month", "month_auto"] as PlanKey[]).map((value) => (
              <TouchableOpacity
                key={value}
                style={[styles.planChip, plan === value && styles.planChipActive]}
                onPress={() => setPlan(value)}
                disabled={subscriptionActive || submitting}
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
                disabled={subscriptionActive || submitting}
              >
                <Text style={[styles.planText, paymentMethod === method && styles.planTextActive]}>
                  {PAY_METHOD_LABELS[method]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <CardRow style={styles.row}>
            <Text style={styles.label}>결제 금액(부가세 포함)</Text>
            <Text style={styles.totalValue}>
              {subscriptionBilling.amountPayKRW.toLocaleString()}원
            </Text>
          </CardRow>
          <Text style={styles.subText}>구독은 별도 약관이 적용됩니다.</Text>

          {subscriptionActive ? (
            <SecondaryButton
              label={submitting ? "처리 중..." : "구독 취소"}
              onPress={handleCancelSubscription}
              disabled={submitting}
            />
          ) : (
            <PrimaryButton
              label={submitting ? "처리 중..." : "구독 시작하기"}
              onPress={handleStartSubscription}
              disabled={submitting}
            />
          )}
        </Card>
      ) : null}
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
  balanceValue: { fontSize: 24, fontWeight: "800", color: colors.text, textAlign: "right" },
  balanceMeta: { color: colors.subtext, fontSize: 12 },
  subText: { color: colors.subtext, fontSize: 12, marginTop: spacing.xs },

  formCard: { gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },

  inputRow: { gap: spacing.xs },
  inputLabel: { color: colors.subtext, fontSize: 12, fontWeight: "600" },
  inputBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  textInput: {
    flex: 1,
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  suffix: { color: colors.subtext, fontSize: 12, fontWeight: "700", marginLeft: spacing.sm },

  amountBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  amountLabel: { color: colors.subtext, fontSize: 12, fontWeight: "600" },
  amountValue: { color: colors.text, fontWeight: "700", fontSize: 15, textAlign: "right" },

  helper: { color: colors.subtext, fontSize: 12 },

  tabRow: { flexDirection: "row", gap: spacing.sm },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  tabButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: "#FFFFFF" },

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
  value: { color: colors.text, fontWeight: "600", textAlign: "right" },
  totalValue: { color: colors.primary, fontWeight: "800", fontSize: 16, textAlign: "right" },

  pointsBox: { marginTop: spacing.sm, gap: spacing.xs },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: colors.text, fontWeight: "700" },
  totalPoints: { color: colors.primary, fontWeight: "800", fontSize: 18, textAlign: "right" },

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
