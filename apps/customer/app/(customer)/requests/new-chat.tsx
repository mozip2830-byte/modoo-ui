// app/(customer)/requests/new-chat.tsx
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
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
type ServiceType = "청소" | "가전/가구 청소" | "이사" | "인테리어" | "시공/설치";

type Message = {
  id: string;
  role: "system" | "user";
  text: string;
  buttons?: Array<{
    label: string;
    onPress: () => void;
    selected?: boolean;
  }>;
};

type Draft = {
  serviceType: ServiceType | null;
  serviceSubType: string | null;

  addressRoad: string | null;
  addressJibun: string | null;
  addressDong: string | null;
  zonecode: string | null;

  // cleaning (일반 청소)
  cleaningPyeong: number | null;
  roomCount: string | number | null; // "1" | "2" | "3" | "4" | "5" | "기타" | number
  roomCountCustom: string | null; // 기타 입력값
  bathroomCount: string | number | null;
  bathroomCountCustom: string | null;
  verandaCount: string | number | null;
  verandaCountCustom: string | null;
  additionalRequests: string[]; // ["곰팡이제거", "니코틴제거", ...]
  additionalRequestsCustom: string | null;

  // appliance cleaning (가전/가구 청소)
  applianceType: string | null; // 에어컨, 냉장고, 세탁기, 실외기, 가전제품
  applianceTypeOption: string | null; // 에어컨 종류, 냉장고 종류 등
  applianceTypeOptionCustom: string | null;
  applianceCleaningType: string | null; // 에어컨 청소 방식
  applianceCleaningTypeCustom: string | null;
  applianceAdditionalRequests: string | null; // 추가 요청사항

  // non-cleaning one extra
  extraFieldKey: string | null;
  extraFieldLabel: string | null;
  extraFieldValue: string | number | null;

  desiredDateMs: number | null; // ms (null = 미정)
  desiredDateSelected: boolean;
  note: string;
};

const SERVICE_SUBTYPES: Record<ServiceType, string[]> = {
  청소: ["입주청소", "이사청소", "에어컨청소"],
  "가전/가구 청소": ["에어컨청소", "냉장고청소", "세탁기청소", "실외기청소", "가전제품청소", "가구청소", "침대청소", "소파청소"],
  이사: ["원룸이사", "포장이사"],
  인테리어: ["주방", "욕실"],
  "시공/설치": ["시공", "설치"],
} as const;

const NON_CLEANING_EXTRA: Record<
  Exclude<ServiceType, "청소" | "가전/가구 청소">,
  { key: string; label: string; placeholder: string }
> = {
  이사: { key: "floor", label: "층수", placeholder: "예: 3층" },
  인테리어: { key: "spaceSize", label: "공간크기", placeholder: "예: 15평" },
  "시공/설치": { key: "details", label: "시공/설치 내용", placeholder: "예: 보일러 설치 / 선반 시공" },
} as const;

