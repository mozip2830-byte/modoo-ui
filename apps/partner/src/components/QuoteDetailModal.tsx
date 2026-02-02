import { useState } from "react";
import {
  Modal,
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { colors, spacing } from "@/src/ui/tokens";
import type { QuoteMessageData } from "@/src/types/models";
import FontAwesome from "@expo/vector-icons/FontAwesome";

interface QuoteDetailModalProps {
  visible: boolean;
  onClose: () => void;
  quoteData: QuoteMessageData | null;
  onEdit?: () => void;
}

export function QuoteDetailModal({
  visible,
  onClose,
  quoteData,
  onEdit,
}: QuoteDetailModalProps) {
  const [loading, setLoading] = useState(false);

  if (!quoteData) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={loading}>
            <FontAwesome name="chevron-left" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>견적서 확인</Text>
          <View style={{ width: 20 }} />
        </View>

        {/* 콘텐츠 */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* 상단 안내 배너 */}
          <View style={styles.topBannerBox}>
            <Text style={styles.topBannerText}>
              제출한 견적서의 세부 내용입니다. 견적서를 수정하려면 수정 버튼을 클릭해 주세요.
            </Text>
          </View>

          {/* 기본 작업 구역 */}
          {quoteData.selectedAreas && quoteData.selectedAreas.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>기본 작업 구역</Text>
              <View style={styles.areasGridModal}>
                {quoteData.selectedAreas.map((area, index) => (
                  <View key={index} style={styles.areaTagModal}>
                    <Text style={styles.areaTagTextModal}>{area}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 주택 정보 */}
          {(quoteData.roomCount || quoteData.bathroomCount || quoteData.verandaCount) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>주택 정보</Text>
              <View style={styles.housingGrid}>
                {quoteData.roomCount !== undefined && quoteData.roomCount !== null && (
                  <View style={styles.housingCard}>
                    <Text style={styles.housingLabel}>방</Text>
                    <Text style={styles.housingCount}>{quoteData.roomCount}개</Text>
                  </View>
                )}
                {quoteData.bathroomCount !== undefined && quoteData.bathroomCount !== null && (
                  <View style={styles.housingCard}>
                    <Text style={styles.housingLabel}>화장실</Text>
                    <Text style={styles.housingCount}>{quoteData.bathroomCount}개</Text>
                  </View>
                )}
                {quoteData.verandaCount !== undefined && quoteData.verandaCount !== null && (
                  <View style={styles.housingCard}>
                    <Text style={styles.housingLabel}>베란다</Text>
                    <Text style={styles.housingCount}>{quoteData.verandaCount}개</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* 제목 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>서비스 내역</Text>
            <View style={styles.divider} />
          </View>

          {/* 항목 리스트 */}
          <View style={styles.itemsContainer}>
            {quoteData.items.map((item, index) => (
              <View key={index} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemNumber}>{index + 1}</Text>
                  <Text style={styles.itemName}>{item.name}</Text>
                </View>
                <View style={styles.itemAmount}>
                  <Text style={styles.itemAmountLabel}>서비스 금액</Text>
                  <Text style={styles.itemAmountValue}>
                    {item.amount.toLocaleString()}원
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* 메모 */}
          {quoteData.memo && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>추가 설명</Text>
              <View style={styles.memoBox}>
                <Text style={styles.memoText}>{quoteData.memo}</Text>
              </View>
            </View>
          )}

          {/* 총액 */}
          {(() => {
            const depositAmount = quoteData.depositRatio !== undefined ? Math.floor((quoteData.totalAmount * quoteData.depositRatio) / 100) : 0;

            return (
              <View style={styles.totalSection}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>총 금액</Text>
                  <Text style={styles.totalValue}>
                    {quoteData.totalAmount.toLocaleString()}원
                  </Text>
                </View>

                {quoteData.depositRatio !== undefined && quoteData.depositRatio > 0 && (
                  <View style={styles.feeRowWithDesc}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>예약 확정금 ({quoteData.depositRatio}%)</Text>
                      <Text style={styles.depositPrice}>
                        {depositAmount.toLocaleString()}원
                      </Text>
                    </View>
                    <Text style={styles.feeDesc}>고객이 지불하는 예약금</Text>
                  </View>
                )}
              </View>
            );
          })()}

          <View style={styles.spacer} />
        </ScrollView>

        {/* 액션 버튼 */}
        <View style={styles.footer}>
          {onEdit && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={onEdit}
              disabled={loading}
            >
              <FontAwesome name="pencil" size={16} color="#FFFFFF" />
              <Text style={styles.editBtnText}>수정</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  topBannerBox: {
    padding: spacing.md,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
    marginBottom: spacing.lg,
  },
  topBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e40af",
    lineHeight: 20,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  housingGrid: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  housingCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  housingLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.subtext,
    marginBottom: spacing.xs,
  },
  housingCount: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  itemsContainer: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  itemNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
    marginRight: spacing.sm,
    minWidth: 24,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  itemAmount: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemAmountLabel: {
    fontSize: 12,
    color: colors.subtext,
  },
  itemAmountValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  memoBox: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  memoText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
  },
  totalSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    marginVertical: spacing.lg,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  feeRowWithDesc: {
    marginVertical: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  feeDesc: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.subtext,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
  depositPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f59e0b",
  },
  areasGridModal: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  areaTagModal: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  areaTagTextModal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  spacer: {
    height: spacing.lg,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    backgroundColor: "#8b5cf6",
    borderRadius: 8,
    gap: spacing.xs,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
