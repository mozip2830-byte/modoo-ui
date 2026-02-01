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

type ServiceItem = {
  name: string;
  description: string;
};

const SERVICE_DESCRIPTIONS: Record<string, ServiceItem> = {
  청소: {
    name: "청소",
    description: "집, 오피스, 상점 등 모든 공간의 청소 서비스를 받을 수 있습니다.",
  },
  이사: {
    name: "이사",
    description: "평수별, 이동거리별 맞춤형 이사 서비스를 제공합니다.",
  },
  인테리어: {
    name: "인테리어",
    description: "리모델링, 시공, 설계 등 전문적인 인테리어 서비스입니다.",
  },
  "시공/설치": {
    name: "시공/설치",
    description: "에어컨, 보일러, 셔터 등 다양한 설치 서비스를 제공합니다.",
  },
};

export default function ServicesPage() {
  const router = useRouter();
  const uid = useAuthUid();

  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(
    SERVICE_CATEGORIES[0]
  );
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

  const selectedService = SERVICE_DESCRIPTIONS[selectedCategory];

  const handleSelectService = useCallback((category: string) => {
    if (!uid) {
      router.push({ pathname: "/login", params: { force: "1" } });
      return;
    }
    // Use requestAnimationFrame to ensure smooth navigation
    requestAnimationFrame(() => {
      router.push({
        pathname: "/(customer)/requests/new-chat",
        params: { serviceType: category },
      });
    });
  }, [uid, router]);

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <FontAwesome name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>모두의 서비스</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* 검색창 */}
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
          <TouchableOpacity onPress={() => setSearchText("")}>
            <FontAwesome name="times" size={16} color={colors.subtext} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 메인 콘텐츠 */}
      <View style={styles.content}>
        {/* 좌측: 서비스 카테고리 리스트 */}
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
                onPress={() => handleSelectService(item)}
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

        {/* 우측: 상세 정보 및 버튼 */}
        <View style={styles.rightColumn}>
          {selectedService ? (
            <View style={styles.detailContainer}>
              <Text style={styles.detailTitle}>{selectedService.name}</Text>
              <Text style={styles.detailDescription}>
                {selectedService.description}
              </Text>
              <TouchableOpacity
                style={styles.requestButton}
                onPress={() => handleSelectService(selectedCategory)}
              >
                <Text style={styles.requestButtonText}>요청하기</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                일치하는 서비스가 없습니다.
              </Text>
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
  detailContainer: {
    flex: 1,
    justifyContent: "flex-start",
    gap: spacing.md,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  detailDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.subtext,
  },
  requestButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
  },
  requestButtonText: {
    fontSize: 16,
    fontWeight: "700",
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
