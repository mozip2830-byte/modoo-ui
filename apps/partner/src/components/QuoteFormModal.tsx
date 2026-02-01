import { useState, useMemo, useEffect } from "react";
import {
  Modal,
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  Pressable,
} from "react-native";
import { colors, spacing } from "@/src/ui/tokens";
import type { QuoteItem } from "@/src/types/models";
import FontAwesome from "@expo/vector-icons/FontAwesome";

const AREAS = ["방", "거실", "전실", "베란다", "주방", "다용도실", "펜트리", "붙박이장"];

interface QuoteFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (
    items: QuoteItem[],
    memo: string,
    roomCount: number | null,
    bathroomCount: number | null,
    verandaCount: number | null,
    depositRatio: number,
    selectedAreas: string[]
  ) => Promise<void>;
  initialItems?: QuoteItem[];
  initialMemo?: string;
}

const DEFAULT_ITEMS: QuoteItem[] = [
  { name: "기본 작업", amount: 0, selected: true },
];

export function QuoteFormModal({
  visible,
  onClose,
  onSubmit,
  initialItems,
  initialMemo,
}: QuoteFormModalProps) {
  const isEditing = initialItems && initialItems.length > 0;

  const [items, setItems] = useState<QuoteItem[]>(
    initialItems && initialItems.length > 0 ? initialItems : DEFAULT_ITEMS
  );
  const [memo, setMemo] = useState(initialMemo || "");
  const [loading, setLoading] = useState(false);
  const [roomCount, setRoomCount] = useState("");
  const [bathroomCount, setBathroomCount] = useState("");
  const [verandaCount, setVerandaCount] = useState("");
  const [depositRatio, setDepositRatio] = useState("10");
  const [selectedAreas, setSelectedAreas] = useState<string[]>(AREAS);

  // 모달이 열릴 때마다 초기값 업데이트
  useEffect(() => {
    if (visible) {
      setItems(initialItems && initialItems.length > 0 ? initialItems : DEFAULT_ITEMS);
      setMemo(initialMemo || "");
    }
  }, [visible, initialItems, initialMemo]);

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => sum + item.amount, 0);
  }, [items]);

  const selectedCount = useMemo(() => {
    return items.filter((item) => item.selected).length;
  }, [items]);

  const handleItemAmountChange = (index: number, amount: string) => {
    const numAmount = amount === "" ? 0 : Math.max(0, Number(amount) || 0);
    const newItems = [...items];
    newItems[index] = { ...newItems[index], amount: numAmount };
    setItems(newItems);
  };

  const handleItemToggle = (index: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], selected: !newItems[index].selected };
    setItems(newItems);
  };

  const handleAddCustomItem = () => {
    setItems([...items, { name: "", amount: 0, selected: true }]);
  };

  const handleDeleteItem = (index: number) => {
    if (items.length <= 1) {
      Alert.alert("알림", "최소 1개의 항목은 필요합니다.");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const handleAreaToggle = (area: string) => {
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const handleDepositRatioChange = (value: string) => {
    if (value === "") {
      setDepositRatio("");
      return;
    }
    const num = Number(value) || 10;
    if (num >= 10 && num <= 30) {
      setDepositRatio(String(num));
    }
  };

  const handleCustomItemNameChange = (index: number, name: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], name };
    setItems(newItems);
  };

  const handleSubmit = async () => {
    if (selectedCount === 0) {
      Alert.alert("알림", "최소 1개 이상의 항목을 선택해주세요.");
      return;
    }

    const selectedItems = items.filter((item) => item.selected);
    if (selectedItems.some((item) => item.amount <= 0)) {
      Alert.alert("알림", "모든 항목의 금액을 입력해주세요.");
      return;
    }

    // ✅ 포인트 차감 확인 팝업
    Alert.alert(
      "견적서 제출",
      "견적서를 제출하시면 500포인트가 차감됩니다.\n계속하시겠습니까?",
      [
        { text: "취소", onPress: () => {}, style: "cancel" },
        {
          text: "제출",
          onPress: async () => {
            setLoading(true);
            try {
              const room = roomCount ? Number(roomCount) : null;
              const bathroom = bathroomCount ? Number(bathroomCount) : null;
              const veranda = verandaCount ? Number(verandaCount) : null;
              const deposit = Number(depositRatio) || 10;

              await onSubmit(
                selectedItems,
                memo.trim(),
                room,
                bathroom,
                veranda,
                deposit,
                selectedAreas
              );
              setItems(DEFAULT_ITEMS);
              setMemo("");
              setRoomCount("");
              setBathroomCount("");
              setVerandaCount("");
              setDepositRatio("10");
              setSelectedAreas(AREAS);
              onClose();
            } catch (err) {
              Alert.alert(
                "오류",
                err instanceof Error ? err.message : "견적서 제출에 실패했습니다."
              );
            } finally {
              setLoading(false);
            }
          },
          style: "default",
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={loading}>
            <Text style={styles.closeBtn}>닫기</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{isEditing ? "견적서 수정" : "견적서 작성"}</Text>
          <TouchableOpacity onPress={handleSubmit} disabled={loading}>
            <Text style={[styles.submitBtn, loading && styles.submitBtnDisabled]}>
              {loading ? (isEditing ? "수정 중..." : "제출 중...") : isEditing ? "수정" : "제출"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>기본 작업 구역</Text>
            <View style={styles.areasContainer}>
              {AREAS.map((area) => (
                <Pressable
                  key={area}
                  style={[
                    styles.areaCheckbox,
                    selectedAreas.includes(area) && styles.areaCheckboxChecked,
                  ]}
                  onPress={() => handleAreaToggle(area)}
                  disabled={loading}
                >
                  <FontAwesome
                    name={selectedAreas.includes(area) ? "check-square" : "square-o"}
                    size={16}
                    color={
                      selectedAreas.includes(area) ? colors.primary : colors.subtext
                    }
                  />
                  <Text
                    style={[
                      styles.areaLabel,
                      selectedAreas.includes(area) && styles.areaLabelChecked,
                    ]}
                  >
                    {area}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>항목 선택</Text>
              <Text style={styles.selectedCount}>
                {selectedCount}개 선택 됨
              </Text>
            </View>

            {items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <Switch
                  value={item.selected}
                  onValueChange={() => handleItemToggle(index)}
                  disabled={loading}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />

                <TextInput
                  style={styles.itemNameInput}
                  placeholder="항목명"
                  value={item.name}
                  onChangeText={(name) =>
                    handleCustomItemNameChange(index, name)
                  }
                  editable={!loading}
                  placeholderTextColor={colors.subtext}
                />

                <View style={styles.amountInputContainer}>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="금액"
                    value={item.amount === 0 ? "" : String(item.amount)}
                    onChangeText={(val) =>
                      handleItemAmountChange(index, val)
                    }
                    keyboardType="number-pad"
                    editable={!loading}
                    placeholderTextColor={colors.subtext}
                  />
                  <Text style={styles.amountUnit}>원</Text>
                </View>

                {index >= 4 && (
                  <TouchableOpacity
                    onPress={() => handleDeleteItem(index)}
                    disabled={loading}
                  >
                    <FontAwesome name="trash" size={16} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={styles.addItemBtn}
              onPress={handleAddCustomItem}
              disabled={loading}
            >
              <FontAwesome name="plus" size={14} color={colors.primary} />
              <Text style={styles.addItemBtnText}>항목 추가</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>주택 정보</Text>
            <View style={styles.housingGrid}>
              <View style={styles.housingItem}>
                <Text style={styles.housingLabel}>방갯수</Text>
                <TextInput
                  style={styles.housingInput}
                  placeholder="0"
                  value={roomCount}
                  onChangeText={setRoomCount}
                  keyboardType="number-pad"
                  editable={!loading}
                  placeholderTextColor={colors.subtext}
                />
              </View>
              <View style={styles.housingItem}>
                <Text style={styles.housingLabel}>화장실갯수</Text>
                <TextInput
                  style={styles.housingInput}
                  placeholder="0"
                  value={bathroomCount}
                  onChangeText={setBathroomCount}
                  keyboardType="number-pad"
                  editable={!loading}
                  placeholderTextColor={colors.subtext}
                />
              </View>
              <View style={styles.housingItem}>
                <Text style={styles.housingLabel}>베란다갯수</Text>
                <TextInput
                  style={styles.housingInput}
                  placeholder="0"
                  value={verandaCount}
                  onChangeText={setVerandaCount}
                  keyboardType="number-pad"
                  editable={!loading}
                  placeholderTextColor={colors.subtext}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>예약금 비율 (계약 수수료 10% 별도, 파트너 예약금 비율)</Text>
            <View style={styles.depositContainer}>
              <TextInput
                style={styles.depositInput}
                placeholder="10"
                value={depositRatio}
                onChangeText={handleDepositRatioChange}
                keyboardType="number-pad"
                editable={!loading}
                placeholderTextColor={colors.subtext}
              />
              <Text style={styles.depositUnit}>%</Text>
              <View style={styles.depositRange}>
                <Text style={styles.depositRangeText}>(10 ~ 30%)</Text>
              </View>
            </View>
            <Text style={styles.depositInfo}>
              예약금: {totalAmount > 0 ? Math.floor((totalAmount * Number(depositRatio || 10)) / 100).toLocaleString() : 0}원
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>메모</Text>
            <TextInput
              style={styles.memoInput}
              placeholder="추가 설명이나 요청사항을 입력해주세요."
              value={memo}
              onChangeText={setMemo}
              multiline
              maxLength={500}
              editable={!loading}
              placeholderTextColor={colors.subtext}
            />
            <Text style={styles.charCount}>{memo.length} / 500</Text>
          </View>

          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>총액</Text>
            <Text style={styles.totalValue}>
              {totalAmount.toLocaleString()}원
            </Text>
          </View>

          <View style={styles.spacer} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
  closeBtn: {
    fontSize: 14,
    color: colors.subtext,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  submitBtn: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  submitBtnDisabled: {
    color: colors.subtext,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  selectedCount: {
    fontSize: 12,
    color: colors.subtext,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: 6,
    gap: spacing.sm,
  },
  itemNameInput: {
    flex: 1,
    fontSize: 13,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.bg,
    borderRadius: 4,
    color: colors.text,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 4,
    paddingRight: spacing.sm,
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.text,
  },
  amountUnit: {
    fontSize: 12,
    color: colors.subtext,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
    borderRadius: 6,
  },
  addItemBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.primary,
  },
  memoInput: {
    minHeight: 100,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: 6,
    fontSize: 13,
    color: colors.text,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    color: colors.subtext,
    marginTop: spacing.xs,
    textAlign: "right",
  },
  housingGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  housingItem: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  housingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.subtext,
    marginBottom: spacing.xs,
  },
  housingInput: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bg,
    borderRadius: 4,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  areasContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  areaCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    width: "31%",
  },
  areaCheckboxChecked: {
    backgroundColor: "rgba(79, 70, 229, 0.1)",
    borderColor: colors.primary,
  },
  areaLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  areaLabelChecked: {
    fontWeight: "700",
    color: colors.primary,
  },
  depositContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  depositInput: {
    flex: 0.3,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 6,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  depositUnit: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  depositRange: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  depositRangeText: {
    fontSize: 11,
    color: colors.subtext,
  },
  depositInfo: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
    borderRadius: 6,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
  },
  spacer: {
    height: spacing.lg,
  },
});
