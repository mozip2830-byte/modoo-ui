import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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

import { Screen } from "@/src/components/Screen";
import { LABELS } from "@/src/constants/labels";
import { useAuthUid } from "@/src/lib/useAuthUid";
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
  const uid = useAuthUid();
  const target = uid ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  // ✅ 더미 데이터(실데이터로 교체해도 표시/필터 로직 그대로 사용 가능)
  const [rooms] = useState<Room[]>([
    {
      id: "room_1",
      customerName: "고객 A",
      customerPhotoUrl: null,
      addressText: "서울특별시 강서구 화곡동 123-4",
      serviceName: "입주청소",
      lastMessageAt: Date.now() - 1000 * 60 * 5,
    },
    {
      id: "room_2",
      customerName: "고객 B",
      customerPhotoUrl: null,
      addressText: "경기도 김포시 고촌읍 신곡리 10-2",
      serviceName: "이사청소",
      lastMessageAt: Date.now() - 1000 * 60 * 60 * 26,
    },
    {
      id: "room_3",
      customerName: "고객 C",
      customerPhotoUrl: null,
      addressText: "서울특별시 송파구 잠실동 20",
      serviceName: "거주청소",
      lastMessageAt: Date.now() - 1000 * 60 * 60 * 2,
    },
  ]);

  // ✅ 서비스 필터만 유지
  const [serviceFilter, setServiceFilter] = useState<string>("전체");
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);

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
    const set = new Set<string>();
    normalized.forEach((r) => set.add(r.serviceName));
    return ["전체", ...Array.from(set)];
  }, [normalized]);

  const filtered = useMemo(() => {
    return normalized.filter((r) => serviceFilter === "전체" || r.serviceName === serviceFilter);
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

                {/* 2줄: (고객명 + 시간) / (주소 동까지) */}
                <View style={styles.info}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.customerName}
                    </Text>
                    <Text style={styles.timeText} numberOfLines={1}>
                      {item.lastTimeText}
                    </Text>
                  </View>

                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.addressShort}
                  </Text>
                </View>
              </CardRow>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState title="채팅이 없습니다." description="서비스 필터를 초기화해 보세요." />
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
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  timeText: { color: colors.subtext, fontSize: 12, fontWeight: "700" },
  cardMeta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },

  // Bottom sheet
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: (radius as any)?.xl ?? radius.lg, // xl 없으면 lg fallback
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
