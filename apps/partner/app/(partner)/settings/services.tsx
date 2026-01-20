import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  subscribeMyQuotedRequestsForPartner,
  subscribeOpenRequestsForPartner,
} from "@/src/actions/requestActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { PartnerDoc, RequestDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

type TabKey = "open" | "mine";

/**
 * ✅ 요청 문서에서 "서비스(품목)" 값을 최대한 찾아낸다.
 * - 프로젝트마다 필드명이 다를 수 있어서 후보를 넓게 둠.
 * - 서비스 설정 화면은 partners/{uid}.serviceCategories 에 문자열 배열로 저장됨.
 */
function getRequestServiceCategory(item: any): string | null {
  const v =
    item?.serviceCategory ??
    item?.serviceCategories ?? // 배열일 수도 있음
    item?.service ??
    item?.serviceName ??
    item?.category ??
    item?.type ??
    null;

  if (!v) return null;

  // 배열이면 첫 값(혹은 매칭은 아래에서 별도 처리)
  if (Array.isArray(v)) {
    return v.length ? String(v[0]) : null;
  }
  return String(v);
}

/**
 * ✅ 요청이 partner의 서비스 품목 설정에 포함되는지 판단
 * - 요청이 배열(serviceCategories)로 올 수도 있어 교집합 검사
 */
function matchesPartnerServices(item: any, partnerServices: string[]): boolean {
  if (!partnerServices.length) return true; // partner 설정이 없으면 필터 안 함(UX에서 별도 처리)

  const arrCandidate =
    item?.serviceCategories ??
    item?.services ??
    item?.serviceCategoryIds ??
    null;

  if (Array.isArray(arrCandidate) && arrCandidate.length) {
    const set = new Set(arrCandidate.map((x) => String(x)));
    return partnerServices.some((s) => set.has(s));
  }

  const single = getRequestServiceCategory(item);
  if (!single) return false;
  return partnerServices.includes(single);
}

