import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SERVICE_CATEGORIES } from "@/src/constants/serviceCategories";
import { Screen } from "@/src/components/Screen";
import { colors, radius, spacing } from "@/src/ui/tokens";
import { useAuthUid } from "@/src/lib/useAuthUid";

type ServiceTree = Record<string, Record<string, string[]>>;

const SERVICE_TREE: ServiceTree = {
  청소: {
    "입주/이사청소": [],
    거주청소: [],
    특수청소: [],
    부분청소: [],
    "청소 도우미": [],
    사무실청소: [],
    "상업공간 청소": [],
  },
  "가전/가구 청소": {
    "가전 청소": ["에어컨청소", "냉장고청소", "세탁기청소", "실외기청소", "가전제품청소"],
    "가구 청소": ["가구청소", "침대청소", "소파청소"],
  },
  이사: {
    원룸이사: [],
    "가정집이사(투룸이상)": [],
    "사무실/상업공간 이사": [],
    용달이사: [],
  },
  인테리어: {
    주방: [],
    상담: [],
  },
  "시공/설치": {
    시공: [],
    설치: [],
  },
};

export default function ServicesPage() {
  const router = useRouter();
  const { uid } = useAuthUid();

  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(
    SERVICE_CATEGORIES[0]
  );
  const [selectedMiddle, setSelectedMiddle] = useState<string>(() => {
    const first = SERVICE_CATEGORIES[0];
    const middles = Object.keys(SERVICE_TREE[first] ?? {});
    return middles[0] ?? "";
  });
  const [filteredCategories, setFilteredCategories] = useState<string[]>(
    SERVICE_CATEGORIES
  );

  useEffect(() => {
    const filtered = SERVICE_CATEGORIES.filter((category) =>
      category.toLowerCase().includes(searchText.toLowerCase())
    );
    setFilteredCategories(filtered);

    if (filtered.length > 0 && !filtered.includes(selectedCategory)) {
      setSelectedCategory(filtered[0]);
    }
  }, [searchText, selectedCategory]);

  const middleItems = Object.keys(SERVICE_TREE[selectedCategory] ?? {});
  const middleKey = middleItems.includes(selectedMiddle) ? selectedMiddle : middleItems[0] ?? "";
  const smallItems = SERVICE_TREE[selectedCategory]?.[middleKey] ?? [];

  const handleSelectService = useCallback(
    (category: string, subType?: string) => {
      if (!uid) {
        router.push({ pathname: "/login", params: { force: "1" } });
        return;
      }
      router.push({
        pathname: "/(customer)/requests/new-chat",
        params: { serviceType: category, serviceSubType: subType },
      });
    },
    [uid, router]
  );

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>모두의 서비스</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.searchContainer}>
        <FontAwesome name="search" size={16} color={colors.subtext} />
        <TextInput
          style={styles.searchInput}
          placeholder="서비스 검색"
          placeholderTextColor={colors.subtext}
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText ? (
          <TouchableOpacity onPress={() => setSearchText("") }>
            <FontAwesome name="times" size={16} color={colors.subtext} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.content}>
        <View style={styles.leftColumn}>
          <FlatList
            data={filteredCategories}
            keyExtractor={(item) => item}
            scrollEnabled={false}
            removeClippedSubviews={true}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.categoryItem,
                  selectedCategory === item && styles.categoryItemActive,
                ]}
                onPress={() => {
                  setSelectedCategory(item);
                  const nextMiddles = Object.keys(SERVICE_TREE[item] ?? {});
                  setSelectedMiddle(nextMiddles[0] ?? "");
                }}
              >
                <Text
                  style={[
                    styles.categoryItemText,
                    selectedCategory === item && styles.categoryItemTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        <View style={styles.middleColumn}>
          {middleItems.length ? (
            <FlatList
              data={middleItems}
              keyExtractor={(item) => item}
              scrollEnabled={false}
              removeClippedSubviews={true}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.subcategoryItem,
                    item === middleKey && styles.subcategoryItemActive,
                  ]}
                  onPress={() => {
                    setSelectedMiddle(item);
                    if ((SERVICE_TREE[selectedCategory]?.[item] ?? []).length === 0) {
                      handleSelectService(selectedCategory, item);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.subcategoryText,
                      item === middleKey && styles.subcategoryTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>일치하는 서비스가 없습니다.</Text>
            </View>
          )}
        </View>

        <View style={styles.rightColumn}>
          {smallItems.length ? (
            <FlatList
              data={smallItems}
              keyExtractor={(item) => item}
              scrollEnabled={false}
              removeClippedSubviews={true}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.subcategoryItem}
                  onPress={() => handleSelectService(selectedCategory, item)}
                >
                  <Text style={styles.subcategoryText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>세부 카테고리가 없습니다.</Text>
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.inputBackground,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  leftColumn: {
    width: 100,
    paddingVertical: spacing.md,
  },
  middleColumn: {
    width: 120,
    paddingVertical: spacing.md,
  },
  rightColumn: {
    flex: 1,
    paddingVertical: spacing.md,
  },
  categoryItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  categoryItemActive: {
    backgroundColor: colors.primary,
    borderLeftColor: colors.primary,
  },
  categoryItemText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  categoryItemTextActive: {
    color: "#FFFFFF",
  },
  subcategoryItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  subcategoryItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  subcategoryText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  subcategoryTextActive: {
    color: "#FFFFFF",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: colors.subtext,
  },
});
