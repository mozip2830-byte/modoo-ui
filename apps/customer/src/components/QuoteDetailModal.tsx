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
  chatInfo?: {
    acceptedQuoteId?: string | null;
    paymentStatus?: string | null;
  } | null;
  onSave: (quoteData: QuoteMessageData) => Promise<void>;
  onAccept: (quoteData: QuoteMessageData) => Promise<void>;
  onPayment: (quoteData: QuoteMessageData) => Promise<void>;
  onEdit?: () => void;
}

export function QuoteDetailModal({
  visible,
  onClose,
  quoteData,
  chatInfo,
  onSave,
  onAccept,
  onPayment,
  onEdit,
}: QuoteDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [checked1, setChecked1] = useState(false);
  const [checked2, setChecked2] = useState(false);
  const [checked3, setChecked3] = useState(false);
  const [showRefundDetail, setShowRefundDetail] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogType, setDialogType] = useState<"confirm" | "success">("confirm");
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogMessage, setDialogMessage] = useState("");
  const [dialogAction, setDialogAction] = useState<(() => void) | null>(null);

  if (!quoteData) return null;

  const isAccepted = Boolean(chatInfo?.acceptedQuoteId);
  const isPaymentCompleted = chatInfo?.paymentStatus === "completed";
  const allCheckboxesChecked = checked1 && checked2 && checked3;
  const canPayment = isAccepted && allCheckboxesChecked;

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(quoteData);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setDialogType("confirm");
    setDialogTitle("견적 확정");
    setDialogMessage("이 견적서를 확정하시겠습니까?\n확정 후 수정이 불가능합니다.");
    setDialogAction(() => async () => {
      setLoading(true);
      try {
        await onAccept(quoteData);
        setDialogVisible(false);
        setDialogType("success");
        setDialogTitle("견적이 확정되었습니다");
        setDialogMessage("");
        setDialogAction(null);
        setDialogVisible(true);
      } finally {
        setLoading(false);
      }
    });
    setDialogVisible(true);
  };

  const handlePayment = async () => {
    setDialogType("confirm");
    setDialogTitle("결제");
    setDialogMessage("결제를 진행하시겠습니까?\n결제 완료 후 파트너와 통화가 가능합니다.");
    setDialogAction(() => async () => {
      setLoading(true);
      try {
        await onPayment(quoteData);
        setDialogVisible(false);
        setDialogType("success");
        setDialogTitle("결제가 완료되었습니다");
        setDialogMessage("이제 파트너와 전화 통화가 가능합니다.");
        setDialogAction(() => () => {
          setDialogVisible(false);
          onClose();
        });
        setDialogVisible(true);
      } finally {
        setLoading(false);
      }
    });
    setDialogVisible(true);
  };

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
              서비스 시작 전에 필요한 모든 작업을 견적서에 담아두면, 현장에서 마음이 놓일 거예요. 궁금한 부분은 미리 업체에 문의해 주세요.
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
            const contractFee = Math.min(Math.floor(quoteData.totalAmount * 0.10), 100000);
            const depositAmount = quoteData.depositRatio !== undefined ? Math.floor((quoteData.totalAmount * quoteData.depositRatio) / 100) : 0;
            const paymentBefore = contractFee + depositAmount;
            const safeFee = Math.floor(paymentBefore * 0.035);
            const totalPayment = contractFee + safeFee + depositAmount;
            const remainingPayment = quoteData.totalAmount - contractFee - depositAmount;

            return (
              <View style={styles.totalSection}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>서비스 금액 합계</Text>
                  <Text style={styles.totalValue}>
                    {quoteData.totalAmount.toLocaleString()}원
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.feeRowWithDesc}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>플랫폼 이용료</Text>
                    <Text style={styles.feePrice}>
                      {contractFee.toLocaleString()}원
                    </Text>
                  </View>
                  <Text style={styles.feeDesc}>매칭·예약 운영 비용 잔금에서 차감됩니다</Text>
                </View>

                {quoteData.depositRatio !== undefined && quoteData.depositRatio > 0 && (
                  <View style={styles.feeRowWithDesc}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>예약 확정금</Text>
                      <Text style={styles.depositPrice}>
                        {depositAmount.toLocaleString()}원
                      </Text>
                    </View>
                    <Text style={styles.feeDesc}>잔금에서 차감됩니다</Text>
                  </View>
                )}

                <View style={styles.feeRowWithDesc}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>결제 처리 수수료</Text>
                    <Text style={styles.feePrice}>
                      {safeFee.toLocaleString()}원
                    </Text>
                  </View>
                  <Text style={styles.feeDesc}>결제 처리·보안 비용</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.feeRowWithDesc}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>결제 금액</Text>
                    <Text style={styles.totalPrice}>
                      {totalPayment.toLocaleString()}원
                    </Text>
                  </View>
                  <Text style={styles.feeDesc}>지금 결제할 금액</Text>
                </View>

                <View style={styles.feeRowWithDesc}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>결제잔금</Text>
                    <Text style={styles.remainingPrice}>
                      {remainingPayment.toLocaleString()}원
                    </Text>
                  </View>
                  <Text style={styles.feeDesc}>서비스 당일 파트너에게 직접 결제</Text>
                </View>
              </View>
            );
          })()}

          {/* 상태 표시 */}
          <View style={styles.statusSection}>
            {isAccepted && (
              <View style={[styles.statusBadge, styles.statusAccepted]}>
                <FontAwesome name="check-circle" size={14} color="#22c55e" />
                <Text style={styles.statusText}>✓ 견적이 확정되었습니다</Text>
              </View>
            )}
            {isPaymentCompleted && (
              <View style={[styles.statusBadge, styles.statusPaid]}>
                <FontAwesome name="check-circle" size={14} color="#3b82f6" />
                <Text style={styles.statusText}>✓ 결제가 완료되었습니다</Text>
              </View>
            )}
          </View>

          {/* 결제 전 안내 문구 */}
          {!isPaymentCompleted && (
            <View style={styles.guideSection}>
              <Text style={styles.guideLabel}>(현장 추가요금 방지)</Text>
              <View style={styles.guideBox}>
                <Text style={styles.guideText}>
                  청소 범위, 추가 옵션, 특수 요청이 견적서에 모두 포함되어 있는지 확인해 주세요.
                </Text>
                <Text style={styles.guideText}>
                  현장에서 요청사항이 누락되면 추가 비용이 발생할 수 있습니다.
                </Text>
              </View>

              <Text style={styles.guideLabel}>(환불/AS 파트너 내규)</Text>
              <View style={styles.guideBox}>
                <Text style={styles.guideText}>
                  환불 및 재서비스(보완/재방문) 기준은 업체의 내규에 따릅니다.
                </Text>
                <Text style={styles.guideText}>
                  결제 전에 업체에 문의하여 기준을 확인하시길 권장합니다.
                </Text>
              </View>

              <Text style={styles.guideLabel}>(잔금은 현장 결제)</Text>
              <View style={styles.guideBox}>
                <Text style={styles.guideText}>
                  예약 확정금만 지금 결제되며, 나머지 잔금은 서비스 당일 현장에서 업체에게 직접 결제됩니다.
                </Text>
                <Text style={styles.guideText}>
                  현금/카드 결제 가능 여부는 미리 업체에 확인해 주세요.
                </Text>
              </View>
            </View>
          )}

          {/* 결제 전 체크박스 */}
          {!isPaymentCompleted && (
            <View style={styles.checkboxSection}>
              <Text style={styles.checkboxTitle}>결제 전 아래를 확인해 주세요</Text>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setChecked1(!checked1)}
                disabled={loading}
              >
                <FontAwesome
                  name={checked1 ? "check-square" : "square-o"}
                  size={18}
                  color={checked1 ? colors.primary : colors.border}
                />
                <Text style={[styles.checkboxText, checked1 && styles.checkboxTextChecked]}>
                  견적서의 청소 범위, 추가 옵션, 금액을 확인했습니다.
                </Text>
              </TouchableOpacity>

              <View style={styles.checkboxRowWithButton}>
                <TouchableOpacity
                  style={styles.checkboxRowContent}
                  onPress={() => setChecked2(!checked2)}
                  disabled={loading}
                >
                  <FontAwesome
                    name={checked2 ? "check-square" : "square-o"}
                    size={18}
                    color={checked2 ? colors.primary : colors.border}
                  />
                  <Text style={[styles.checkboxText, checked2 && styles.checkboxTextChecked]}>
                    환불/재서비스(보완/재방문) 기준을 이해했고, 필요시 업체에 문의했습니다.
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.detailButton}
                  onPress={() => setShowRefundDetail(true)}
                >
                  <Text style={styles.detailButtonText}>자세히보기</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setChecked3(!checked3)}
                disabled={loading}
              >
                <FontAwesome
                  name={checked3 ? "check-square" : "square-o"}
                  size={18}
                  color={checked3 ? colors.primary : colors.border}
                />
                <Text style={[styles.checkboxText, checked3 && styles.checkboxTextChecked]}>
                  안전결제 수수료(3.5%, 결제 처리·예약 운영 비용)에 동의합니다.
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.spacer} />
        </ScrollView>

        {/* 환불/재서비스 상세 모달 */}
        <Modal
          visible={showRefundDetail}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRefundDetail(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.detailModalContent}>
              <View style={styles.detailModalHeader}>
                <Text style={styles.detailModalTitle}>환불 및 재서비스 안내</Text>
                <TouchableOpacity onPress={() => setShowRefundDetail(false)}>
                  <FontAwesome name="times" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.detailModalBody}>
                <Text style={styles.detailModalSubtitle}>환불 기준</Text>
                <Text style={styles.detailModalText}>
                  환불은 업체의 내규에 따릅니다. 일반적으로 서비스 시작 전 취소는 환불이 가능하며, 시작 후 취소는 환불이 제한될 수 있습니다. 정확한 환불 기준은 업체에 문의하시기 바랍니다.
                </Text>

                <Text style={styles.detailModalSubtitle}>재서비스(보완/재방문) 기준</Text>
                <Text style={styles.detailModalText}>
                  재서비스 범위와 기간은 업체마다 다릅니다. 서비스 후 보완이 필요하면 업체에 문의하여 무상 보완 범위와 기한을 확인하시기 바랍니다.
                </Text>

                <Text style={styles.detailModalSubtitle}>권장사항</Text>
                <Text style={styles.detailModalText}>
                  결제 전에 업체에 다음을 미리 문의하시길 권장합니다:
                  • 환불 가능 기한 및 수수료
                  • 보완/재방문 범위 및 기간
                  • 추가 비용 발생 여부
                </Text>
              </ScrollView>
              <TouchableOpacity
                style={styles.detailModalButton}
                onPress={() => setShowRefundDetail(false)}
              >
                <Text style={styles.detailModalButtonText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 커스텀 다이얼로그 */}
        <Modal
          visible={dialogVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDialogVisible(false)}
        >
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogContent}>
              {/* 헤더 아이콘 */}
              <View style={styles.dialogIconContainer}>
                {dialogType === "confirm" ? (
                  <View style={styles.dialogIconQuestion}>
                    <FontAwesome name="question" size={28} color="#FFFFFF" />
                  </View>
                ) : (
                  <View style={styles.dialogIconSuccess}>
                    <FontAwesome name="check" size={28} color="#FFFFFF" />
                  </View>
                )}
              </View>

              {/* 제목 */}
              <Text style={styles.dialogTitle}>{dialogTitle}</Text>

              {/* 메시지 */}
              {dialogMessage ? (
                <Text style={styles.dialogMessage}>{dialogMessage}</Text>
              ) : null}

              {/* 버튼 */}
              <View style={styles.dialogButtonGroup}>
                {dialogType === "confirm" ? (
                  <>
                    <TouchableOpacity
                      style={styles.dialogButtonCancel}
                      onPress={() => setDialogVisible(false)}
                      disabled={loading}
                    >
                      <Text style={styles.dialogButtonCancelText}>취소</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dialogButtonConfirm, loading && styles.dialogButtonDisabled]}
                      onPress={dialogAction}
                      disabled={loading}
                    >
                      <Text style={styles.dialogButtonConfirmText}>
                        {loading ? "처리 중..." : "확인"}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.dialogButtonConfirm}
                    onPress={() => {
                      dialogAction?.();
                    }}
                  >
                    <Text style={styles.dialogButtonConfirmText}>확인</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>

        {/* 액션 버튼 */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={loading}
          >
            <FontAwesome name="bookmark" size={16} color={colors.primary} />
            <Text style={styles.saveBtnText}>저장</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.acceptBtn,
              (isAccepted || loading) && styles.btnDisabled,
            ]}
            onPress={handleAccept}
            disabled={isAccepted || loading}
          >
            <FontAwesome
              name="check"
              size={16}
              color="#FFFFFF"
            />
            <Text style={styles.acceptBtnText}>
              {isAccepted ? "✓ 확정됨" : "확정"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.paymentBtn,
              (isPaymentCompleted || !canPayment || loading) &&
                styles.btnDisabled,
            ]}
            onPress={handlePayment}
            disabled={isPaymentCompleted || !canPayment || loading}
          >
            <FontAwesome
              name="credit-card"
              size={16}
              color="#FFFFFF"
            />
            <Text style={styles.paymentBtnText}>
              {isPaymentCompleted ? "✓ 완료" : "결제"}
            </Text>
          </TouchableOpacity>

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
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  totalPrice: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.primary,
  },
  statusSection: {
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    gap: spacing.sm,
  },
  statusAccepted: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  statusPaid: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
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
  saveBtn: {
    flex: 0.8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    gap: spacing.xs,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 8,
    gap: spacing.xs,
  },
  acceptBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  paymentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    backgroundColor: "#10b981",
    borderRadius: 8,
    gap: spacing.xs,
  },
  paymentBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
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
  btnDisabled: {
    opacity: 0.5,
  },
  depositPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f59e0b",
  },
  feePrice: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.subtext,
  },
  feeRowWithDesc: {
    marginVertical: spacing.xs,
  },
  feeDesc: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.subtext,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
  remainingPrice: {
    fontSize: 18,
    fontWeight: "700",
    color: "#8b5cf6",
  },
  warningBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#f97316",
  },
  warningText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400e",
    lineHeight: 18,
  },
  guideSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  guideLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.subtext,
    marginBottom: spacing.xs,
  },
  guideBox: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  guideText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.text,
    lineHeight: 18,
  },
  checkboxSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: "rgba(79, 70, 229, 0.05)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  checkboxTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  checkboxRowWithButton: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  checkboxRowContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  checkboxText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: colors.text,
    lineHeight: 18,
  },
  checkboxTextChecked: {
    fontWeight: "600",
    color: colors.primary,
  },
  detailButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 4,
    justifyContent: "center",
  },
  detailButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  detailModalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
    paddingBottom: spacing.lg,
  },
  detailModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  detailModalBody: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  detailModalSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  detailModalText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.text,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  detailModalButton: {
    marginHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: "center",
  },
  detailModalButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
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
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  dialogContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
  dialogIconContainer: {
    marginBottom: spacing.lg,
  },
  dialogIconQuestion: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  dialogIconSuccess: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  dialogMessage: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.subtext,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  dialogButtonGroup: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
  },
  dialogButtonCancel: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  dialogButtonCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  dialogButtonConfirm: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  dialogButtonConfirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  dialogButtonDisabled: {
    opacity: 0.6,
  },
});
