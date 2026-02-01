import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { Card } from "@/src/ui/components/Card";
import { colors, radius, spacing } from "@/src/ui/tokens";
import { createPartnerAdBid } from "@/src/actions/partnerActions";
import { SERVICE_CATEGORIES } from "@/src/constants/serviceCategories";
import { SERVICE_REGIONS } from "@/src/constants/serviceRegions";
import { SERVICE_REGION_CITIES } from "@/src/constants/serviceRegionCities";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Step = "category" | "region" | "bid";
const MIN_BID_POINTS = 10000;

function getWeekRange(base: Date) {
  const day = base.getDay(); // 0 Sun - 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday start (current week)
  const start = new Date(base);
  start.setDate(base.getDate() + diff + 7); // next week Monday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function isBidClosed(now: Date) {
  return now.getDay() === 0 && now.getHours() >= 22;
}

function formatWeekKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("ko-KR");
}

export default function PartnerAdsScreen() {
  const router = useRouter();
  const { uid: partnerId } = useAuthUid();
  const insets = useSafeAreaInsets();
  const actionBarHeight = 56 + Math.max(0, insets.bottom - 6);
  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [regionDetail, setRegionDetail] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { start, end } = useMemo(() => getWeekRange(new Date()), []);
  const amountValue = useMemo(() => Number(amountText.replace(/[^\d]/g, "")), [amountText]);
  const regionListMaxHeight = useMemo(() => {
    const windowHeight = Dimensions.get("window").height;
    return Math.max(180, Math.round(windowHeight * 0.28));
  }, []);

  const canMoveRegion = Boolean(category);
  const normalizedRegion = region?.trim() ?? "";
  const needsRegionDetail = Boolean(region && SERVICE_REGION_CITIES[normalizedRegion]);
  const regionKey = regionDetail ? `${normalizedRegion} ${regionDetail}` : null;
  const canMoveBid = Boolean(category && region && (!needsRegionDetail || regionDetail));
  const canSubmit = amountValue >= MIN_BID_POINTS && canMoveBid;
  const displayRegion = regionKey ?? normalizedRegion ?? region ?? "";

  const handleSubmit = async () => {
    if (!partnerId || !category || !region) {
      Alert.alert("광고 입찰", "카테고리와 지역을 선택해 주세요.");
      return;
    }
    if (isBidClosed(new Date())) {
      Alert.alert("광고 입찰", "매주 일요일 22시 마감입니다. 늦은 신청은 불가합니다.");
      return;
    }
    if (needsRegionDetail && !regionDetail) {
      Alert.alert("광고 입찰", "시/군 선택이 필요합니다.");
      return;
    }
    if (!amountValue || !Number.isFinite(amountValue)) {
      Alert.alert("광고 입찰", "입찰 금액을 입력해 주세요.");
      return;
    }
    if (amountValue < MIN_BID_POINTS) {
      Alert.alert("광고 입찰", `최소 ${MIN_BID_POINTS.toLocaleString("ko-KR")}포인트부터 가능합니다.`);
      return;
    }
    setSubmitting(true);
    try {
      await createPartnerAdBid({
        partnerId,
        category,
        region: normalizedRegion || region,
        regionDetail,
        amount: amountValue,
      });
      Alert.alert("광고 입찰", "입찰이 등록되었습니다.");
      router.back();
    } catch (err: any) {
      Alert.alert("광고 입찰", err?.message ?? "입찰 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} style={styles.container} edges={["top"]}>
      <View style={styles.content}>
        <AppHeader
          title="광고 입찰"
          subtitle="카테고리와 지역을 선택해 입찰하세요."
          containerStyle={styles.headerCompact}
        />
        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: spacing.xxl + actionBarHeight },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>진행 단계</Text>
            <View style={styles.stepRow}>
              <View style={[styles.stepPill, step === "category" && styles.stepPillActive]}>
                <Text style={[styles.stepText, step === "category" && styles.stepTextActive]}>
                  카테고리
                </Text>
              </View>
              <View style={[styles.stepPill, step === "region" && styles.stepPillActive]}>
                <Text style={[styles.stepText, step === "region" && styles.stepTextActive]}>
                  지역
                </Text>
              </View>
              <View style={[styles.stepPill, step === "bid" && styles.stepPillActive]}>
                <Text style={[styles.stepText, step === "bid" && styles.stepTextActive]}>
                  입찰
                </Text>
              </View>
            </View>
          </Card>

          <Card style={styles.flowCard}>
            <View style={styles.flowRow}>
              <View style={styles.categoryColumn}>
                <Text style={styles.columnTitle}>카테고리</Text>
                <ScrollView contentContainerStyle={styles.columnList}>
                  {SERVICE_CATEGORIES.map((item) => {
                    const active = item === category;
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.categoryItem, active && styles.categoryItemActive]}
                        onPress={() => {
                          setCategory(item);
                          setStep("region");
                        }}
                      >
                        <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.detailColumn}>
                {step === "region" ? (
                  <>
                    <Text style={styles.columnTitle}>지역 선택</Text>
                    <ScrollView
                      contentContainerStyle={styles.regionList}
                      style={{ maxHeight: regionListMaxHeight }}
                      nestedScrollEnabled
                    >
                      {SERVICE_REGIONS.map((item) => {
                        const active = item === region;
                        return (
                          <TouchableOpacity
                            key={item}
                            style={[styles.regionItem, active && styles.regionItemActive]}
                            onPress={() => {
                              setRegion(item);
                              setRegionDetail(null);
                            }}
                          >
                            <Text style={[styles.regionText, active && styles.regionTextActive]}>
                              {item}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    {needsRegionDetail ? (
                      <View style={styles.regionDetailWrap}>
                        <Text style={styles.regionDetailTitle}>시/군 선택</Text>
                      <ScrollView
                        contentContainerStyle={styles.regionDetailList}
                        showsVerticalScrollIndicator={false}
                        style={{ maxHeight: regionListMaxHeight }}
                        nestedScrollEnabled
                      >
                          {SERVICE_REGION_CITIES[
                            normalizedRegion as keyof typeof SERVICE_REGION_CITIES
                          ]?.map((item) => {
                            const active = item === regionDetail;
                            return (
                              <TouchableOpacity
                                key={item}
                                style={[styles.regionItem, active && styles.regionItemActive]}
                                onPress={() => setRegionDetail(item)}
                              >
                                <Text
                                  style={[styles.regionText, active && styles.regionTextActive]}
                                >
                                  {item}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : null}
                  </>
                ) : step === "bid" ? (
                  <>
                    <Text style={styles.columnTitle}>입찰 정보</Text>
                    <Text style={styles.summaryText}>
                      {category ?? "-"} · {displayRegion ?? "-"}
                    </Text>
                    <Text style={styles.summarySub}>
                      입찰 기간: {formatDate(start)} ~ {formatDate(end)}
                    </Text>
                    <Text style={styles.summaryNote}>
                      최소 {MIN_BID_POINTS.toLocaleString("ko-KR")}포인트부터 가능합니다.
                    </Text>
                    <Text style={styles.summaryNote}>동률 시 선착순으로 결정됩니다.</Text>
                    <TextInput
                      value={amountText}
                      onChangeText={(value) => setAmountText(value.replace(/[^\d]/g, ""))}
                      placeholder={`최소 ${MIN_BID_POINTS.toLocaleString("ko-KR")}포인트`}
                      keyboardType="numeric"
                      style={styles.amountInput}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.columnTitle}>지역 선택</Text>
                    <Text style={styles.placeholderText}>
                      왼쪽 카테고리를 선택하면 지역을 고를 수 있어요.
                    </Text>
                  </>
                )}
              </View>
            </View>
          </Card>
        </ScrollView>
      </View>
      <View style={[styles.actionBar, { paddingBottom: Math.max(0, insets.bottom - 6) }]}>
        {step === "category" ? (
          <PrimaryButton
            label="다음"
            onPress={() => setStep("region")}
            disabled={!canMoveRegion}
          />
        ) : step === "region" ? (
          <View style={styles.actionBarRow}>
            <SecondaryButton label="이전" onPress={() => setStep("category")} />
            <PrimaryButton
              label="다음"
              onPress={() => setStep("bid")}
              disabled={!canMoveBid}
            />
          </View>
        ) : (
          <View style={styles.actionBarRow}>
            <SecondaryButton label="이전" onPress={() => setStep("region")} />
            <PrimaryButton
              label={submitting ? "등록 중..." : "입찰 등록"}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    flex: 1,
  },
  headerCompact: {
    paddingTop: 0,
    paddingBottom: spacing.sm,
  },
  scrollBody: { flex: 1 },
  scrollContent: { gap: spacing.md },
  stepCard: { padding: spacing.md, gap: spacing.sm },
  stepTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  stepRow: { flexDirection: "row", gap: spacing.sm },
  stepPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepText: { fontSize: 12, color: colors.text, fontWeight: "600" },
  stepTextActive: { color: "#FFFFFF" },

  flowCard: { padding: 0, overflow: "hidden", marginBottom: spacing.md },
  flowRow: { flexDirection: "row", minHeight: 420 },

  categoryColumn: {
    width: 120,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    padding: spacing.sm,
    backgroundColor: "#F7F4F0",
  },
  detailColumn: { flex: 1, padding: spacing.md, gap: spacing.sm },
  columnTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 4 },
  columnList: { gap: spacing.xs },
  categoryItem: {
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  categoryTextActive: { color: "#FFFFFF" },

  regionList: { gap: spacing.xs, paddingBottom: spacing.sm },
  regionItem: {
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  regionItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  regionText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  regionTextActive: { color: "#FFFFFF" },
  regionDetailWrap: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  regionDetailTitle: { fontSize: 12, color: colors.subtext },
  regionDetailList: { gap: spacing.xs },

  summaryText: { fontSize: 16, fontWeight: "800", color: colors.text },
  summarySub: { fontSize: 12, color: colors.subtext },
  summaryNote: { fontSize: 12, color: colors.subtext },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  placeholderText: { fontSize: 12, color: colors.subtext },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 0,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
