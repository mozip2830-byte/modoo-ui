// app/(customer)/requests/new-chat.tsx
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { createRequest } from "@/src/actions/requestActions";
import { Screen } from "@/src/components/Screen";
import {
    getAddressDraft,
    setAddressDraft,
    subscribeAddressDraft,
    type AddressDraft,
} from "@/src/lib/addressDraftStore";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { colors, radius, spacing } from "@/src/ui/tokens";

// ----------------------------
// Types
// ----------------------------
type ServiceType = "청소" | "이사" | "리모델링" | "인테리어" | "전기·설비";

type Message = {
  id: string;
  role: "system" | "user";
  text: string;
};

type Draft = {
  serviceType: ServiceType | null;
  serviceSubType: string | null;

  addressRoad: string | null;
  addressJibun: string | null;
  addressDong: string | null;
  zonecode: string | null;

  // cleaning
  cleaningPyeong: number | null;
  roomCount: number | null;
  bathroomCount: number | null;
  verandaCount: number | null;

  // non-cleaning one extra
  extraFieldKey: string | null;
  extraFieldLabel: string | null;
  extraFieldValue: string | number | null;

  desiredDateMs: number | null; // ms
  note: string;
};

const SERVICE_SUBTYPES: Record<ServiceType, string[]> = {
  청소: ["입주청소", "이사청소"],
  이사: ["원룸이사", "포장이사"],
  리모델링: ["부분리모델링", "전체리모델링"],
  인테리어: ["주방", "욕실"],
  "전기·설비": ["전기수리", "배관수리"],
};

const NON_CLEANING_EXTRA: Record<
  Exclude<ServiceType, "청소">,
  { key: string; label: string; placeholder: string }
> = {
  이사: { key: "floor", label: "층수", placeholder: "예: 3층" },
  리모델링: { key: "areaPyeong", label: "면적(평)", placeholder: "예: 30평" },
  인테리어: { key: "spaceSize", label: "공간크기", placeholder: "예: 15평" },
  "전기·설비": { key: "issue", label: "고장유형", placeholder: "예: 누전 / 배선 / 수전" },
};

function formatAddressToDong(addressRoad: string, bname?: string) {
  const raw = (bname ?? "").trim();
  if (raw) return raw;

  const tokens = addressRoad.trim().split(/\s+/).filter(Boolean);
  const findIndexBySuffix = (suffixes: string[]) => {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (suffixes.some((s) => t.endsWith(s))) return i;
    }
    return -1;
  };

  let idx = findIndexBySuffix(["동"]);
  if (idx < 0) idx = findIndexBySuffix(["읍", "면"]);
  if (idx < 0) idx = findIndexBySuffix(["구"]);
  if (idx >= 0) return tokens.slice(0, idx + 1).join(" ");
  return tokens.slice(0, Math.min(3, tokens.length)).join(" ");
}

