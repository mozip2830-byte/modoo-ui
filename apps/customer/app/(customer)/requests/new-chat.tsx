// app/(customer)/requests/new-chat.tsx
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
  청소: ["입주청소", "이사청소", "에어컨청소"],
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
  const { uid } = useAuthUid();

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

  // 입력 상태(노트/숫자 등)
  const [inputValue, setInputValue] = useState("");
  const [noteEditing, setNoteEditing] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(() => new Date());

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const bootInputRef = useRef<TextInput>(null);

  // 주소 선택값 수신: addressDraftStore 구독
  useEffect(() => {
    const unsub = subscribeAddressDraft((v) => {
      if (!v) return;
      applySelectedAddress(v);
      setAddressDraft(null); // 사용 후 비우기
    });

    // 혹시 back으로 돌아왔는데 store에 남아있을 때도 처리
    const init = getAddressDraft();
    if (init) {
      applySelectedAddress(init);
      setAddressDraft(null);
    }

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 메시지 추가 시 자동 스크롤
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  useEffect(() => {
    setTimeout(() => bootInputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    if (step === 4 || (step === 9 && noteEditing)) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [step, noteEditing]);

  function pushSystem(text: string) {
    setMessages((prev) => [...prev, { id: `s_${Date.now()}`, role: "system", text }]);
  }

  function pushUser(text: string) {
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", text }]);
  }

  function removeRequestNotePrompt() {
    setMessages((prev) => prev.filter((msg) => !msg.text.includes("요청사항")));
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

    pushUser(`주소: ${dong}`);    pushSystem("\uCD94\uAC00 \uC694\uCCAD\uC0AC\uD56D\uC774 \uC788\uB098\uC694? (\uACF0\uD321\uC774\u00B7\uB2C8\uCF54\uD2F4\u00B7\uC2A4\uD2F0\uCEE4 \uB4F1)");
    setStep(8);
  }

  // ----------------------------
  // Step handlers
  // ----------------------------
  function onSelectServiceType(v: ServiceType) {
    setDraft((d) => ({ ...d, serviceType: v, serviceSubType: null }));
    pushUser(v);    pushSystem("\uCD94\uAC00 \uC694\uCCAD\uC0AC\uD56D\uC774 \uC788\uB098\uC694? (\uACF0\uD321\uC774\u00B7\uB2C8\uCF54\uD2F4\u00B7\uC2A4\uD2F0\uCEE4 \uB4F1)");
    setStep(2);
  }

  function onSelectSubType(v: string) {
    setDraft((d) => ({ ...d, serviceSubType: v }));
    pushUser(v);

    if (draft.serviceType === "청소") {
      setStep(4);
    } else {
      pushSystem("주소를 입력해 주세요 (동까지).");
      setStep(3);
    }
  }

  function openAddressSearch() {
    router.push("/(customer)/requests/address-search");
  }

  function onSubmitNumeric(label: string) {
    const n = Number(String(inputValue).trim());
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert("입력 오류", `${label}는 숫자로 입력해 주세요.`);
      return;
    }

    if (draft.serviceType === "청소") {
      // step 4: 평수
      setDraft((d) => ({ ...d, cleaningPyeong: Math.round(n) }));
      pushUser(`${Math.round(n)}평`);
      pushSystem("방 개수를 선택해 주세요.");
      setStep(5);
    } else {
      // non-cleaning extraField
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
    removeRequestNotePrompt();
    setStep(9);
  }

  function onPickDateValue(date: Date) {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    const ms = d.getTime();

    setDraft((draft) => ({ ...draft, desiredDateMs: ms }));
    pushUser(`희망 날짜: ${formatDateLabel(ms)}`);
    removeRequestNotePrompt();
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
      // room/bath/veranda는 기본값 있으니 통과
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
      router.push("/(customer)/auth/login");
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

      router.replace(`/(customer)/requests/${requestId}`);
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
    // step 1: service type
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

    // step 2: service sub type (2 options each)
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

    // step 3: address search
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

          {/* 청소/비청소 분기: 주소 단계 전까지 정보 누락 시 step 4로 돌아가게(안전장치) */}
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

    // step 4: cleaning pyeong or non-cleaning extra
    if (step === 4) {
      const label = draft.serviceType === "청소" ? "평수" : (draft.extraFieldLabel ?? "추가 정보");
      const placeholder =
        draft.serviceType === "청소" ? "예: 24" : (draft.extraFieldLabel ? `예: ${draft.extraFieldLabel}` : "숫자 입력");

      return (
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder={placeholder}
            placeholderTextColor={colors.subtext}
            keyboardType="number-pad"
            style={styles.input}
            autoFocus
          />
          <TouchableOpacity style={styles.sendBtn} onPress={() => onSubmitNumeric(label)}>
            <Text style={styles.sendText}>입력</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // step 5/6/7: stepper counts (cleaning only)
    if (step === 5 || step === 6 || step === 7) {
      const label =
        step === 5 ? "방" : step === 6 ? "화장실" : "베란다";
      const key =
        step === 5 ? "roomCount" : step === 6 ? "bathroomCount" : "verandaCount";
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

    // step 8: desired date picker
    if (step === 8) {
      return (
        <View style={styles.dateWrap}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setDatePickerVisible(true)}>
            <FontAwesome name="calendar" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>달력에서 선택</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => onPickDate("unknown")}>
            <Text style={styles.ghostText}>미정</Text>
          </TouchableOpacity>
          {datePickerVisible ? (
            <DateTimePicker
              value={datePickerValue}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(_, selected) => {
                if (Platform.OS !== "ios") setDatePickerVisible(false);
                if (!selected) return;
                const picked = new Date(selected);
                picked.setHours(12, 0, 0, 0);
                setDatePickerValue(picked);
                onPickDateValue(picked);
              }}
            />
          ) : null}
        </View>
      );
    }

    // step 9: note placeholder -> input
    if (step === 9) {
      if (!noteEditing) {
        return (
          <View style={styles.noteWrap}>
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
            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={() => {
                setInputValue("");
                onConfirmNote();
              }}
            >
              <Text style={styles.ghostText}>없음</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="요청사항 입력"
            placeholderTextColor={colors.subtext}
            style={styles.input}
            autoFocus
          />
          <TouchableOpacity style={styles.sendBtn} onPress={onConfirmNote}>
            <Text style={styles.sendText}>완료</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // step 10: summary + submit
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

  // step transition: after subtype chosen, go to step 4 for cleaning/non-cleaning before address? (요구사항상 4~7이 주소보다 먼저)
  useEffect(() => {
    if (step !== 3) return;
    // 요구한 순서: 4~7(청소 상세) -> 3 주소 -> 8 날짜 -> 9 요청사항 -> 10 요약
    // 우리가 step2->(system:주소)->step3로 안내했지만, 요구사항 순서를 지키려면:
    // 청소면 step4로 먼저 보내고, 비청소면 step4(임의1개)로 먼저 보낸 뒤, 그 다음 step3(주소)로 돌아오게 구성
    if (!draft.serviceType || !draft.serviceSubType) return;

    if (draft.addressRoad) return; // 이미 주소까지 했으면 OK

    // 아직 평수/extra가 없으면 4로 이동
    if (draft.serviceType === "청소") {
      if (draft.cleaningPyeong == null) {
        setStep(4);
        return;
      }
      // 평수 들어간 뒤 방/화장실/베란다를 거치고 나면 다시 3으로 돌아옴(우리가 confirmStepperAndNext에서 3으로 돌림)
    } else {
      if (!draft.extraFieldKey) {
        setStep(4);
        return;
      }
      if (draft.extraFieldValue == null || draft.extraFieldValue === "") {
        setStep(4);
        return;
      }
    }
  }, [step, draft.serviceType, draft.serviceSubType, draft.addressRoad, draft.cleaningPyeong, draft.extraFieldKey, draft.extraFieldValue]);

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

      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 30}
        style={styles.keyboardAvoiding}
      >
        <View style={styles.inputBar}>
          <TextInput ref={bootInputRef} style={styles.hiddenInput} />
          {renderStepInput()}
        </View>
      </KeyboardAvoidingView>
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
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  keyboardAvoiding: { backgroundColor: colors.bg },
  hiddenInput: { width: 0, height: 0, opacity: 0 },

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
  noteWrap: { gap: spacing.sm },

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
