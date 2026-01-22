import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";

import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { PartnerDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, radius, spacing } from "@/src/ui/tokens";

type Room = {
  id: string;
  customerName: string;
  customerPhotoUrl?: string | null;
  addressText?: string | null;
  customerId?: string | null;
  requestId?: string | null;
  lastMessageText?: string | null;

  // ✅ 필터용(서비스만 유지)
  serviceName?: string | null;

  // ✅ 마지막 메시지 시간(표시용)
  lastMessageAt?: number | null; // ms timestamp
};

function formatAddressToDong(address?: string | null) {
  const raw = (address ?? "").trim();
  if (!raw) return "주소 정보 없음";

  const tokens = raw.split(/\s+/).filter(Boolean);

  const findIndexBySuffix = (suffixes: string[]) => {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (suffixes.some((s) => t.endsWith(s))) return i;
    }
    return -1;
  };

  // 우선순위: 동 → 읍/면 → 구
  let idx = findIndexBySuffix(["동"]);
  if (idx < 0) idx = findIndexBySuffix(["읍", "면"]);
  if (idx < 0) idx = findIndexBySuffix(["구"]);

  if (idx >= 0) return tokens.slice(0, idx + 1).join(" ");
  return tokens.slice(0, Math.min(3, tokens.length)).join(" ");
}

function resolveServiceName(request?: Record<string, unknown> | null) {
  const serviceType = String(request?.serviceType ?? "").trim();
  const serviceSubType = String(request?.serviceSubType ?? "").trim();
  const title = String(request?.title ?? "").trim();
  if (serviceType && serviceSubType) return `${serviceType} / ${serviceSubType}`;
  if (serviceType) return serviceType;
  if (title) return title;
  return "요청";
}

function resolveAddress(request?: Record<string, unknown> | null) {
  const addressRoad = String(request?.addressRoad ?? "").trim();
  const addressDong = String(request?.addressDong ?? "").trim();
  const location = String(request?.location ?? "").trim();
  return addressRoad || addressDong || location || "주소 정보 없음";
}

function resolveCustomerName(request?: Record<string, unknown> | null, fallbackName?: string | null) {
  const nameFromRequest = String(request?.customerName ?? request?.customerNickname ?? "").trim();
  const cleanFallback = String(fallbackName ?? "").trim();
  const fallbackLooksLikePhone = /\d{3,}/.test(cleanFallback);
  if (nameFromRequest) return nameFromRequest;
  if (cleanFallback && !fallbackLooksLikePhone) return cleanFallback;
  return "고객";
}

function toMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "number") return v;
  // Firestore Timestamp
  const ts = v as Timestamp;
  if (typeof (ts as any).toMillis === "function") return (ts as any).toMillis();
  return null;
}

function formatLastTime(ms?: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();

  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isSameDay) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
      <FontAwesome name="chevron-down" size={12} color={colors.subtext} />
    </TouchableOpacity>
  );
}

