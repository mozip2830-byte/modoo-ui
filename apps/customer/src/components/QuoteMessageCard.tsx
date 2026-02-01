import { StyleSheet, View, Text } from "react-native";
import type { QuoteMessageData } from "@/src/types/models";
import { colors, spacing } from "@/src/ui/tokens";

interface QuoteMessageCardProps {
  data: QuoteMessageData;
}

export function QuoteMessageCard({ data }: QuoteMessageCardProps) {
  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📋</Text>
        <Text style={styles.headerText}>견적서</Text>
      </View>

      {/* 기본 작업 구역 */}
      {data.selectedAreas && data.selectedAreas.length > 0 && (
        <View style={styles.areasSection}>
          <Text style={styles.areasSectionLabel}>기본 작업 구역</Text>
          <View style={styles.areasGrid}>
            {data.selectedAreas.map((area, index) => (
              <View key={index} style={styles.areaTag}>
                <Text style={styles.areaTagText}>{area}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 주택 정보 */}
      {(data.roomCount || data.bathroomCount || data.verandaCount) && (
        <View style={styles.housingInfo}>
          {data.roomCount !== undefined && data.roomCount !== null && (
            <View style={styles.housingItem}>
              <Text style={styles.housingLabel}>방</Text>
              <Text style={styles.housingValue}>{data.roomCount}</Text>
            </View>
          )}
          {data.bathroomCount !== undefined && data.bathroomCount !== null && (
            <View style={styles.housingItem}>
              <Text style={styles.housingLabel}>화장실</Text>
              <Text style={styles.housingValue}>{data.bathroomCount}</Text>
            </View>
          )}
          {data.verandaCount !== undefined && data.verandaCount !== null && (
            <View style={styles.housingItem}>
              <Text style={styles.housingLabel}>베란다</Text>
              <Text style={styles.housingValue}>{data.verandaCount}</Text>
            </View>
          )}
        </View>
      )}

      {/* 항목 리스트 */}
      <View style={styles.itemsContainer}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemHeaderText}>항목</Text>
          <Text style={styles.itemHeaderText}>금액</Text>
        </View>
        {data.items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemAmount}>
              {item.amount.toLocaleString()}
            </Text>
          </View>
        ))}
      </View>

      {/* 메모 */}
      {data.memo && (
        <View style={styles.memoContainer}>
          <Text style={styles.memoLabel}>📝 비고</Text>
          <Text style={styles.memoText}>{data.memo}</Text>
        </View>
      )}

      {/* 총액 및 예약금 */}
      <View style={styles.totalContainer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>합계</Text>
          <View style={styles.totalValueContainer}>
            <Text style={styles.totalAmount}>
              {data.totalAmount.toLocaleString()}
            </Text>
            <Text style={styles.totalUnit}>원</Text>
          </View>
        </View>
        {data.depositRatio !== undefined && data.depositRatio > 0 && (
          <View style={styles.depositRow}>
            <Text style={styles.depositLabel}>예약금 ({data.depositRatio}%)</Text>
            <Text style={styles.depositAmount}>
              {Math.floor((data.totalAmount * data.depositRatio) / 100).toLocaleString()}원
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  headerIcon: {
    fontSize: 20,
    marginRight: spacing.xs,
  },
  headerText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  housingInfo: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  housingItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: 8,
  },
  housingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.subtext,
    marginBottom: 2,
  },
  housingValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  itemsContainer: {
    marginVertical: spacing.md,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 6,
  },
  itemHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: 6,
  },
  itemName: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
    flex: 1,
  },
  itemAmount: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    textAlign: "right",
  },
  memoContainer: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginVertical: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  memoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  memoText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
  },
  totalContainer: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    marginTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
    backgroundColor: "rgba(79, 70, 229, 0.05)",
    borderRadius: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.primary,
  },
  totalUnit: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.subtext,
    marginLeft: spacing.xs,
  },
  totalValueContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  depositRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  depositLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  depositAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  areasSection: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  areasSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.subtext,
    marginBottom: spacing.sm,
  },
  areasGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  areaTag: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  areaTagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
