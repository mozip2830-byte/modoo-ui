import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import {
  subscribeOpenRequestsForPartner,
  subscribeMyQuotedRequestsForPartner,
} from "@/src/actions/requestActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { PartnerDoc, RequestDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";
import { db } from "@/src/firebase";

type TabKey = "open" | "mine";

function formatNumberSafe(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) return parsed.toLocaleString("ko-KR");
    }
  }
  return "-";
}

function formatDateTime(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (value && typeof value === "object" && "toMillis" in value) {
    const ms = (value as { toMillis?: () => number }).toMillis?.();
    if (typeof ms === "number" && Number.isFinite(ms)) {
      return new Date(ms).toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return "-";
}

function normalizeValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeRegion(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function getRegionRoot(value: string): string {
  const normalized = normalizeRegion(value);
  if (!normalized) return "";
  const aliases: Array<{ key: string; patterns: string[] }> = [
    { key: "서울", patterns: ["서울", "서울특별시"] },
    { key: "경기", patterns: ["경기", "경기도"] },
    { key: "인천", patterns: ["인천", "인천광역시"] },
    { key: "부산", patterns: ["부산", "부산광역시"] },
    { key: "대구", patterns: ["대구", "대구광역시"] },
    { key: "광주", patterns: ["광주", "광주광역시"] },
    { key: "대전", patterns: ["대전", "대전광역시"] },
    { key: "울산", patterns: ["울산", "울산광역시"] },
    { key: "세종", patterns: ["세종", "세종특별자치시"] },
    { key: "강원", patterns: ["강원", "강원도", "강원특별자치도"] },
    { key: "충북", patterns: ["충북", "충청북", "충청북도"] },
    { key: "충남", patterns: ["충남", "충청남", "충청남도"] },
    { key: "충청", patterns: ["충청", "충청도"] },
    { key: "전북", patterns: ["전북", "전라북", "전라북도"] },
    { key: "전남", patterns: ["전남", "전라남", "전라남도"] },
    { key: "전라", patterns: ["전라", "전라도"] },
    { key: "경북", patterns: ["경북", "경상북", "경상북도"] },
    { key: "경남", patterns: ["경남", "경상남", "경상남도"] },
    { key: "경상", patterns: ["경상", "경상도"] },
    { key: "제주", patterns: ["제주", "제주특별자치도"] },
  ];

  for (const alias of aliases) {
    for (const pattern of alias.patterns) {
      const key = normalizeRegion(pattern);
      if (normalized.startsWith(key)) return alias.key;
    }
  }

  return normalized.replace(/(특별자치시|특별시|광역시|특별자치도|자치도|도|시)$/u, "");
}

function getRequestServiceCandidates(item: any): string[] {
  const raw = [
    item?.serviceCategory,
    item?.serviceCategories,
    item?.service,
    item?.serviceName,
    item?.serviceType,
    item?.serviceSubType,
    item?.category,
    item?.type,
  ];

  const collected: string[] = [];
  raw.forEach((v) => {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach((x) => {
        const n = normalizeValue(x);
        if (n) collected.push(n);
      });
      return;
    }
    const n = normalizeValue(v);
    if (n) collected.push(n);
  });

  return Array.from(new Set(collected));
}

function getRequestRegions(item: any): string[] {
  const candidates = [
    item?.serviceRegions,
    item?.serviceRegion,
    item?.regions,
    item?.region,
    item?.addressDong,
    item?.addressRoad,
    item?.addressJibun,
    item?.address,
    item?.addressFull,
    item?.addressRoadFull,
    item?.location,
    item?.serviceArea,
  ];

  const collected: string[] = [];
  candidates.forEach((v) => {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach((x) => {
        const n = normalizeValue(x);
        if (n) collected.push(n);
      });
      return;
    }
    const n = normalizeValue(v);
    if (n) collected.push(n);
  });
  return collected;
}

function matchesPartnerSettings(
  item: RequestDoc,
  services: string[],
  regions: string[]
): boolean {
  const normalizedServices = services.map(normalizeValue).filter(Boolean);
  const normalizedPartnerRegions = regions.map(normalizeRegion).filter(Boolean);

  const candidates = getRequestServiceCandidates(item as any)
    .map((v) => v.toLowerCase())
    .filter(Boolean);
  const serviceMatch =
    !normalizedServices.length ||
    candidates.some((svc) =>
      normalizedServices.some((s) => {
        const value = s.toLowerCase();
        return value === svc || svc.includes(value) || value.includes(svc);
      })
    );

  const requestRegions = getRequestRegions(item as any)
    .map(normalizeRegion)
    .filter(Boolean);
  const regionMatch =
    !normalizedPartnerRegions.length ||
    !requestRegions.length ||
    requestRegions.some((r) =>
      normalizedPartnerRegions.some((p) => {
        if (!r || !p) return false;
        const requestRoot = getRegionRoot(r);
        const partnerRoot = getRegionRoot(p);
        return (
          r.includes(p) ||
          p.includes(r) ||
          (requestRoot && partnerRoot && requestRoot === partnerRoot)
        );
      })
    );

  return serviceMatch && regionMatch;
}

export default function PartnerQuotesTab() {
  const router = useRouter();
  const { uid: partnerId } = useAuthUid();
  const target = partnerId ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";
  const [tab, setTab] = useState<TabKey>("open");
  const [openRequests, setOpenRequests] = useState<RequestDoc[]>([]);
  const [myRequests, setMyRequests] = useState<RequestDoc[]>([]);
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);
  const [serviceRegions, setServiceRegions] = useState<string[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingOpen, setLoadingOpen] = useState(true);
  const [loadingMine, setLoadingMine] = useState(true);
  const [errorOpen, setErrorOpen] = useState<string | null>(null);
  const [errorMine, setErrorMine] = useState<string | null>(null);

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
    const run = async () => {
      if (!partnerId) {
        setServiceCategories([]);
        setServiceRegions([]);
        setLoadingSettings(false);
        return;
      }
      setLoadingSettings(true);
      try {
        const snap = await getDoc(doc(db, "partners", partnerId));
        if (snap.exists()) {
          const data = snap.data() as PartnerDoc;
          setServiceCategories(data.serviceCategories ?? []);
          setServiceRegions(data.serviceRegions ?? []);
        } else {
          setServiceCategories([]);
          setServiceRegions([]);
        }
      } catch (err) {
        console.error("[partner][requests] load settings error", err);
        setServiceCategories([]);
        setServiceRegions([]);
      } finally {
        setLoadingSettings(false);
      }
    };
    run();
  }, [partnerId]);

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

  const filteredOpenRequests = useMemo(() => {
    if (!partnerId) return [];
    if (loadingSettings) return [];
    return openRequests.filter((item) => {
      if (item.targetPartnerId && item.targetPartnerId !== partnerId) return false;
      return matchesPartnerSettings(item, serviceCategories, serviceRegions);
    });
  }, [openRequests, loadingSettings, serviceCategories, serviceRegions, partnerId]);

  const data = useMemo(
    () => (tab === "open" ? filteredOpenRequests : myRequests),
    [filteredOpenRequests, myRequests, tab]
  );
  const loading = tab === "open" ? loadingOpen || loadingSettings : loadingMine;
  const error = tab === "open" ? errorOpen : errorMine;

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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <EmptyState title={LABELS.messages.loading} />
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
                  <Text style={styles.cardTitle}>
                    {item.serviceType
                      ? `${item.serviceType}${item.serviceSubType ? ` / ${item.serviceSubType}` : ""}`
                      : item.title ?? "서비스 요청"}
                  </Text>
                  <Text style={styles.cardSub}>
                    {item.addressRoad ?? item.addressDong ?? item.location ?? "주소 미입력"}
                  </Text>
                </View>
                <Chip label={item.status === "open" ? "접수" : "마감"} />
              </CardRow>
              {item.note ? (
                <Text style={styles.cardNote} numberOfLines={2}>
                  요청: {item.note}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                {item.desiredDateMs ? (
                  <Text style={styles.cardMeta}>
                    희망일 {formatDateTime(item.desiredDateMs)}
                  </Text>
                ) : null}
                <Text style={styles.cardMeta}>
                  작성 {item.createdAt ? formatTimestamp(item.createdAt as never) : LABELS.messages.justNow}
                </Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
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
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  cardWrap: { marginBottom: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardSub: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  cardNote: { marginTop: spacing.xs, color: colors.text, fontSize: 12 },
  cardMeta: { color: colors.subtext, fontSize: 12 },
  metaRow: { marginTop: spacing.md, flexDirection: "column", gap: spacing.xs },
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
});
