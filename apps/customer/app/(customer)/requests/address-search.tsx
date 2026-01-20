import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/src/components/Screen";
import { setAddressDraft, type AddressDraft } from "@/src/lib/addressDraftStore";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { colors, radius, spacing } from "@/src/ui/tokens";

type KakaoAddressDoc = {
  address_name: string;
  road_address?: {
    address_name?: string;
    building_name?: string;
    zone_no?: string;
    region_3depth_name?: string;
  } | null;
  address?: {
    address_name?: string;
    region_3depth_name?: string;
  } | null;
};

function pickDong(doc: KakaoAddressDoc) {
  const direct =
    doc.road_address?.region_3depth_name ||
    doc.address?.region_3depth_name ||
    "";
  if (direct) return direct;

  const tokens = (doc.address_name ?? "").split(/\s+/).filter(Boolean);
  const suffixes = ["동", "읍", "면"];
  const idx = tokens.findIndex((t) => suffixes.some((s) => t.endsWith(s)));
  if (idx >= 0) return tokens.slice(0, idx + 1).join(" ");
  return tokens.slice(0, Math.min(3, tokens.length)).join(" ");
}

export default function AddressSearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<KakaoAddressDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSearch = useMemo(() => query.trim().length > 1, [query]);

  const onSearch = async () => {
    if (!canSearch) return;
    const kakaoKey = (
      process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY ??
      process.env.EXPO_PUBLIC_KAKAO_REST_KEY ??
      ""
    ).trim();
    if (!kakaoKey) {
      setError("Kakao API 키가 설정되지 않았습니다.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
        query.trim()
      )}`;
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { documents?: KakaoAddressDoc[] };
      setItems(data.documents ?? []);
    } catch (e) {
      console.error("[address-search] fetch error", e);
      setError("주소 검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const onSelect = (doc: KakaoAddressDoc) => {
    const roadAddress = doc.road_address?.address_name ?? doc.address_name;
    const jibunAddress = doc.address?.address_name ?? doc.address_name;
    const dong = pickDong(doc);

    const draft: AddressDraft = {
      roadAddress,
      jibunAddress,
      zonecode: doc.road_address?.zone_no,
      bname: dong,
      buildingName: doc.road_address?.building_name,
    };

    setAddressDraft(draft);
    router.back();
  };

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title="주소 검색"
        subtitle="동까지 입력해 주세요."
        rightAction={
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.8}>
            <Text style={styles.closeText}>닫기</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            if (error) setError(null);
          }}
          placeholder="예) 강남구 역삼동"
          placeholderTextColor={colors.subtext}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
        <TouchableOpacity style={[styles.searchBtn, !canSearch && styles.searchBtnDisabled]} onPress={onSearch} disabled={!canSearch}>
          <Text style={styles.searchBtnText}>검색</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>검색 중...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, idx) => `${item.address_name}-${idx}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const dong = pickDong(item);
            const road = item.road_address?.address_name ?? item.address_name;
            return (
              <TouchableOpacity style={styles.resultItem} onPress={() => onSelect(item)}>
                <Text style={styles.resultTitle}>{dong || "주소"}</Text>
                <Text style={styles.resultSub} numberOfLines={2}>
                  {road}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  closeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  closeText: { color: colors.text, fontWeight: "700" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    fontWeight: "700",
  },
  searchBtn: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnDisabled: { opacity: 0.4 },
  searchBtnText: { color: "#fff", fontWeight: "800" },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  loadingBox: { padding: spacing.lg, alignItems: "center", gap: spacing.sm },
  loadingText: { color: colors.subtext },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  resultItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  resultTitle: { color: colors.text, fontWeight: "800" },
  resultSub: { color: colors.subtext, fontSize: 12 },
  emptyText: { color: colors.subtext, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
