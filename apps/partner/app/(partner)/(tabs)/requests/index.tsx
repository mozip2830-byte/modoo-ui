import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { subscribeOpenRequestsForPartner } from "@/src/actions/requestActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { useAuthedQueryGuard } from "@/src/lib/useAuthedQueryGuard";
import type { RequestDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

function formatNumberSafe(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed.toLocaleString("ko-KR");
  }
  return "-";
}

export default function PartnerRequestsTab() {
  const router = useRouter();

  // ✅ AuthProvider 기반 가드로 통일 (ready/uid 흔들림 방지)
  const { enabled, uid, status } = useAuthedQueryGuard();

  const target = uid ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  const [items, setItems] = useState<RequestDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ✅ 핵심: enabled(=auth 확정) + uid 확정 전에는 절대 Firestore 구독 시작 금지
    if (!enabled || !uid) {
      setItems([]);
      setError(null);
      return;
    }

    // ✅ uid를 "명시적으로" 넘겨서, 내부에서 auth를 다시 참조/쿼리하지 못하게 막는다
    const unsub = subscribeOpenRequestsForPartner({
  onData: (data) => {
    setItems(data);
    setError(null);
  },
  onError: (err) => {
    console.error("[partner][requests] load error", err);
    setError(LABELS.messages.errorLoadRequests);
  },
});


    return () => {
      if (unsub) unsub();
    };
  }, [enabled, uid]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title={LABELS.headers.requests}
        subtitle="요청 목록을 확인하세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/(partner)/notifications" />
            <TouchableOpacity onPress={() => router.push(target)} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title={uid ? LABELS.messages.noRequests : LABELS.messages.loginRequired}
            description={
              uid ? "아직 새로운 요청이 없습니다." : "로그인 후 요청 목록을 확인할 수 있습니다."
            }
          />
        }
        renderItem={({ item }) => (
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
                  {LABELS.labels.budget}: {formatNumberSafe(item.budget)}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.createdAt ? formatTimestamp(item.createdAt as never) : LABELS.messages.justNow}
                </Text>
              </View>
              {status === "authLoading" ? (
                <Text style={styles.hint}>로그인 정보를 확인 중입니다…</Text>
              ) : null}
            </Card>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  cardWrap: { marginBottom: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardSub: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  cardMeta: { color: colors.subtext, fontSize: 12 },
  metaRow: { marginTop: spacing.md, flexDirection: "row", justifyContent: "space-between" },
  error: { color: colors.danger, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  hint: { marginTop: spacing.sm, color: colors.subtext, fontSize: 12 },
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
