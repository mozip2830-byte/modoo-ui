import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import {
  getOpenRequestsPage,
  getMyQuotedRequestsPage,
} from "@/src/actions/requestActions";
import { DocumentSnapshot } from "firebase/firestore";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { PartnerDoc, RequestDoc } from "@/src/types/models";
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
    return new Date(value).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  if (typeof value === "string") {
    const compact = value.replace(/\s+/g, " ").trim();
    const match = compact.match(/(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        const mm = String(month).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return `${year}. ${mm}. ${dd}.`;
      }
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    }
  }
  if (value && typeof value === "object" && "toMillis" in value) {
    const ms = (value as { toMillis?: () => number }).toMillis?.();
    if (typeof ms === "number" && Number.isFinite(ms)) {
      return new Date(ms).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
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

function getCustomerName(value: any): string {
  const raw = value?.customerName ?? value?.customerNickname ?? "";
  return String(raw).trim();
}

function normalizeRegion(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function isExpiredRequest(value: RequestDoc): boolean {
  const createdAt = value.createdAt;
  let createdMs: number | null = null;
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    createdMs = createdAt;
  } else if (createdAt && typeof createdAt === "object" && "toMillis" in createdAt) {
    const ms = (createdAt as { toMillis?: () => number }).toMillis?.();
    if (typeof ms === "number" && Number.isFinite(ms)) createdMs = ms;
  }
  if (!createdMs) return false;
  return Date.now() - createdMs >= FIVE_DAYS_MS;
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
    item?.serviceType,
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

function getRequestServiceName(item: any): string {
  return normalizeValue(item?.serviceType);
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

  const primaryService = getRequestServiceName(item as any).toLowerCase();
  const candidates = primaryService
    ? [primaryService]
    : getRequestServiceCandidates(item as any)
        .map((v) => v.toLowerCase())
        .filter(Boolean);
  const serviceMatch =
    !normalizedServices.length ||
    candidates.some((svc) =>
      normalizedServices.some((s) => s.toLowerCase() === svc)
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
  const [lastDocOpen, setLastDocOpen] = useState<DocumentSnapshot | null>(null);
  const [lastDocMine, setLastDocMine] = useState<DocumentSnapshot | null>(null);
  const [hasMoreOpen, setHasMoreOpen] = useState(true);
  const [hasMoreMine, setHasMoreMine] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const onEndReachedCalledDuringMomentum = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ✅ 탭 변경 시 리셋
  useEffect(() => {
    if (tab === "open") {
      setOpenRequests([]);
      setLastDocOpen(null);
      setHasMoreOpen(true);
      setHasUserScrolled(false);
      setSearchQuery("");
      loadOpenPage();
    } else {
      setMyRequests([]);
      setLastDocMine(null);
      setHasMoreMine(true);
      setHasUserScrolled(false);
      setSearchQuery("");
      loadMyPage();
    }
  }, [tab]);

  // 신규 요청 첫 페이지 로드
  const loadOpenPage = useCallback(async () => {
    setLoadingOpen(true);
    try {
      const result = await getOpenRequestsPage(10);
      setOpenRequests(result.docs);
      setLastDocOpen(result.lastDoc);
      setHasMoreOpen(result.docs.length === 10);
      setErrorOpen(null);
    } catch (err) {
      console.error("[partner][requests] load open error", err);
      setErrorOpen("데이터를 불러오지 못했습니다.");
    } finally {
      setLoadingOpen(false);
    }
  }, []);

  // 내 견적 첫 페이지 로드
  const loadMyPage = useCallback(async () => {
    if (!partnerId) {
      setMyRequests([]);
      setLoadingMine(false);
      return;
    }
    setLoadingMine(true);
    try {
      const result = await getMyQuotedRequestsPage(partnerId, 10);
      setMyRequests(result.docs);
      setLastDocMine(result.lastDoc);
      setHasMoreMine(result.docs.length === 10);
      setErrorMine(null);
    } catch (err) {
      console.error("[partner][requests] load my error", err);
      setErrorMine("데이터를 불러오지 못했습니다.");
    } finally {
      setLoadingMine(false);
    }
  }, [partnerId]);

  // 초기 로드
  useEffect(() => {
    loadOpenPage();
  }, []);

  useEffect(() => {
    if (!partnerId) {
      setServiceCategories([]);
      setServiceRegions([]);
      setLoadingSettings(false);
      return;
    }

    setLoadingSettings(true);
    const unsub = onSnapshot(
      doc(db, "partners", partnerId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PartnerDoc;
          setServiceCategories(data.serviceCategories ?? []);
          setServiceRegions(data.serviceRegions ?? []);
        } else {
          setServiceCategories([]);
          setServiceRegions([]);
        }
        setLoadingSettings(false);
      },
      (err) => {
        console.error("[partner][requests] load settings error", err);
        setServiceCategories([]);
        setServiceRegions([]);
        setLoadingSettings(false);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);


  const filteredOpenRequests = useMemo(() => {
    if (!partnerId) return [];
    if (loadingSettings) return [];
    return openRequests.filter((item) => {
      const quoteCount = item.quoteCount ?? 0;
      const expired = isExpiredRequest(item);
      if (expired || quoteCount >= 10) return false;
      if (item.status === "cancelled") return false;
      if (item.status === "closed") return false;
      if (item.targetPartnerId && item.targetPartnerId !== partnerId) return false;
      if (myRequestIds && myRequestIds.has(item.id)) return false;
      return matchesPartnerSettings(item, serviceCategories, serviceRegions);
    });
  }, [openRequests, loadingSettings, serviceCategories, serviceRegions, partnerId, myRequestIds]);

  const myRequestIds = useMemo(() => {
    return new Set(myRequests.map((r) => r.id));
  }, [myRequests]);

  const filteredMyRequests = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return myRequests;
    return myRequests.filter((item) => getCustomerName(item).toLowerCase().includes(keyword));
  }, [myRequests, searchQuery]);

  const data = useMemo(() => {
    return tab === "open" ? filteredOpenRequests : filteredMyRequests;
  }, [filteredOpenRequests, filteredMyRequests, tab]);

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

      {tab === "mine" ? (
        <View style={styles.searchWrap}>
          <FontAwesome name="search" size={14} color={colors.subtext} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="고객 이름으로 검색"
            placeholderTextColor={colors.subtext}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onScrollBeginDrag={() => {
          onEndReachedCalledDuringMomentum.current = false;
          setHasUserScrolled(true);
        }}
        onMomentumScrollBegin={() => {
          onEndReachedCalledDuringMomentum.current = false;
          setHasUserScrolled(true);
        }}
        ListEmptyComponent={
          loading ? (
            <EmptyState title={LABELS.messages.loading} />
          ) : (
            <EmptyState title="요청이 없습니다." description="잠시 후 다시 확인해 주세요." />
          )
        }
        onEndReached={async () => {
          if (loadingMore || loading) return;
          if (!hasUserScrolled) return;
          if (onEndReachedCalledDuringMomentum.current) return;
          onEndReachedCalledDuringMomentum.current = true;

          if (tab === "open") {
            if (!hasMoreOpen || !lastDocOpen) return;
            setLoadingMore(true);
            try {
              const result = await getOpenRequestsPage(10, lastDocOpen);
              setOpenRequests((prev) => [...prev, ...result.docs]);
              setLastDocOpen(result.lastDoc);
              setHasMoreOpen(result.docs.length === 10);
            } catch (err) {
              console.error("[partner][requests] load more open error", err);
            } finally {
              setLoadingMore(false);
            }
          } else {
            if (!hasMoreMine || !lastDocMine || !partnerId) return;
            setLoadingMore(true);
            try {
              const result = await getMyQuotedRequestsPage(partnerId, 10, lastDocMine);
              setMyRequests((prev) => [...prev, ...result.docs]);
              setLastDocMine(result.lastDoc);
              setHasMoreMine(result.docs.length === 10);
            } catch (err) {
              console.error("[partner][requests] load more my error", err);
            } finally {
              setLoadingMore(false);
            }
          }
        }}
        onEndReachedThreshold={0.2}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>로딩 중...</Text>
            </View>
          ) : null
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
                <View style={styles.cardTags}>
                  {item.targetPartnerId ? <Chip label="지정요청" tone="warning" /> : null}
                  <Chip
                    label={
                      isExpiredRequest(item) || (item.quoteCount ?? 0) >= 10 || item.status === "closed"
                        ? "마감"
                        : "접수"
                    }
                  />
                  {tab === "mine" && item.status === "completed" ? (
                    <Chip label="거래완료" tone="success" />
                  ) : null}
                  {tab === "open" && myRequestIds.has(item.id) ? <Chip label="제출완료" tone="success" /> : null}
                </View>
              </CardRow>
              {item.note ? (
                <Text style={styles.cardNote} numberOfLines={2}>
                  요청: {item.note}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text style={styles.cardMeta}>
                  고객: {(item as any).customerName ?? (item as any).customerNickname ?? "-"}
                </Text>
                {item.desiredDateMs ? (
                  <Text style={styles.cardMeta}>
                    희망일: {formatDateTime(item.desiredDateMs)}
                  </Text>
                ) : null}
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingFooter: {
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 12,
    color: colors.subtext,
  },
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
  cardTags: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardSub: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  cardNote: { marginTop: spacing.xs, color: colors.text, fontSize: 12 },
  cardMeta: { color: colors.subtext, fontSize: 12 },
  metaRow: { marginTop: spacing.md, flexDirection: "column", gap: spacing.xs },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
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
