import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { signOutPartner } from "@/src/actions/authActions";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { usePartnerEntitlement } from "@/src/lib/usePartnerEntitlement";
import { usePartnerUser } from "@/src/lib/usePartnerUser";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { SecondaryButton } from "@/src/ui/components/Buttons";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { PrimaryButton } from "@/src/ui/components/Buttons";
import { colors, spacing } from "@/src/ui/tokens";

function formatNumberSafe(value: unknown, suffix?: string) {
  let out: string | null = null;

  if (typeof value === "number" && Number.isFinite(value)) {
    out = value.toLocaleString("ko-KR");
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) out = parsed.toLocaleString("ko-KR");
    }
  }

  if (!out) return "-";
  return suffix ? `${out}${suffix}` : out;
}

export default function PartnerProfileTab() {
  const router = useRouter();
  const { uid: partnerId } = useAuthUid();
  const { user } = usePartnerUser(partnerId);
  const target = partnerId ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    if (!partnerId) return;

    let active = true;

    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "reviews"), where("partnerId", "==", partnerId)));
        if (active) {
          setReviewCount(snap.size);
        }
      } catch (err) {
        console.error("[partner][profile] review count error", err);
      }
    })();

    return () => {
      active = false;
    };
  }, [partnerId]);

  const handleLogout = useCallback(async () => {
    Alert.alert("로그아웃", "로그아웃 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          try {
            await signOutPartner();
            router.replace("/(partner)/auth/login");
          } catch (err) {
            console.error("[partner][profile] logout error", err);
            Alert.alert("로그아웃 실패", "로그아웃에 실패했습니다.");
          }
        },
      },
    ]);
  }, [router]);

  return (
    <Screen style={styles.container}>
      <AppHeader
        title={LABELS.headers.profile}
        subtitle="파트너 정보"
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/(partner)/notifications" />
          </View>
        }
      />

      <View style={styles.summaryRow}>
        <Card style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>보유 포인트</Text>
          <Text style={styles.balanceValue}>
            {formatNumberSafe((user as any)?.cashPoints, "P")}
          </Text>
          <Text style={styles.balanceMeta}>
            서비스 {formatNumberSafe((user as any)?.cashPointsService, "P")}
          </Text>
          <PrimaryButton label="포인트 충전" onPress={() => router.push("/(partner)/billing")} />
        </Card>
      </View>

      <Card style={styles.verifyCard}>
        <View style={styles.verifyHeader}>
          <Text style={styles.verifyTitle}>사업자 인증</Text>
          <Chip
            label={user?.verificationStatus ?? "승인"}
            tone={user?.verificationStatus === "승인" ? "success" : "warning"}
          />
        </View>
        {user?.verificationStatus === "검수중" ? (
          <Text style={styles.verifyDesc}>
            서류 확인 중입니다. 보통 1~12시간(영업시간 기준) 내 완료됩니다.
          </Text>
        ) : user?.verificationStatus === "승인" ? (
          <Text style={styles.verifyDesc}>인증이 완료되어 견적 제안을 진행할 수 있습니다.</Text>
        ) : user?.verificationStatus === "반려" ? (
          <Text style={styles.verifyDesc}>반려되었습니다. 서류를 다시 제출해 주세요.</Text>
        ) : (
          <Text style={styles.verifyDesc}>사업자등록증 제출 후 견적 제안이 가능합니다.</Text>
        )}
        {user?.verificationStatus !== "승인" ? (
          <PrimaryButton
            label="사업자등록증 제출하기"
            onPress={() => router.push("/(partner)/verification")}
          />
        ) : null}
      </Card>

      <Card style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewTitle}>리뷰 관리</Text>
          <Text style={styles.reviewCount}>{reviewCount}</Text>
        </View>
        <Text style={styles.reviewDesc}>받은 리뷰를 확인하고 답글을 작성하세요.</Text>
        <PrimaryButton
          label="리뷰 관리"
          onPress={() => router.push("/(partner)/reviews")}
        />
      </Card>

      <Card style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>서비스 설정</Text>
        <TouchableOpacity
          style={styles.settingsRow}
          onPress={() => router.push("/(partner)/settings/services")}
        >
          <Text style={styles.settingsLabel}>서비스 품목 설정</Text>
          <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsRow}
          onPress={() => router.push("/(partner)/settings/regions")}
        >
          <Text style={styles.settingsLabel}>서비스 지역 설정</Text>
          <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsRow}
          onPress={() => router.push("/(partner)/settings/ads")}
        >
          <Text style={styles.settingsLabel}>광고</Text>
          <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
        </TouchableOpacity>
        <SecondaryButton label="로그아웃" onPress={handleLogout} style={styles.logoutBtn} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  headerActions: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },

  summaryRow: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  balanceCard: { flex: 1, minWidth: 140, gap: spacing.xs },
  balanceLabel: { color: colors.subtext, fontSize: 12 },
  balanceValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  balanceMeta: { color: colors.subtext, fontSize: 12 },

  verifyCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  verifyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  verifyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  verifyDesc: { color: colors.subtext, fontSize: 12 },

  reviewCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  reviewCount: { fontSize: 16, fontWeight: "700", color: colors.primary },
  reviewDesc: { color: colors.subtext, fontSize: 12 },

  settingsCard: { marginHorizontal: spacing.lg, gap: spacing.sm },
  settingsTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  settingsLabel: { color: colors.text, fontSize: 14 },
  logoutBtn: { marginTop: spacing.sm },
});
