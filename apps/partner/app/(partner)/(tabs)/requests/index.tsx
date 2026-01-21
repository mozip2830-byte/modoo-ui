import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { subscribeOpenRequestsForPartner } from "@/src/actions/requestActions";
import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthedQueryGuard } from "@/src/lib/useAuthedQueryGuard";
import type { PartnerDoc, RequestDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { formatTimestamp } from "@/src/utils/time";

function formatDateValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toLocaleDateString("ko-KR");
  }
  if (value && typeof value === "object" && "toMillis" in value) {
    const ms = (value as { toMillis?: () => number }).toMillis?.();
    if (typeof ms === "number" && Number.isFinite(ms)) {
      return new Date(ms).toLocaleDateString("ko-KR");
    }
  }
  return "-";
}

function normalizeValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function getRequestServiceCategory(item: any): string | null {
  const v =
    item?.serviceCategory ??
    item?.serviceCategories ??
    item?.service ??
    item?.serviceName ??
    item?.serviceType ??
    item?.category ??
    item?.type ??
    null;

  if (!v) return null;
  if (Array.isArray(v)) {
    return v.length ? normalizeValue(v[0]) : null;
  }
  const out = normalizeValue(v);
  return out ? out : null;
}

function getRequestRegions(item: any): string[] {
  const candidates = [
    item?.serviceRegions,
    item?.serviceRegion,
    item?.regions,
    item?.region,
    item?.addressDong,
    item?.addressRoad,
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
  if (!services.length || !regions.length) return false;

  const service = getRequestServiceCategory(item as any);
  const serviceMatch = service ? services.includes(service) : false;

  const requestRegions = getRequestRegions(item as any);
  const regionMatch = requestRegions.some((r) => regions.some((p) => r.includes(p)));

  return serviceMatch && regionMatch;
}

export default function PartnerRequestsTab() {
  const router = useRouter();

  // AuthProvider ?? ??? ?? (ready/uid ??? ??)
  const { enabled, uid, status } = useAuthedQueryGuard();

  const target = uid ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  const [items, setItems] = useState<RequestDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);
  const [serviceRegions, setServiceRegions] = useState<string[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    // enabled(=auth ??) + uid ?? ??? ?? Firestore ?? ?? ??
    if (!enabled || !uid) {
      setItems([]);
      setError(null);
      setServiceCategories([]);
      setServiceRegions([]);
      setLoadingSettings(false);
      return;
    }

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

  useEffect(() => {
    const run = async () => {
      if (!uid) {
        setServiceCategories([]);
        setServiceRegions([]);
        setLoadingSettings(false);
        return;
      }
      setLoadingSettings(true);
      try {
        const snap = await getDoc(doc(db, "partners", uid));
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
  }, [uid]);

  const filteredItems = useMemo(() => {
    if (!uid) return [];
    if (loadingSettings) return [];
    return items.filter((item) => matchesPartnerSettings(item, serviceCategories, serviceRegions));
  }, [items, loadingSettings, serviceCategories, serviceRegions, uid]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title={LABELS.headers.requests}
        subtitle="?? ??? ?????."
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
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title={uid ? LABELS.messages.noRequests : LABELS.messages.loginRequired}
            description={
              uid
                ? loadingSettings
                  ? "??? ??? ?? ????."
                  : "??? ??? ??? ??? ?? ??? ????."
                : "??? ? ?? ??? ??? ? ????."
            }
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cardWrap}
            onPress={() => router.push(`/(partner)/(tabs)/requests/${item.id}`)}
          >
            <Card>
              <CardRow>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    {item.serviceType ?? "-"}
                    {item.serviceSubType ? ` / ${item.serviceSubType}` : ""}
                  </Text>
                  <Chip label={item.status === "open" ? "??" : "??"} />
                </View>
              </CardRow>
              <View style={styles.subRow}>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {item.addressRoad ?? item.addressDong ?? "-"}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.cardMeta}>
                  ?? {item.desiredDateMs ? formatDateValue(item.desiredDateMs) : "-"}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.createdAt ? formatTimestamp(item.createdAt as never) : LABELS.messages.justNow}
                </Text>
              </View>
              {item.note ? (
                <Text style={styles.cardNote} numberOfLines={2}>
                  ????: {item.note}
                </Text>
              ) : null}
              {item.description ? (
                <Text style={styles.cardNote} numberOfLines={2}>
                  ????: {item.description}
                </Text>
              ) : null}
              {status === "authLoading" ? (
                <Text style={styles.hint}>??? ??? ?? ?????</Text>
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
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: colors.text, flex: 1, marginRight: spacing.sm },
  subRow: { marginTop: spacing.xs, flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  cardSub: { color: colors.subtext, fontSize: 13, flex: 1 },
  cardMeta: { color: colors.subtext, fontSize: 13 },
  metaRow: { marginTop: spacing.sm, flexDirection: "row", justifyContent: "space-between" },
  cardNote: { marginTop: spacing.xs, color: colors.text, fontSize: 13 },
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