function FilterSheet({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.sheetClose} activeOpacity={0.85}>
              <FontAwesome name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
          >
            {options.map((opt) => {
              const active = opt === value;
              return (
                <TouchableOpacity
                  key={opt}
                  activeOpacity={0.85}
                  onPress={() => {
                    onSelect(opt);
                    onClose();
                  }}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{opt}</Text>
                  {active ? <FontAwesome name="check" size={16} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function PartnerChatsScreen() {
  const router = useRouter();
  const { uid } = useAuthUid();
  const target = uid ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  // ✅ 실데이터
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);

  // ✅ 서비스 필터만 유지
  const [serviceFilter, setServiceFilter] = useState<string>("전체");
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);

  // ========================================
  // Firestore: chats list (partner)
  // ========================================
  useEffect(() => {
    if (!uid) {
      setRooms([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const requestCache = new Map<string, Record<string, unknown> | null>();

    // NOTE: where(partnerId==uid) + orderBy(updatedAt) 는 보통 복합 인덱스 필요할 수 있음.
    const q = query(
      collection(db, "chats"),
      where("partnerId", "==", uid),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        void (async () => {
          const base = snap.docs.map((d) => {
            const data = d.data() as any;
            const idParts = String(d.id).split("_");
            const requestIdFromId = idParts[0] || null;
            const customerIdFromId = idParts.length > 2 ? idParts.slice(2).join("_") : null;
            const lastAt = toMs(data.lastMessageAt) ?? toMs(data.updatedAt) ?? null;
            return {
              id: d.id,
              requestId: data.requestId ?? requestIdFromId,
              customerId: data.customerId ?? customerIdFromId,
              lastMessageAt: lastAt,
              fallbackService: data.serviceName ?? data.serviceType ?? data.title ?? null,
              fallbackAddress: data.addressText ?? data.location ?? null,
              fallbackPhoto: data.customerPhotoUrl ?? null,
              fallbackCustomerName: data.customerName ?? data.customerPhone ?? null,
              fallbackLastMessage: data.lastMessageText ?? null,
            };
          });

          const requestIds = Array.from(
            new Set(base.map((item) => item.requestId).filter(Boolean) as string[])
          );
          await Promise.all([
            ...requestIds.map(async (id) => {
              if (requestCache.has(id)) return;
              try {
                const snap = await getDoc(doc(db, "requests", id));
                requestCache.set(id, snap.exists() ? (snap.data() as Record<string, unknown>) : null);
              } catch (err) {
                console.warn("[partner][chats] request load error", err);
                requestCache.set(id, null);
              }
            }),
          ]);

          const next: Room[] = base.map((item) => {
            const request = item.requestId ? requestCache.get(item.requestId) ?? null : null;
            const serviceName = request
              ? resolveServiceName(request)
              : item.fallbackService
              ? String(item.fallbackService)
              : "요청";
            const addressText = request
              ? resolveAddress(request)
              : item.fallbackAddress
              ? String(item.fallbackAddress)
              : "주소 정보 없음";
            const customerName = resolveCustomerName(
              request,
              item.fallbackCustomerName ? String(item.fallbackCustomerName) : null
            );
            const customerPhotoUrl =
              (request?.customerPhotoUrl as string | undefined) ?? item.fallbackPhoto ?? null;

            return {
              id: item.id,
              customerId: item.customerId,
              requestId: item.requestId,
              customerName,
              customerPhotoUrl,
              addressText,
              serviceName,
              lastMessageAt: item.lastMessageAt,
              lastMessageText: item.fallbackLastMessage ? String(item.fallbackLastMessage) : null,
            };
          });

          setRooms(next);
          setLoading(false);
        })();
      },
      (err: any) => {
        console.error("[partner][chats] list error", err?.code, err?.message);
        setRooms([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setServiceCategories([]);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "partners", uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PartnerDoc;
          setServiceCategories(data.serviceCategories ?? []);
        } else {
          setServiceCategories([]);
        }
      },
      (err) => {
        console.error("[partner][chats] load services error", err);
        setServiceCategories([]);
      }
    );

    return () => unsub();
  }, [uid]);

  const normalized = useMemo(() => {
    return rooms.map((r) => ({
      ...r,
      customerName: r.customerName?.trim() ? r.customerName : "고객",
      addressShort: formatAddressToDong(r.addressText),
      serviceName: r.serviceName ?? "미지정",
      lastTimeText: formatLastTime(r.lastMessageAt),
    }));
  }, [rooms]);

  const serviceOptions = useMemo(() => {
    if (serviceCategories.length) {
      return ["전체", ...serviceCategories];
    }
    const set = new Set<string>();
    normalized.forEach((r) => set.add(r.serviceName));
    return ["전체", ...Array.from(set)];
  }, [normalized, serviceCategories]);

  useEffect(() => {
    if (serviceFilter === "전체") return;
    if (!serviceOptions.includes(serviceFilter)) {
      setServiceFilter("전체");
    }
  }, [serviceOptions, serviceFilter]);

  const filtered = useMemo(() => {
    return normalized.filter((r) => {
      if (serviceFilter === "전체") return true;
      const name = (r.serviceName ?? "").toLowerCase();
      const filterValue = serviceFilter.toLowerCase();
      return name === filterValue || name.includes(filterValue) || filterValue.includes(name);
    });
  }, [normalized, serviceFilter]);

  const filterLabel = useMemo(() => {
    return serviceFilter === "전체" ? "전체 서비스" : serviceFilter;
  }, [serviceFilter]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title={LABELS.headers.chats}
        subtitle="최근 대화 목록을 확인하세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/(partner)/notifications" />
            <TouchableOpacity onPress={() => router.push(target)} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* ✅ 상단 필터 상태 + 전체 선택 */}
      <View style={styles.filterBar}>
        <View style={styles.filterTopRow}>
          <Text style={styles.filterStatus} numberOfLines={1}>
            필터: {filterLabel}
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setServiceFilter("전체")}
            style={styles.resetBtn}
          >
            <Text style={styles.resetText}>초기화</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterChipsRow}>
          <Chip
            label={serviceFilter === "전체" ? "서비스: 전체" : `서비스: ${serviceFilter}`}
            onPress={() => setServiceSheetOpen(true)}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cardWrap}
            onPress={() => router.push(`/(partner)/chats/${item.id}`)}
            activeOpacity={0.85}
          >
            <Card>
              <CardRow>
                {/* 고객 프로필 */}
                {item.customerPhotoUrl ? (
                  <Image source={{ uri: item.customerPhotoUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <FontAwesome name="user" size={18} color={colors.subtext} />
                  </View>
                )}

                {/* 3줄: (고객명 + 시간) / (서비스) / (주소) */}
                <View style={styles.info}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.customerName}
                    </Text>
                    <Text style={styles.timeText} numberOfLines={1}>
                      {item.lastTimeText}
                    </Text>
                  </View>

                  <Text style={styles.serviceText} numberOfLines={1}>
                    {item.serviceName}
                  </Text>

                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.addressShort}
                  </Text>

                  <Text style={styles.messageText} numberOfLines={1}>
                    {item.lastMessageText ?? "메시지 없음"}
                  </Text>
                </View>
              </CardRow>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <EmptyState title="불러오는 중…" description="채팅 목록을 가져오고 있습니다." />
          ) : (
            <EmptyState
              title="채팅이 없습니다."
              description={uid ? "서비스 필터를 초기화해 보세요." : "로그인이 필요합니다."}
            />
          )
        }
      />

      {/* ✅ 바텀시트: 서비스 */}
      <FilterSheet
        visible={serviceSheetOpen}
        title="서비스 선택"
        options={serviceOptions}
        value={serviceFilter}
        onSelect={(v) => setServiceFilter(v)}
        onClose={() => setServiceSheetOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },

  filterBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  filterTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  filterStatus: { flex: 1, color: colors.subtext, fontSize: 12 },
  resetBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  resetText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  filterChipsRow: { flexDirection: "row", gap: spacing.sm },

  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  cardWrap: { marginBottom: spacing.md },

  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  info: { flex: 1, marginLeft: spacing.md },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  timeText: { color: colors.subtext, fontSize: 12, fontWeight: "700" },

  serviceText: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  cardMeta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  messageText: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },

  // Bottom sheet
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: (radius as any)?.xl ?? radius.lg,
    borderTopRightRadius: (radius as any)?.xl ?? radius.lg,
    paddingBottom: spacing.lg,
    maxHeight: "70%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sheetHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  sheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sheetScroll: { paddingHorizontal: spacing.lg },
  sheetContent: { paddingBottom: spacing.lg, gap: 8 },

  optionRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionRowActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(0,199,174,0.12)",
  },
  optionText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  optionTextActive: { color: colors.primary },
});