const APPLIANCE_CLEANING_CONFIG: Record<string, {
  typeLabel: string;
  typeOptions?: string[];
  cleaningTypeLabel?: string;
  cleaningTypeOptions?: string[];
  requestsLabel: string;
  applianceNameField?: boolean;
}> = {
  "에어컨청소": {
    typeLabel: "에어컨 종류를 선택해주세요.",
    typeOptions: ["시스템에어컨", "벽걸이에어컨", "2in1에어컨", "4way에어컨", "기타"],
    cleaningTypeLabel: "청소 방식을 선택해주세요.",
    cleaningTypeOptions: ["필터청소", "반분해청소", "분해청소", "기타"],
    requestsLabel: "추가 요청사항을 입력해주세요.",
  },
  "냉장고청소": {
    typeLabel: "냉장고 종류를 선택해주세요.",
    typeOptions: ["단문형", "양문형", "업소용냉장고", "쇼케이스", "기타"],
    requestsLabel: "추가 요청사항을 입력해주세요.",
  },
  "세탁기청소": {
    typeLabel: "세탁기 종류를 선택해주세요.",
    typeOptions: ["통돌이세탁기", "드럼세탁기", "기타"],
    requestsLabel: "추가 요청사항을 입력해주세요.",
  },
  "실외기청소": {
    typeLabel: "실외기 종류를 선택해주세요.",
    typeOptions: ["멀티형", "싱글형", "싱글스탠드", "올인원", "기타"],
    requestsLabel: "추가 요청사항을 입력해주세요.",
  },
  "가전제품청소": {
    typeLabel: "청소가 필요하신 가전제품을 입력해주세요.",
    requestsLabel: "추가 요청사항을 입력해주세요.",
    applianceNameField: true,
  },
} as const;

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
  const params = useLocalSearchParams<{ partnerId?: string; serviceType?: string; serviceSubType?: string }>();
  const targetPartnerId = useMemo(() => {
    if (!params.partnerId) return null;
    return Array.isArray(params.partnerId) ? params.partnerId[0] : params.partnerId;
  }, [params.partnerId]);
  const selectedService = useMemo(() => {
    if (!params.serviceType) return null;
    const service = Array.isArray(params.serviceType) ? params.serviceType[0] : params.serviceType;
    const validServices: ServiceType[] = ["청소", "가전/가구 청소", "이사", "인테리어", "시공/설치"];
    return validServices.includes(service as ServiceType) ? (service as ServiceType) : null;
  }, [params.serviceType]);
  const selectedServiceSubType = useMemo(() => {
    if (!params.serviceSubType) return null;
    return Array.isArray(params.serviceSubType) ? params.serviceSubType[0] : params.serviceSubType;
  }, [params.serviceSubType]);
  const { uid } = useAuthUid();

  const [draft, setDraft] = useState<Draft>({
    serviceType: null,
    serviceSubType: null,

    addressRoad: null,
    addressJibun: null,
    addressDong: null,
    zonecode: null,

    cleaningPyeong: null,
    roomCount: null,
    roomCountCustom: null,
    bathroomCount: null,
    bathroomCountCustom: null,
    verandaCount: null,
    verandaCountCustom: null,
    additionalRequests: [],
    additionalRequestsCustom: null,

    applianceType: null,
    applianceTypeOption: null,
    applianceTypeOptionCustom: null,
    applianceCleaningType: null,
    applianceCleaningTypeCustom: null,
    applianceAdditionalRequests: null,

    extraFieldKey: null,
    extraFieldLabel: null,
    extraFieldValue: null,

    desiredDateMs: null,
    desiredDateSelected: false,
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
  const [editingCustomField, setEditingCustomField] = useState<"roomCount" | "bathroomCount" | "verandaCount" | null>(null);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const bootInputRef = useRef<TextInput>(null);

  // 서비스 종류가 라우트 파라미터로 전달된 경우 자동 선택
  useEffect(() => {
    if (selectedService && step === 1 && draft.serviceType === null) {
      onSelectServiceType(selectedService);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService]);

  // ✅ 세부 서비스도 자동 선택
  useEffect(() => {
    if (selectedServiceSubType && draft.serviceType !== null && draft.serviceSubType === null) {
      onSelectSubType(selectedServiceSubType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServiceSubType, draft.serviceType]);

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

  // 주소가 설정되면 다음 step으로 진행
  useEffect(() => {
    if (!draft.addressRoad || step !== 4) return;

    if (isRegularCleaningService(draft.serviceType)) {
      pushSystem("청소 평수를 입력해 주세요.");
    } else if (isApplianceCleaningService(draft.serviceType)) {
      const config = APPLIANCE_CLEANING_CONFIG[draft.serviceSubType ?? ""];
      if (config) {
        if (config.applianceNameField) {
          pushSystem(config.typeLabel);
        } else {
          pushSystemWithButtons(config.typeLabel, (config.typeOptions || []).map((opt) => ({
            label: opt,
            onPress: () => handleApplianceTypeSelect(opt),
          })));
        }
      }
    }
    setStep(5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.addressRoad]);

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

  function pushSystemWithButtons(text: string, buttons: Array<{ label: string; onPress: () => void }>) {
    setMessages((prev) => [...prev, { id: `s_${Date.now()}`, role: "system", text, buttons }]);
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

    pushUser(`주소: ${dong}`);
    // step 진행은 useEffect에서 처리
  }

  // ----------------------------
  // Helper functions
  // ----------------------------
  function isCleaningService(serviceType: ServiceType | null): boolean {
    return serviceType === "청소" || serviceType === "가전/가구 청소";
  }

  function isApplianceCleaningService(serviceType: ServiceType | null): boolean {
    return serviceType === "가전/가구 청소";
  }

  function isRegularCleaningService(serviceType: ServiceType | null): boolean {
    return serviceType === "청소";
  }

  // ----------------------------
  // Step handlers
  // ----------------------------
  function onSelectServiceType(v: ServiceType) {
    setDraft((d) => ({ ...d, serviceType: v, serviceSubType: null }));
    pushUser(v);
    pushSystem("세부 서비스를 선택해주세요.");
    setStep(2);
  }

  function onSelectSubType(v: string) {
    setDraft((d) => ({ ...d, serviceSubType: v }));
    pushUser(v);
    // 모든 서비스: 세부 종류 선택 후 날짜 선택으로
    pushSystem("서비스 날짜를 선택해주세요.");
    setStep(3);
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

    if (isCleaningService(draft.serviceType)) {
      // step 5: 평수 → 방 개수 (step 6)
      setDraft((d) => ({ ...d, cleaningPyeong: Math.round(n) }));
      pushUser(`${Math.round(n)}평`);
      pushSystemWithButtons("방 개수를 선택해 주세요.", [
        { label: "1개", onPress: () => handleRoomSelect("1") },
        { label: "2개", onPress: () => handleRoomSelect("2") },
        { label: "3개", onPress: () => handleRoomSelect("3") },
        { label: "4개", onPress: () => handleRoomSelect("4") },
        { label: "5개", onPress: () => handleRoomSelect("5") },
        { label: "기타", onPress: () => handleRoomSelect("기타") },
      ]);
      setStep(6);
    } else {
      // non-cleaning extraField: step 5 → 추가 요청사항 (step 9)
      setDraft((d) => ({ ...d, extraFieldValue: n }));
      pushUser(`${draft.extraFieldLabel ?? "추가 정보"}: ${n}`);
      pushSystemWithButtons("추가 요청사항이 있으신가요?", [
        { label: "없음", onPress: () => handleRequestSelect("없음") },
      ]);
      setStep(9);
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
    if (step === 6) {
      pushUser(`방 ${draft.roomCount ?? 0}개`);
      pushSystem("화장실 개수를 선택해 주세요.");
      setStep(7);
      return;
    }
    if (step === 7) {
      pushUser(`화장실 ${draft.bathroomCount ?? 0}개`);
      pushSystem("베란다 개수를 선택해 주세요.");
      setStep(8);
      return;
    }
    if (step === 8) {
      pushUser(`베란다 ${draft.verandaCount ?? 0}개`);
      pushSystemWithButtons("추가 요청사항이 있나요?", [
        { label: "곰팡이제거", onPress: () => handleRequestSelect("곰팡이제거") },
        { label: "니코틴제거", onPress: () => handleRequestSelect("니코틴제거") },
        { label: "새집증후군", onPress: () => handleRequestSelect("새집증후군") },
        { label: "기타", onPress: () => handleRequestSelect("기타") },
        { label: "없음", onPress: () => handleRequestSelect("없음") },
      ]);
      setStep(9);
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

    setDraft((d) => ({ ...d, desiredDateMs: ms, desiredDateSelected: true }));
    pushUser(`서비스 날짜: ${formatDateLabel(ms)}`);

    // 서비스별로 다르게 처리
    if (isCleaningService(draft.serviceType)) {
      pushSystem("서비스 받으실 주소를 입력해주세요 (동까지)");
      setStep(4);
    } else {
      pushSystem("다음 단계를 준비 중입니다...");
      setStep(100); // 임시 step
    }
  }

  function onPickDateValue(date: Date) {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    const ms = d.getTime();

    setDraft((draft) => ({ ...draft, desiredDateMs: ms, desiredDateSelected: true }));
    pushUser(`서비스 날짜: ${formatDateLabel(ms)}`);

    // 서비스별로 다르게 처리
    if (isCleaningService(draft.serviceType)) {
      pushSystem("서비스 받으실 주소를 입력해주세요 (동까지)");
      setStep(4);
    } else {
      pushSystem("다음 단계를 준비 중입니다...");
      setStep(100); // 임시 step
    }
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

  // 방 개수 선택 핸들러
  function handleRoomSelect(value: string) {
    if (value === "기타") {
      setDraft((d) => ({ ...d, roomCount: value }));
      setEditingCustomField("roomCount");
      setInputValue("");
    } else {
      pushUser(`방: ${value}개`);
      setDraft((d) => ({ ...d, roomCount: value }));
      pushSystemWithButtons("화장실 개수를 선택해 주세요.", [
        { label: "1개", onPress: () => handleBathroomSelect("1"), selected: false },
        { label: "2개", onPress: () => handleBathroomSelect("2"), selected: false },
        { label: "3개", onPress: () => handleBathroomSelect("3"), selected: false },
        { label: "기타", onPress: () => handleBathroomSelect("기타"), selected: false },
      ]);
      setStep(7);
    }
  }

  // 화장실 개수 선택 핸들러
  function handleBathroomSelect(value: string) {
    if (value === "기타") {
      setDraft((d) => ({ ...d, bathroomCount: value }));
      setEditingCustomField("bathroomCount");
      setInputValue("");
    } else {
      pushUser(`화장실: ${value}개`);
      setDraft((d) => ({ ...d, bathroomCount: value }));
      pushSystemWithButtons("베란다 개수를 선택해 주세요.", [
        { label: "1개", onPress: () => handleVerandaSelect("1") },
        { label: "2개", onPress: () => handleVerandaSelect("2") },
        { label: "3개", onPress: () => handleVerandaSelect("3") },
        { label: "4개", onPress: () => handleVerandaSelect("4") },
        { label: "5개", onPress: () => handleVerandaSelect("5") },
        { label: "기타", onPress: () => handleVerandaSelect("기타") },
      ]);
      setStep(8);
    }
  }

  // 베란다 개수 선택 핸들러
  function handleVerandaSelect(value: string) {
    if (value === "기타") {
      setDraft((d) => ({ ...d, verandaCount: value }));
      setEditingCustomField("verandaCount");
      setInputValue("");
    } else {
      pushUser(`베란다: ${value}개`);
      setDraft((d) => ({ ...d, verandaCount: value }));
      pushSystemWithButtons("추가 요청사항이 있나요?", [
        { label: "곰팡이제거", onPress: () => handleRequestSelect("곰팡이제거") },
        { label: "니코틴제거", onPress: () => handleRequestSelect("니코틴제거") },
        { label: "새집증후군", onPress: () => handleRequestSelect("새집증후군") },
        { label: "기타", onPress: () => handleRequestSelect("기타") },
        { label: "없음", onPress: () => handleRequestSelect("없음") },
      ]);
      setStep(9);
    }
  }

  // 추가 요청사항 선택 핸들러
  function handleRequestSelect(value: string) {
    if (value === "없음") {
      pushUser("추가 요청사항 없음");
      pushSystem("요약을 확인해 주세요.");
      setStep(10);
    } else if (value === "기타") {
      pushUser("기타");
      setDraft((d) => ({
        ...d,
        additionalRequests: [...d.additionalRequests, "기타"],
      }));
      setEditingCustomField("additionalRequests");
      setInputValue("");
    } else {
      pushUser(`요청: ${value}`);
      setDraft((d) => ({
        ...d,
        additionalRequests: [...d.additionalRequests, value],
      }));
      pushSystem("요약을 확인해 주세요.");
      setStep(10);
    }
  }

  // 가전청소 - 타입 선택 핸들러
  function handleApplianceTypeSelect(value: string) {
    setDraft((d) => ({ ...d, applianceTypeOption: value }));
    if (value === "기타") {
      setEditingCustomField("applianceTypeOption");
      setInputValue("");
    } else {
      pushUser(`${value}`);

      // 에어컨청소는 청소 방식 선택으로 이동, 다른 것들은 추가 요청사항으로 이동
      if (draft.serviceSubType === "에어컨청소") {
        const config = APPLIANCE_CLEANING_CONFIG["에어컨청소"];
        pushSystemWithButtons(config.cleaningTypeLabel || "청소 방식을 선택해주세요.",
          (config.cleaningTypeOptions || []).map((opt) => ({
            label: opt,
            onPress: () => handleApplianceCleaningTypeSelect(opt),
          }))
        );
        setStep(6);
      } else {
        // 냉장고, 세탁기, 실외기: 추가 요청사항 입력으로 이동
        const config = APPLIANCE_CLEANING_CONFIG[draft.serviceSubType ?? ""];
        pushSystem(config.requestsLabel || "추가 요청사항을 입력해주세요.");
        setStep(6);
      }
    }
  }

  // 가전청소 - 에어컨 청소 방식 선택 핸들러
  function handleApplianceCleaningTypeSelect(value: string) {
    setDraft((d) => ({ ...d, applianceCleaningType: value }));
    if (value === "기타") {
      setEditingCustomField("applianceCleaningType");
      setInputValue("");
    } else {
      pushUser(`${value}`);
      pushSystem("추가 요청사항을 입력해 주세요.");
      setStep(7);
    }
  }

  const canSubmit = useMemo(() => {
    // Step 3까지만 완성됨 - 아직 제출 불가능
    if (step < 10) return false;

    if (!uid) return false;
    if (!draft.serviceType) return false;
    if (!draft.serviceSubType) return false;
    // 서비스 날짜는 필수
    if (!draft.desiredDateSelected) return false;

    return true;
  }, [uid, draft, step]);

  // 서비스별 상세정보는 나중에 구현
  // Step 4+ 로직은 서비스별로 다르게 처리할 예정

  async function submit() {
    if (!uid) {
      Alert.alert("로그인이 필요합니다.");
      router.push({ pathname: "/login", params: { force: "1" } });
      return;
    }
    if (!canSubmit) {
      Alert.alert("필수 항목을 모두 입력해 주세요.");
      return;
    }

    try {
      setBusy(true);

      // 청소 서비스의 경우 수치를 정리
      let roomCountValue: number | string | null = null;
      let bathroomCountValue: number | string | null = null;
      let verandaCountValue: number | string | null = null;

      if (draft.serviceType === "청소") {
        roomCountValue =
          draft.roomCount === "기타" ? draft.roomCountCustom : draft.roomCount;
        bathroomCountValue =
          draft.bathroomCount === "기타"
            ? draft.bathroomCountCustom
            : draft.bathroomCount;
        verandaCountValue =
          draft.verandaCount === "기타"
            ? draft.verandaCountCustom
            : draft.verandaCount;
      }

      // 추가 요청사항 메모로 변환
      let noteText = draft.note;
      if (draft.serviceType === "청소" && draft.additionalRequests && draft.additionalRequests.length > 0) {
        const requests = draft.additionalRequests.map((r) =>
          r === "기타" ? draft.additionalRequestsCustom : r
        );
        noteText = requests.join(", ") + (draft.note ? "\n" + draft.note : "");
      }

      // 가전청소 정보를 note에 추가
      if (draft.serviceType === "가전/가구 청소") {
        let applianceInfo = "";
        if (draft.serviceSubType === "에어컨청소") {
          const acType =
            draft.applianceTypeOption === "기타"
              ? draft.applianceTypeOptionCustom
              : draft.applianceTypeOption;
          const cleaningType =
            draft.applianceCleaningType === "기타"
              ? draft.applianceCleaningTypeCustom
              : draft.applianceCleaningType;
          applianceInfo = `에어컨: ${acType}, 청소방식: ${cleaningType}`;
        } else if (draft.serviceSubType === "냉장고청소") {
          const fridgeType =
            draft.applianceTypeOption === "기타"
              ? draft.applianceTypeOptionCustom
              : draft.applianceTypeOption;
          applianceInfo = `냉장고: ${fridgeType}`;
        } else if (draft.serviceSubType === "세탁기청소") {
          const washerType =
            draft.applianceTypeOption === "기타"
              ? draft.applianceTypeOptionCustom
              : draft.applianceTypeOption;
          applianceInfo = `세탁기: ${washerType}`;
        } else if (draft.serviceSubType === "실외기청소") {
          const outdoorType =
            draft.applianceTypeOption === "기타"
              ? draft.applianceTypeOptionCustom
              : draft.applianceTypeOption;
          applianceInfo = `실외기: ${outdoorType}`;
        } else if (draft.serviceSubType === "가전제품청소") {
          applianceInfo = `가전제품: ${draft.applianceType}`;
        }

        noteText = applianceInfo;
        if (draft.applianceAdditionalRequests) {
          noteText += `\n추가요청: ${draft.applianceAdditionalRequests}`;
        }
      }

      const requestId = await createRequest({
        customerId: uid,
        targetPartnerId,
        serviceType: draft.serviceType!,
        serviceSubType: draft.serviceSubType!,

        addressRoad: draft.addressRoad!,
        addressJibun: draft.addressJibun,
        addressDong: draft.addressDong!,
        zonecode: draft.zonecode,

        cleaningPyeong: draft.serviceType === "청소" ? draft.cleaningPyeong : null,
        roomCount: draft.serviceType === "청소" ? roomCountValue : null,
        bathroomCount: draft.serviceType === "청소" ? bathroomCountValue : null,
        verandaCount: draft.serviceType === "청소" ? verandaCountValue : null,

        extraFieldKey: draft.serviceType !== "청소" && draft.serviceType !== "가전/가구 청소" ? draft.extraFieldKey : null,
        extraFieldValue: draft.serviceType !== "청소" && draft.serviceType !== "가전/가구 청소" ? draft.extraFieldValue : null,

        desiredDateMs: draft.desiredDateMs,
        note: noteText,
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
      const options: ServiceType[] = ["청소", "가전/가구 청소", "이사", "인테리어", "시공/설치"];
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

    // step 3: desired date picker (service date - common for all)
    if (step === 3) {
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

    // === 청소 서비스 (step 4-10) ===

    // step 4: 주소 입력
    if (step === 4) {
      return (
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryBtn} onPress={openAddressSearch}>
            <FontAwesome name="search" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>주소 검색</Text>
          </TouchableOpacity>
          {draft.addressDong ? (
            <View style={styles.miniInfo}>
              <Text style={styles.miniInfoText} numberOfLines={1}>
                {draft.addressDong}
              </Text>
            </View>
          ) : null}
        </View>
      );
    }

    // step 5: 평수 입력 (일반 청소) 또는 가전 종류 선택 (가전청소)
    if (step === 5) {
      // 일반 청소: 평수 입력
      if (isRegularCleaningService(draft.serviceType)) {
        return (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="예: 24"
              placeholderTextColor={colors.subtext}
              keyboardType="number-pad"
              style={styles.input}
              autoFocus
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                const n = Number(String(inputValue).trim());
                if (!Number.isFinite(n) || n <= 0) {
                  Alert.alert("입력 오류", "평수는 숫자로 입력해 주세요.");
                  return;
                }
                setDraft((d) => ({ ...d, cleaningPyeong: Math.round(n) }));
                pushUser(`${Math.round(n)}평`);
                pushSystemWithButtons("방 개수를 선택해 주세요.", [
                  { label: "1개", onPress: () => handleRoomSelect("1") },
                  { label: "2개", onPress: () => handleRoomSelect("2") },
                  { label: "3개", onPress: () => handleRoomSelect("3") },
                  { label: "4개", onPress: () => handleRoomSelect("4") },
                  { label: "5개", onPress: () => handleRoomSelect("5") },
                  { label: "기타", onPress: () => handleRoomSelect("기타") },
                ]);
                setInputValue("");
                setStep(6);
              }}
            >
              <Text style={styles.sendText}>입력</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // 가전청소 - 가전제품청소: 가전제품명 입력
      if (isApplianceCleaningService(draft.serviceType) && draft.serviceSubType === "가전제품청소") {
        return (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="예: 에어프라이어"
              placeholderTextColor={colors.subtext}
              style={styles.input}
              autoFocus
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                if (!inputValue.trim()) {
                  Alert.alert("입력 오류", "가전제품명을 입력해 주세요.");
                  return;
                }
                setDraft((d) => ({ ...d, applianceType: inputValue.trim() }));
                pushUser(`가전: ${inputValue.trim()}`);
                pushSystem("추가 요청사항을 입력해 주세요.");
                setInputValue("");
                setStep(6);
              }}
            >
              <Text style={styles.sendText}>입력</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // 가전청소 - 다른 서비스: 버튼 메시지가 이미 푸시됨, renderStepInput에서 null 반환
      return null;
    }

    // step 6: 방 개수 선택 (일반청소) 또는 기타 입력 (가전청소)
    if (step === 6) {
      // 일반 청소: 방 개수 선택
      if (isRegularCleaningService(draft.serviceType)) {
        if (editingCustomField === "roomCount") {
          return (
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder="방 개수 입력"
                placeholderTextColor={colors.subtext}
                style={styles.input}
                autoFocus
              />
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={() => {
                  setDraft((d) => ({ ...d, roomCountCustom: inputValue }));
                  pushUser(`방: ${inputValue}`);
                  pushSystemWithButtons("화장실 개수를 선택해 주세요.", [
                    { label: "1개", onPress: () => handleBathroomSelect("1") },
                    { label: "2개", onPress: () => handleBathroomSelect("2") },
                    { label: "3개", onPress: () => handleBathroomSelect("3") },
                    { label: "기타", onPress: () => handleBathroomSelect("기타") },
                  ]);
                  setInputValue("");
                  setEditingCustomField(null);
                  setStep(7);
                }}
              >
                <Text style={styles.sendText}>입력</Text>
              </TouchableOpacity>
            </View>
          );
        }

        return null; // inputBar에 아무것도 표시 안 함
      }

      // 가전청소 - 타입 옵션 "기타" 입력
      if (isApplianceCleaningService(draft.serviceType) && editingCustomField === "applianceTypeOption") {
        return (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="입력해주세요"
              placeholderTextColor={colors.subtext}
              style={styles.input}
              autoFocus
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                if (!inputValue.trim()) return;
                setDraft((d) => ({ ...d, applianceTypeOptionCustom: inputValue.trim() }));
                pushUser(`${inputValue.trim()}`);

                if (draft.serviceSubType === "에어컨청소") {
                  const config = APPLIANCE_CLEANING_CONFIG["에어컨청소"];
                  pushSystemWithButtons(config.cleaningTypeLabel || "청소 방식을 선택해주세요.",
                    (config.cleaningTypeOptions || []).map((opt) => ({
                      label: opt,
                      onPress: () => handleApplianceCleaningTypeSelect(opt),
                    }))
                  );
                  setStep(7);
                } else {
                  const config = APPLIANCE_CLEANING_CONFIG[draft.serviceSubType ?? ""];
                  pushSystem(config.requestsLabel || "추가 요청사항을 입력해주세요.");
                  setStep(7);
                }
                setInputValue("");
                setEditingCustomField(null);
              }}
            >
              <Text style={styles.sendText}>입력</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // 가전청소 - 에어컨 청소 방식 "기타" 입력
      if (isApplianceCleaningService(draft.serviceType) && editingCustomField === "applianceCleaningType") {
        return (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="입력해주세요"
              placeholderTextColor={colors.subtext}
              style={styles.input}
              autoFocus
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                if (!inputValue.trim()) return;
                setDraft((d) => ({ ...d, applianceCleaningTypeCustom: inputValue.trim() }));
                pushUser(`${inputValue.trim()}`);
                pushSystem("추가 요청사항을 입력해 주세요.");
                setInputValue("");
                setEditingCustomField(null);
                setStep(7);
              }}
            >
              <Text style={styles.sendText}>입력</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // 가전청소 - 추가 요청사항 입력 (냉장고, 세탁기, 실외기, 가전제품)
      if (isApplianceCleaningService(draft.serviceType) && draft.serviceSubType !== "에어컨청소") {
        return (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="없으면 비워두세요"
              placeholderTextColor={colors.subtext}
              style={styles.input}
              autoFocus
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                setDraft((d) => ({ ...d, applianceAdditionalRequests: inputValue.trim() || null }));
                pushUser(inputValue.trim() || "없음");
                pushSystem("요약을 확인해 주세요.");
                setInputValue("");
                setStep(10);
              }}
            >
              <Text style={styles.sendText}>입력</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return null;
    }

    // step 7: 화장실 개수 선택 (일반청소) 또는 추가 요청사항 입력 (가전청소 에어컨)
    if (step === 7) {
      // 일반 청소: 화장실 개수 선택
      if (isRegularCleaningService(draft.serviceType)) {
        if (editingCustomField === "bathroomCount") {
          return (
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder="화장실 개수 입력"
                placeholderTextColor={colors.subtext}
                style={styles.input}
                autoFocus
              />
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={() => {
                  setDraft((d) => ({ ...d, bathroomCountCustom: inputValue }));
                  pushUser(`화장실: ${inputValue}`);
                  pushSystemWithButtons("베란다 개수를 선택해 주세요.", [
                    { label: "1개", onPress: () => handleVerandaSelect("1") },
                    { label: "2개", onPress: () => handleVerandaSelect("2") },
                    { label: "3개", onPress: () => handleVerandaSelect("3") },
                    { label: "4개", onPress: () => handleVerandaSelect("4") },
                    { label: "5개", onPress: () => handleVerandaSelect("5") },
                    { label: "기타", onPress: () => handleVerandaSelect("기타") },
                  ]);
                  setInputValue("");
                  setEditingCustomField(null);
                  setStep(8);
                }}
              >
                <Text style={styles.sendText}>입력</Text>
              </TouchableOpacity>
            </View>
          );
        }
        return null; // inputBar에 아무것도 표시 안 함
      }

      // 가전청소 - 에어컨청소: 추가 요청사항 입력
      if (isApplianceCleaningService(draft.serviceType) && draft.serviceSubType === "에어컨청소") {
        return (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="없으면 비워두세요"
              placeholderTextColor={colors.subtext}
              style={styles.input}
              autoFocus
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                setDraft((d) => ({ ...d, applianceAdditionalRequests: inputValue.trim() || null }));
                pushUser(inputValue.trim() || "없음");
                pushSystem("요약을 확인해 주세요.");
                setInputValue("");
                setStep(10);
              }}
            >
              <Text style={styles.sendText}>입력</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return null;
    }

    // step 8: 베란다 개수 선택 (말풍선 버튼)
    if (step === 8) {
      if (editingCustomField === "verandaCount") {
        return (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="베란다 개수 입력"
              placeholderTextColor={colors.subtext}
              style={styles.input}
              autoFocus
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                setDraft((d) => ({ ...d, verandaCountCustom: inputValue }));
                pushUser(`베란다: ${inputValue}`);
                pushSystemWithButtons("추가 요청사항이 있나요?", [
                  { label: "곰팡이제거", onPress: () => handleRequestSelect("곰팡이제거") },
                  { label: "니코틴제거", onPress: () => handleRequestSelect("니코틴제거") },
                  { label: "새집증후군", onPress: () => handleRequestSelect("새집증후군") },
                  { label: "기타", onPress: () => handleRequestSelect("기타") },
                  { label: "없음", onPress: () => handleRequestSelect("없음") },
                ]);
                setInputValue("");
                setEditingCustomField(null);
                setStep(9);
              }}
            >
              <Text style={styles.sendText}>입력</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return null; // inputBar에 아무것도 표시 안 함
    }

    // step 9: 추가 요청사항
    if (step === 9) {
      // 기타 선택 후 입력 모드
      if (editingCustomField === "additionalRequests") {
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
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                setDraft((d) => ({ ...d, additionalRequestsCustom: inputValue }));
                pushUser(`기타: ${inputValue}`);
                pushSystem("요약을 확인해 주세요.");
                setInputValue("");
                setEditingCustomField(null);
                setStep(10);
              }}
            >
              <Text style={styles.sendText}>입력</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return null; // inputBar에 아무것도 표시 안 함
    }

    // step 10: 요약 및 제출
    if (step === 10) {
      return (
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>요청 요약</Text>
          <SummaryRow label="서비스" value={`${draft.serviceType} / ${draft.serviceSubType}`} />
          <SummaryRow label="주소" value={draft.addressDong ?? ""} />
          <SummaryRow label="날짜" value={formatDateLabel(draft.desiredDateMs)} />

          {isRegularCleaningService(draft.serviceType) && (
            <>
              <SummaryRow label="평수" value={`${draft.cleaningPyeong}평`} />
              <SummaryRow
                label="방"
                value={
                  draft.roomCount === "기타"
                    ? draft.roomCountCustom || ""
                    : `${draft.roomCount}개`
                }
              />
              <SummaryRow
                label="화장실"
                value={
                  draft.bathroomCount === "기타"
                    ? draft.bathroomCountCustom || ""
                    : `${draft.bathroomCount}개`
                }
              />
              <SummaryRow
                label="베란다"
                value={
                  draft.verandaCount === "기타"
                    ? draft.verandaCountCustom || ""
                    : `${draft.verandaCount}개`
                }
              />
              <SummaryRow
                label="추가 요청사항"
                value={
                  draft.additionalRequests
                    .map((r) => (r === "기타" ? draft.additionalRequestsCustom : r))
                    .join(", ") || "없음"
                }
              />
            </>
          )}

          {isApplianceCleaningService(draft.serviceType) && (
            <>
              {draft.serviceSubType === "에어컨청소" && (
                <>
                  <SummaryRow
                    label="에어컨 종류"
                    value={
                      draft.applianceTypeOption === "기타"
                        ? draft.applianceTypeOptionCustom || ""
                        : draft.applianceTypeOption || ""
                    }
                  />
                  <SummaryRow
                    label="청소 방식"
                    value={
                      draft.applianceCleaningType === "기타"
                        ? draft.applianceCleaningTypeCustom || ""
                        : draft.applianceCleaningType || ""
                    }
                  />
                </>
              )}
              {draft.serviceSubType === "냉장고청소" && (
                <SummaryRow
                  label="냉장고 종류"
                  value={
                    draft.applianceTypeOption === "기타"
                      ? draft.applianceTypeOptionCustom || ""
                      : draft.applianceTypeOption || ""
                  }
                />
              )}
              {draft.serviceSubType === "세탁기청소" && (
                <SummaryRow
                  label="세탁기 종류"
                  value={
                    draft.applianceTypeOption === "기타"
                      ? draft.applianceTypeOptionCustom || ""
                      : draft.applianceTypeOption || ""
                  }
                />
              )}
              {draft.serviceSubType === "실외기청소" && (
                <SummaryRow
                  label="실외기 종류"
                  value={
                    draft.applianceTypeOption === "기타"
                      ? draft.applianceTypeOptionCustom || ""
                      : draft.applianceTypeOption || ""
                  }
                />
              )}
              {draft.serviceSubType === "가전제품청소" && (
                <SummaryRow
                  label="가전제품"
                  value={draft.applianceType || ""}
                />
              )}
              <SummaryRow
                label="추가 요청사항"
                value={draft.applianceAdditionalRequests || "없음"}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, busy && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>{busy ? "제출 중..." : "요청 제출"}</Text>
          </TouchableOpacity>
        </Card>
      );
    }

    // 기타 서비스
    if (step >= 100) {
      return (
        <View style={styles.row}>
          <Text style={{ color: colors.subtext, textAlign: "center", padding: spacing.lg }}>
            이 서비스는 아직 준비 중입니다.
          </Text>
        </View>
      );
    }

    return null;
  }

  // Step 3(날짜 선택)는 사용자가 선택할 때까지 대기 - 자동 진행 없음

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
        scrollEventThrottle={16}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.role === "user" ? styles.rowUser : styles.rowSystem]}>
            <View style={bubbleStyle(item.role)}>
              <Text style={bubbleTextStyle(item.role)}>{item.text}</Text>
              {item.buttons && item.buttons.length > 0 && (
                <View style={styles.buttonsContainer}>
                  {item.buttons.map((btn) => (
                    <TouchableOpacity
                      key={btn.label}
                      style={styles.checkboxItem}
                      onPress={btn.onPress}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, btn.selected && styles.checkboxSelected]}>
                        {btn.selected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={styles.checkboxLabel}>{btn.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
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

  chat: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: 12,
    backgroundColor: colors.bg,
  },

  bubbleRow: {
    flexDirection: "row",
    marginVertical: 4,
  },
  rowSystem: {
    justifyContent: "flex-start",
    paddingRight: "18%",
  },
  rowUser: {
    justifyContent: "flex-end",
    paddingLeft: "18%",
  },

  bubble: {
    maxWidth: "82%",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  bubbleSystem: {
    backgroundColor: "#F5F5F5",
    borderColor: "#transparent",
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
  },
  bubbleText: { fontSize: 14, lineHeight: 20, letterSpacing: 0.3 },
  textSystem: { color: "#333333", fontWeight: "600" },
  textUser: { color: "#fff", fontWeight: "700" },

  buttonsContainer: {
    flexDirection: "column",
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkboxItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    marginVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(139, 69, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(139, 69, 255, 0.1)",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D0D0D0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  checkmark: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  checkboxLabel: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  bubbleButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bubbleButtonText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  inputBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 0,
    borderColor: "transparent",
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
  quickBtnSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  quickText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  quickTextSelected: { color: "#fff" },

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

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: 24,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E8E8E8",
    color: colors.text,
    fontWeight: "600",
    fontSize: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sendBtn: {
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  sendText: { color: "#fff", fontWeight: "800", fontSize: 14 },

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
    marginTop: spacing.lg,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.3 },
});
