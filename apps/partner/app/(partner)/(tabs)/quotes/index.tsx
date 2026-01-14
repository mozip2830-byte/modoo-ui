import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import {
  subscribeOpenRequestsForPartner,
  subscribeMyQuotedRequestsForPartner,
} from "@/src/actions/requestActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { RequestDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { Screen } from "@/src/components/Screen";

type TabKey = "open" | "mine";

export default function PartnerQuotesTab() {
  const router = useRouter();
  const partnerId = useAuthUid();
  const target = partnerId ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";
  const [tab, setTab] = useState<TabKey>("open");
  const [openRequests, setOpenRequests] = useState<RequestDoc[]>([]);
  const [myRequests, setMyRequests] = useState<RequestDoc[]>([]);
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

  const data = useMemo(() => (tab === "open" ? openRequests : myRequests), [openRequests, myRequests, tab]);
  const loading = tab === "open" ? loadingOpen : loadingMine;
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
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSub}>{item.location}</Text>
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
});