export default function PartnerQuotesTab() {
  const router = useRouter();
  const { uid: partnerId } = useAuthUid();
  const target = partnerId ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  const [tab, setTab] = useState<TabKey>("open");
  const [openRequests, setOpenRequests] = useState<RequestDoc[]>([]);
  const [myRequests, setMyRequests] = useState<RequestDoc[]>([]);
  const [loadingOpen, setLoadingOpen] = useState(true);
  const [loadingMine, setLoadingMine] = useState(true);
  const [errorOpen, setErrorOpen] = useState<string | null>(null);
  const [errorMine, setErrorMine] = useState<string | null>(null);

  // ✅ 파트너 서비스 품목(프로필 설정) 로드
  const [partnerServices, setPartnerServices] = useState<string[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);

  // ✅ 기본 ON: 내 서비스만 보기
  const [onlyMyServices, setOnlyMyServices] = useState(true);

  useEffect(() => {
    setLoadingOpen(true);
    const unsub = subscribeOpenRequestsForPartner({
      onData: (data) => {
        setOpenRequests(data);
        setLoadingOpen(false);
        setErrorOpen(null);
      },
      onError: (err) => {
        console.error("[partner][requests] open error", err);
        setErrorOpen("데이터를 불러오지 못했습니다.");
        setLoadingOpen(false);
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    if (!partnerId) {
      setMyRequests([]);
      setLoadingMine(false);
      return;
    }

    setLoadingMine(true);
    const unsub = subscribeMyQuotedRequestsForPartner({
      partnerId,
      onData: (data) => {
        setMyRequests(data);
        setLoadingMine(false);
        setErrorMine(null);
      },
      onError: (err) => {
        console.error("[partner][requests] mine error", err);
        setErrorMine("데이터를 불러오지 못했습니다.");
        setLoadingMine(false);
      },
    });

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  // ✅ partner 서비스 품목 로드 (partners/{uid}.serviceCategories)
  useEffect(() => {
    const run = async () => {
      if (!partnerId) {
        setPartnerServices([]);
        setLoadingServices(false);
        return;
      }
      setLoadingServices(true);
      try {
        const snap = await getDoc(doc(db, "partners", partnerId));
        if (snap.exists()) {
          const data = snap.data() as PartnerDoc;
          setPartnerServices(data.serviceCategories ?? []);
        } else {
          setPartnerServices([]);
        }
      } catch (e) {
        console.error("[partner][quotes] load partner services error", e);
        setPartnerServices([]);
      } finally {
        setLoadingServices(false);
      }
    };
    run();
  }, [partnerId]);

  const baseData = useMemo(
    () => (tab === "open" ? openRequests : myRequests),
    [openRequests, myRequests, tab]
  );
  const loading = tab === "open" ? loadingOpen : loadingMine;
  const error = tab === "open" ? errorOpen : errorMine;

  // ✅ 내 서비스 자동 필터 적용
  const data = useMemo(() => {
    if (!onlyMyServices) return baseData;
    if (!partnerId) return baseData; // 로그인 전이면 필터 의미 없음
    if (!partnerServices.length) return []; // 설정 없으면 "없음" 상태로 보여주기
    return baseData.filter((it) => matchesPartnerServices(it, partnerServices));
  }, [baseData, onlyMyServices, partnerId, partnerServices]);

  const showNeedServiceSetup = useMemo(() => {
    return Boolean(partnerId) && !loadingServices && onlyMyServices && partnerServices.length === 0;
  }, [partnerId, loadingServices, onlyMyServices, partnerServices.length]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title={LABELS.headers.quotes}
        subtitle="요청과 견적을 관리해요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/(partner)/notifications" />
            <TouchableOpacity onPress={() => router.push(target)} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "open" && styles.tabBtnActive]}
          onPress={() => setTab("open")}
        >
          <Text style={[styles.tabText, tab === "open" && styles.tabTextActive]}>신규 요청</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "mine" && styles.tabBtnActive]}
          onPress={() => setTab("mine")}
        >
          <Text style={[styles.tabText, tab === "mine" && styles.tabTextActive]}>내 견적</Text>
        </TouchableOpacity>
      </View>

      {tab === "open" ? (
        <Text style={styles.note}>{LABELS.messages.closedHidden}</Text>
      ) : (
        <Text style={styles.note}>{LABELS.messages.closedVisible}</Text>
      )}

      {/* ✅ 자동 필터 토글 바 */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          onPress={() => setOnlyMyServices((v) => !v)}
          style={[styles.filterToggle, onlyMyServices && styles.filterToggleOn]}
          activeOpacity={0.85}
        >
          <FontAwesome
            name={onlyMyServices ? "check-circle" : "circle-o"}
            size={16}
            color={onlyMyServices ? "#FFFFFF" : colors.subtext}
          />
          <Text style={[styles.filterToggleText, onlyMyServices && styles.filterToggleTextOn]}>
            내 서비스만 보기
          </Text>
        </TouchableOpacity>

        {onlyMyServices && partnerServices.length > 0 ? (
          <Chip label={`선택 ${partnerServices.length}개`} tone="default" />
        ) : null}

        <TouchableOpacity
          onPress={() => router.push("/(partner)/settings/services")}
          style={styles.filterLink}
        >
          <Text style={styles.filterLinkText}>서비스 설정</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading || loadingServices ? (
            <EmptyState title={LABELS.messages.loading} />
          ) : showNeedServiceSetup ? (
            <EmptyState
              title="서비스 품목 설정이 필요합니다."
              description="프로필에서 제공 가능한 서비스를 선택하면 해당 요청만 자동으로 보여드려요."
            />
          ) : (
            <EmptyState title="요청이 없습니다." description="잠시 후 다시 확인해 주세요." />
          )
        }
        renderItem={({ item }: { item: RequestDoc }) => (
          <TouchableOpacity
            style={styles.cardWrap}
            onPress={() => router.push(`/(partner)/requests/${item.id}`)}
          >
            <Card>
              <CardRow>
                <View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSub}>{item.location}</Text>

                  {/* ✅ 서비스 표시(필드가 있으면 보여줌) */}
                  {(() => {
                    const svc = getRequestServiceCategory(item as any);
                    if (!svc) return null;
                    return <Text style={styles.cardSvc}>서비스: {svc}</Text>;
                  })()}
                </View>
                <Chip label={item.status === "open" ? "접수" : "마감"} />
              </CardRow>

              <View style={styles.metaRow}>
                <Text style={styles.cardMeta}>
                  {LABELS.labels.budget}: {item.budget.toLocaleString()}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.createdAt ? formatTimestamp(item.createdAt as never) : LABELS.messages.justNow}
                </Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* ✅ 서비스 미설정 상태에서 바로 이동 버튼이 필요하면 아래 주석 해제해서 사용
      {showNeedServiceSetup ? (
        <View style={styles.bottomCta}>
          <TouchableOpacity
            onPress={() => router.push("/(partner)/settings/services")}
            style={styles.ctaBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>서비스 품목 설정하러 가기</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      */}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  tabs: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontWeight: "700" },
  tabTextActive: { color: "#FFFFFF" },

  note: { color: colors.subtext, marginHorizontal: spacing.lg, marginBottom: spacing.sm, fontSize: 12 },

  // ✅ 자동필터 바
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterToggleOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  filterToggleText: { fontWeight: "800", color: colors.text },
  filterToggleTextOn: { color: "#FFFFFF" },
  filterLink: { marginLeft: "auto", paddingHorizontal: 10, paddingVertical: 6 },
  filterLinkText: { color: colors.primary, fontWeight: "800" },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  cardWrap: { marginBottom: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardSub: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  cardSvc: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12, fontWeight: "700" },

  cardMeta: { color: colors.subtext, fontSize: 12 },
  metaRow: { marginTop: spacing.md, flexDirection: "row", justifyContent: "space-between" },

  error: { color: colors.danger, marginHorizontal: spacing.lg, marginBottom: spacing.sm },

  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },

  // Optional bottom CTA
  bottomCta: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  ctaBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#FFFFFF", fontWeight: "900" },
});