function formatDateLabel(ms: number | null) {
  if (!ms) return "미정";
  const d = new Date(ms);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

function bubbleStyle(role: "system" | "user") {
  return [
    styles.bubble,
    role === "system" ? styles.bubbleSystem : styles.bubbleUser,
  ] as const;
}

function bubbleTextStyle(role: "system" | "user") {
  return [styles.bubbleText, role === "system" ? styles.textSystem : styles.textUser] as const;
}

export default function CustomerNewChatRequestScreen() {
  const router = useRouter();
  const { uid, status } = useAuthUid();

  // ✅ auth 가드: 훅이 안전해도, uid 없을 때 화면이 먼저 떠도 크래시 안 나게 막음
  if (status === "authLoading") {
    return (
      <Screen scroll={false} style={styles.container}>
        <AppHeader
          title="견적 요청"
          subtitle="로그인 정보를 확인 중입니다…"
          rightAction={
            <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.85}>
              <FontAwesome name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          }
        />
        <View style={{ padding: spacing.lg }}>
          <Card style={{ padding: spacing.lg }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>
              잠시만요. 로그인 상태를 확인 중입니다…
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  if (!uid) {
    return (
      <Screen scroll={false} style={styles.container}>
        <AppHeader
          title="견적 요청"
          subtitle="로그인이 필요합니다."
          rightAction={
            <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.85}>
              <FontAwesome name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          }
        />
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
              로그인 후 이용할 수 있어요
            </Text>
            <Text style={{ color: colors.subtext, fontWeight: "700" }}>
              견적 요청을 저장하려면 로그인이 필요합니다.
            </Text>

            <TouchableOpacity
              style={[styles.submitBtn, { marginTop: spacing.md }]}
              onPress={() => router.replace("/login")}
              activeOpacity={0.85}
            >
              <Text style={styles.submitText}>로그인 하러가기</Text>
            </TouchableOpacity>
          </Card>
        </View>
      </Screen>
    );
  }

  const [draft, setDraft] = useState<Draft>({
    serviceType: null,
    serviceSubType: null,

    addressRoad: null,
    addressJibun: null,
    addressDong: null,
    zonecode: null,

    cleaningPyeong: null,
    roomCount: 1,
    bathroomCount: 1,
    verandaCount: 0,

    extraFieldKey: null,
    extraFieldLabel: null,
    extraFieldValue: null,

    desiredDateMs: null,
    note: "",
  });

  const [messages, setMessages] = useState<Message[]>([
    { id: "m1", role: "system", text: "원하시는 서비스 종류를 선택해 주세요." },
  ]);

  const [step, setStep] = useState<number>(1); // 1..10
  const [busy, setBusy] = useState(false);

  const [inputValue, setInputValue] = useState("");
  const [noteEditing, setNoteEditing] = useState(false);

  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsub = subscribeAddressDraft((v) => {
      if (!v) return;
      applySelectedAddress(v);
      setAddressDraft(null);
    });

    const init = getAddressDraft();
    if (init) {
      applySelectedAddress(init);
      setAddressDraft(null);
    }

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  function pushSystem(text: string) {
    setMessages((prev) => [...prev, { id: `s_${Date.now()}`, role: "system", text }]);
  }

  function pushUser(text: string) {
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", text }]);
  }

  function applySelectedAddress(v: AddressDraft) {
    const dong = formatAddressToDong(v.roadAddress, v.bname);

    setDraft((d) => ({
      ...d,
      addressRoad: v.roadAddress,
      addressJibun: v.jibunAddress ?? null,
      zonecode: v.zonecode ?? null,
      addressDong: dong,
    }));

    pushUser(`주소: ${dong}`);
    pushSystem("희망 날짜를 선택해 주세요.");
    setStep(8);
  }

  // ----------------------------
  // Step handlers
  // ----------------------------
  function onSelectServiceType(v: ServiceType) {
    setDraft((d) => ({ ...d, serviceType: v, serviceSubType: null }));
    pushUser(v);
    pushSystem("세부 서비스를 선택해 주세요.");
    setStep(2);
  }

  function onSelectSubType(v: string) {
    setDraft((d) => ({ ...d, serviceSubType: v }));
    pushUser(v);

    // 요구사항 순서상: 4(청소 상세/기타1개) -> 3(주소)
    pushSystem("다음 항목을 입력해 주세요.");
    setStep(4);
  }

  function openAddressSearch() {
    // ✅ 그룹명 제거: URL에는 (customer) 안 들어감
    router.push("/requests/address-search");
  }

  function onSubmitNumeric(label: string) {
    const n = Number(String(inputValue).trim());
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert("입력 오류", `${label}는 숫자로 입력해 주세요.`);
      return;
    }

    if (draft.serviceType === "청소") {
      setDraft((d) => ({ ...d, cleaningPyeong: Math.round(n) }));
      pushUser(`${Math.round(n)}평`);
      pushSystem("방 개수를 선택해 주세요.");
      setStep(5);
    } else {
      setDraft((d) => ({ ...d, extraFieldValue: n }));
      pushUser(`${draft.extraFieldLabel ?? "추가 정보"}: ${n}`);
      pushSystem("주소를 입력해 주세요 (동까지).");
      setStep(3);
    }

    setInputValue("");
  }

  function stepperChange(key: "roomCount" | "bathroomCount" | "verandaCount", delta: number) {
    setDraft((d) => {
      const curr = Number(d[key] ?? 0);
      const next = Math.max(0, curr + delta);
      return { ...d, [key]: next };
    });
  }

  function confirmStepperAndNext() {
    if (step === 5) {
      pushUser(`방 ${draft.roomCount ?? 0}개`);
      pushSystem("화장실 개수를 선택해 주세요.");
      setStep(6);
      return;
    }
    if (step === 6) {
      pushUser(`화장실 ${draft.bathroomCount ?? 0}개`);
      pushSystem("베란다 개수를 선택해 주세요.");
      setStep(7);
      return;
    }
    if (step === 7) {
      pushUser(`베란다 ${draft.verandaCount ?? 0}개`);
      pushSystem("주소를 입력해 주세요 (동까지).");
      setStep(3);
      return;
    }
  }

  function onPickDate(mode: "today" | "tomorrow" | "unknown") {
    let ms: number | null = null;
    if (mode === "today") {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      ms = d.getTime();
    } else if (mode === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(12, 0, 0, 0);
      ms = d.getTime();
    } else {
      ms = null;
    }

    setDraft((d) => ({ ...d, desiredDateMs: ms }));
    pushUser(`희망 날짜: ${formatDateLabel(ms)}`);
    pushSystem("추가 요청사항이 있나요? (곰팡이·니코틴·스티커 등)");
    setStep(9);
  }

  function onConfirmNote() {
    const note = String(inputValue).trim();
    setDraft((d) => ({ ...d, note }));
    pushUser(note ? `요청사항: ${note}` : "요청사항 없음");
    setInputValue("");
    setNoteEditing(false);

    pushSystem("요약을 확인해 주세요.");
    setStep(10);
  }

  const canSubmit = useMemo(() => {
    if (!uid) return false;
    if (!draft.serviceType) return false;
    if (!draft.serviceSubType) return false;
    if (!draft.addressRoad || !draft.addressDong) return false;

    if (draft.serviceType === "청소") {
      if (!draft.cleaningPyeong) return false;
    } else {
      if (!draft.extraFieldKey) return false;
      if (draft.extraFieldValue == null || draft.extraFieldValue === "") return false;
    }
    return true;
  }, [uid, draft]);

  // 비청소면 step 4 진입 시 extra field 초기화
  useEffect(() => {
    if (step !== 4) return;
    if (!draft.serviceType) return;

    if (draft.serviceType !== "청소") {
      const meta = NON_CLEANING_EXTRA[draft.serviceType];
      setDraft((d) => ({
        ...d,
        extraFieldKey: meta.key,
        extraFieldLabel: meta.label,
        extraFieldValue: null,
      }));
      pushSystem(`${meta.label}을(를) 입력해 주세요. (${meta.placeholder})`);
    } else {
      pushSystem("청소 평수를 입력해 주세요.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function submit() {
    if (!uid) {
      Alert.alert("로그인이 필요합니다.");
      router.replace("/login");
      return;
    }
    if (!canSubmit) {
      Alert.alert("필수 항목을 모두 입력해 주세요.");
      return;
    }

    try {
      setBusy(true);

      const requestId = await createRequest({
        customerId: uid,
        serviceType: draft.serviceType!,
        serviceSubType: draft.serviceSubType!,

        addressRoad: draft.addressRoad!,
        addressJibun: draft.addressJibun,
        addressDong: draft.addressDong!,
        zonecode: draft.zonecode,

        cleaningPyeong: draft.serviceType === "청소" ? draft.cleaningPyeong : null,
        roomCount: draft.serviceType === "청소" ? draft.roomCount : null,
        bathroomCount: draft.serviceType === "청소" ? draft.bathroomCount : null,
        verandaCount: draft.serviceType === "청소" ? draft.verandaCount : null,

        extraFieldKey: draft.serviceType !== "청소" ? draft.extraFieldKey : null,
        extraFieldValue: draft.serviceType !== "청소" ? draft.extraFieldValue : null,

        desiredDateMs: draft.desiredDateMs,
        note: draft.note,
      });

      // ✅ 그룹명 제거
      router.replace(`/requests/${requestId}`);
    } catch (e: any) {
      Alert.alert("요청 실패", e?.message ?? "요청 생성 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // ----------------------------
  // Render input area by step
  // ----------------------------
  function renderStepInput() {
    if (step === 1) {
      const options: ServiceType[] = ["청소", "이사", "리모델링", "인테리어", "전기·설비"];
      return (
        <View style={styles.quickWrap}>
          {options.map((o) => (
            <TouchableOpacity key={o} style={styles.quickBtn} onPress={() => onSelectServiceType(o)}>
              <Text style={styles.quickText}>{o}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (step === 2 && draft.serviceType) {
      const options = SERVICE_SUBTYPES[draft.serviceType];
      return (
        <View style={styles.quickWrap}>
          {options.map((o) => (
            <TouchableOpacity key={o} style={styles.quickBtn} onPress={() => onSelectSubType(o)}>
              <Text style={styles.quickText}>{o}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (step === 3) {
      return (
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryBtn} onPress={openAddressSearch}>
            <FontAwesome name="search" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>주소 검색</Text>
          </TouchableOpacity>

          {draft.addressRoad ? (
            <View style={styles.miniInfo}>
              <Text style={styles.miniInfoText} numberOfLines={1}>
                {draft.addressDong}
              </Text>
            </View>
          ) : null}

          {!draft.addressRoad && draft.serviceType === "청소" && draft.cleaningPyeong == null ? (
            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={() => {
                pushSystem("청소 평수를 먼저 입력해 주세요.");
                setStep(4);
              }}
            >
              <Text style={styles.ghostText}>평수 먼저</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    if (step === 4) {
      const label = draft.serviceType === "청소" ? "평수" : (draft.extraFieldLabel ?? "추가 정보");
      const placeholder =
        draft.serviceType === "청소" ? "예: 24" : (draft.extraFieldLabel ? `예: ${draft.extraFieldLabel}` : "숫자 입력");

      return (
        <View style={styles.inputRow}>
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            placeholder={placeholder}
            placeholderTextColor={colors.subtext}
            keyboardType="number-pad"
            style={styles.input}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={() => onSubmitNumeric(label)}>
            <Text style={styles.sendText}>입력</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (step === 5 || step === 6 || step === 7) {
      const label = step === 5 ? "방" : step === 6 ? "화장실" : "베란다";
      const key = step === 5 ? "roomCount" : step === 6 ? "bathroomCount" : "verandaCount";
      const value = draft[key] ?? 0;

      return (
        <View style={styles.stepperWrap}>
          <Text style={styles.stepperLabel}>{label} 개수</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => stepperChange(key, -1)}>
              <Text style={styles.stepperBtnText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{value}</Text>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => stepperChange(key, +1)}>
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sendBtn} onPress={confirmStepperAndNext}>
              <Text style={styles.sendText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (step === 8) {
      return (
        <View style={styles.quickWrap}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => onPickDate("today")}>
            <Text style={styles.quickText}>오늘</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => onPickDate("tomorrow")}>
            <Text style={styles.quickText}>내일</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => onPickDate("unknown")}>
            <Text style={styles.quickText}>미정</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (step === 9) {
      if (!noteEditing) {
        return (
          <Pressable
            style={styles.notePlaceholder}
            onPress={() => {
              setNoteEditing(true);
              setInputValue(draft.note ?? "");
            }}
          >
            <Text style={styles.notePlaceholderText}>
              곰팡이·니코틴·스티커 등 요청사항을 입력하세요
            </Text>
          </Pressable>
        );
      }

      return (
        <View style={styles.inputRow}>
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="요청사항 입력"
            placeholderTextColor={colors.subtext}
            style={styles.input}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={onConfirmNote}>
            <Text style={styles.sendText}>완료</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (step === 10) {
      return (
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>요약</Text>

          <SummaryRow label="서비스" value={`${draft.serviceType ?? ""} / ${draft.serviceSubType ?? ""}`} />
          <SummaryRow label="주소(도로명)" value={draft.addressRoad ?? ""} />
          {draft.addressJibun ? <SummaryRow label="지번(참고)" value={draft.addressJibun} /> : null}
          <SummaryRow label="지역" value={draft.addressDong ?? ""} />

          {draft.serviceType === "청소" ? (
            <>
              <SummaryRow label="평수" value={`${draft.cleaningPyeong ?? 0}평`} />
              <SummaryRow label="방" value={`${draft.roomCount ?? 0}개`} />
              <SummaryRow label="화장실" value={`${draft.bathroomCount ?? 0}개`} />
              <SummaryRow label="베란다" value={`${draft.verandaCount ?? 0}개`} />
            </>
          ) : (
            <SummaryRow
              label={draft.extraFieldLabel ?? "추가 정보"}
              value={String(draft.extraFieldValue ?? "")}
            />
          )}

          <SummaryRow label="희망 날짜" value={formatDateLabel(draft.desiredDateMs)} />
          <SummaryRow label="요청사항" value={draft.note?.trim() ? draft.note : "없음"} />

          <TouchableOpacity
            style={[styles.submitBtn, (!canSubmit || busy) && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={!canSubmit || busy}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>{busy ? "제출 중..." : "요청 제출"}</Text>
          </TouchableOpacity>
        </Card>
      );
    }

    return null;
  }

  // 요구 순서 유지: subtype 선택 후 step4(상세/추가1개) -> step3(주소) -> step8...
  useEffect(() => {
    if (step !== 3) return;
    if (!draft.serviceType || !draft.serviceSubType) return;
    if (draft.addressRoad) return;

    if (draft.serviceType === "청소") {
      if (draft.cleaningPyeong == null) setStep(4);
    } else {
      if (!draft.extraFieldKey) setStep(4);
      else if (draft.extraFieldValue == null || draft.extraFieldValue === "") setStep(4);
    }
  }, [
    step,
    draft.serviceType,
    draft.serviceSubType,
    draft.addressRoad,
    draft.cleaningPyeong,
    draft.extraFieldKey,
    draft.extraFieldValue,
  ]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title="견적 요청"
        subtitle="대화처럼 간단히 작성해요."
        rightAction={
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.85}>
            <FontAwesome name="close" size={18} color={colors.text} />
          </TouchableOpacity>
        }
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.chat}
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.role === "user" ? styles.rowUser : styles.rowSystem]}>
            <View style={bubbleStyle(item.role)}>
              <Text style={bubbleTextStyle(item.role)}>{item.text}</Text>
            </View>
          </View>
        )}
      />

      <View style={styles.inputBar}>{renderStepInput()}</View>
    </Screen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  chat: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 10 },

  bubbleRow: { flexDirection: "row" },
  rowSystem: { justifyContent: "flex-start" },
  rowUser: { justifyContent: "flex-end" },

  bubble: {
    maxWidth: "82%",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleSystem: { backgroundColor: colors.card, borderColor: colors.border },
  bubbleUser: { backgroundColor: colors.primary, borderColor: colors.primary },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  textSystem: { color: colors.text, fontWeight: "700" },
  textUser: { color: "#fff", fontWeight: "800" },

  inputBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },

  quickWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quickBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickText: { color: colors.text, fontWeight: "800", fontSize: 13 },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },

  ghostBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ghostText: { color: colors.text, fontWeight: "800" },

  miniInfo: { flex: 1 },
  miniInfoText: { color: colors.subtext, fontWeight: "700" },

  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    fontWeight: "700",
  },
  sendBtn: {
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: "#fff", fontWeight: "900" },

  stepperWrap: { gap: spacing.sm },
  stepperLabel: { color: colors.text, fontWeight: "900" },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnText: { color: colors.text, fontWeight: "900", fontSize: 18 },
  stepperValue: { width: 40, textAlign: "center", color: colors.text, fontWeight: "900" },

  notePlaceholder: {
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  notePlaceholderText: { color: colors.subtext, fontWeight: "700" },

  summaryCard: { padding: spacing.lg, gap: 10 },
  summaryTitle: { fontSize: 16, fontWeight: "900", color: colors.text },

  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  summaryLabel: { color: colors.subtext, fontWeight: "800" },
  summaryValue: { flex: 1, textAlign: "right", color: colors.text, fontWeight: "800" },

  submitBtn: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 15 },
});
