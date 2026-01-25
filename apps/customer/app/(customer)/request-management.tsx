import { usePathname, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { subscribeMyRequests } from "@/src/actions/requestActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { RequestDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

type RequestCounts = {
  open: number;
  closed: number;
};

const CLOSED_STATUSES = new Set<RequestDoc["status"]>(["closed", "completed", "cancelled"]);
const STATUS_LABELS: Record<RequestDoc["status"], string> = {
  open: "열림",
  closed: "마감",
  completed: "완료",
  cancelled: "취소",
};

export default function RequestManagementScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { uid } = useAuthUid();
  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const unsub = subscribeMyRequests(
      uid,
      (data) => {
        setRequests(data);
        setLoading(false);
      },
      (err) => {
        console.error("[request-management] load error", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  const counts = useMemo<RequestCounts>(() => {
    return requests.reduce(
      (acc, item) => {
        const isClosed = item.isClosed || CLOSED_STATUSES.has(item.status);
        if (isClosed) acc.closed += 1;
        else acc.open += 1;
        return acc;
      },
      { open: 0, closed: 0 }
    );
  }, [requests]);

  const navHeight = 56 + Math.max(insets.bottom, 0);
  const navItems = [
    { key: "home", label: "홈", icon: "home", href: "/(tabs)/home" },
    { key: "search", label: "파트너 찾기", icon: "search", href: "/(tabs)/search" },
    { key: "quotes", label: "받은 견적", icon: "file-text-o", href: "/(tabs)/quotes" },
    { key: "chats", label: "채팅", icon: "comments", href: "/(tabs)/chats" },
    { key: "profile", label: "내정보", icon: "user", href: "/(tabs)/profile" },
  ] as const;

  const handlePress = (id: string) => {
    router.push(`/(customer)/requests/${id}` as any);
  };

  const renderItem = ({ item }: { item: RequestDoc }) => {
    const isClosed = item.isClosed || CLOSED_STATUSES.has(item.status);
    const isCancelled = item.status === "cancelled";
    const statusLabel = STATUS_LABELS[item.status] ?? STATUS_LABELS.open;
    const statusTone = isCancelled ? "warning" : isClosed ? "default" : "success";
    const serviceType = (item as { serviceType?: string }).serviceType?.trim();
    const serviceSubType = (item as { serviceSubType?: string }).serviceSubType?.trim();
    const addressRoad = (item as { addressRoad?: string }).addressRoad?.trim();
    const addressDong = (item as { addressDong?: string }).addressDong?.trim();
    const title =
      serviceType && serviceSubType
        ? `${serviceType} / ${serviceSubType}`
        : serviceType
        ? serviceType
        : item.title?.trim() || "요청";
    const address = addressRoad || addressDong || item.location?.trim() || "-";

    return (
      <TouchableOpacity onPress={() => handlePress(item.id)} activeOpacity={0.7}>
        <Card style={styles.requestCard}>
          <View style={styles.requestHeader}>
            <Text style={styles.requestTitle} numberOfLines={1}>
              {title}
            </Text>
            <Chip label={statusLabel} tone={statusTone} />
          </View>
          <Text style={styles.requestMeta} numberOfLines={1}>
            {address}
          </Text>
          <View style={styles.requestFooter}>
            <Text style={styles.requestMeta}>요청번호 {item.id}</Text>
            <Text style={styles.requestDate}>
              {item.createdAt ? formatTimestamp(item.createdAt as any) : "방금"}
            </Text>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader title="요청 관리" subtitle="최근 요청을 확인하세요." />
      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>진행중</Text>
          <Text style={styles.summaryValue}>{counts.open}</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>마감</Text>
          <Text style={styles.summaryValue}>{counts.closed}</Text>
        </Card>
      </View>

      {loading ? (
        <View style={[styles.center, { paddingBottom: navHeight }]}>
          <Text style={styles.loadingText}>{LABELS.messages.loading}</Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={{ paddingBottom: navHeight }}>
          <EmptyState
            title={uid ? "??? ??? ????." : "???? ?????."}
            description={uid ? "??? ???? ??? ?????." : "??? ? ??? ? ????."}
          />
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: spacing.xl + navHeight }]}
          showsVerticalScrollIndicator={false}
        />
      )}
      <View
        style={[
          styles.bottomNav,
          { height: navHeight, paddingBottom: Math.max(insets.bottom, spacing.sm) },
        ]}
      >
        {navItems.map((item) => {
          const active = pathname.includes(`/${item.key}`);
          const color = active ? colors.primary : colors.subtext;
          return (
            <TouchableOpacity
              key={item.key}
              style={styles.navItem}
              onPress={() => router.push(item.href)}
            >
              <FontAwesome name={item.icon} size={20} color={color} />
              <Text style={[styles.navLabel, { color }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: colors.subtext },
  summaryRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg },
  summaryCard: { flex: 1, alignItems: "center", gap: spacing.xs, paddingVertical: spacing.md },
  summaryLabel: { fontSize: 12, color: colors.subtext },
  summaryValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  requestCard: { gap: spacing.xs },
  requestHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  requestTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },
  requestMeta: { fontSize: 12, color: colors.subtext },
  requestFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  requestDate: { fontSize: 12, color: colors.subtext },
  bottomNav: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  navItem: { alignItems: "center", justifyContent: "center", gap: 4 },
  navLabel: { fontSize: 11, fontWeight: "600" },
});
