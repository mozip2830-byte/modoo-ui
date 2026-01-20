import { db } from "@/src/firebase";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import type { RequestDoc } from "@/src/types/models";

type SubscribeOpenInput = {
  customerId: string;
  limit?: number;
  onData: (requests: RequestDoc[]) => void;
  onError?: (error: unknown) => void;
};

export function subscribeOpenRequestsForCustomer(input: SubscribeOpenInput) {
  if (!input.customerId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, "requests"),
    where("customerId", "==", input.customerId),
    where("status", "==", "open"),
    where("isClosed", "==", false),
    orderBy("createdAt", "desc"),
    ...(input.limit ? [limit(input.limit)] : [])
  );

  return onSnapshot(
    q,
    (snap) => {
      input.onData(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<RequestDoc, "id">),
        }))
      );
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}

// ========================================
// Create Request (chat-style wizard)
// ========================================
export type CreateRequestInput = {
  customerId: string;

  serviceType: "청소" | "이사" | "리모델링" | "인테리어" | "전기·설비";
  serviceSubType: string;

  // 주소 (도로명 고정 + 지번 참고)
  addressRoad: string;
  addressJibun?: string | null;
  addressDong: string;
  zonecode?: string | null;

  // 청소 전용
  cleaningPyeong?: number | null;
  roomCount?: number | null;
  bathroomCount?: number | null;
  verandaCount?: number | null;

  // 청소 외 임의 1개
  extraFieldKey?: string | null;
  extraFieldValue?: string | number | null;

  // 날짜/메모
  desiredDateMs?: number | null; // ms
  note?: string | null;
};

export async function createRequest(input: CreateRequestInput) {
  // 런타임 가드(필수)
  if (!input.customerId) throw new Error("customerId is required");
  if (!input.serviceType) throw new Error("serviceType is required");
  if (!input.serviceSubType) throw new Error("serviceSubType is required");
  if (!input.addressRoad) throw new Error("addressRoad is required");
  if (!input.addressDong) throw new Error("addressDong is required");

  const docRef = await addDoc(collection(db, "requests"), {
    customerId: input.customerId,

    serviceType: input.serviceType,
    serviceSubType: input.serviceSubType,

    addressRoad: input.addressRoad,
    addressJibun: input.addressJibun ?? null,
    addressDong: input.addressDong,
    zonecode: input.zonecode ?? null,

    cleaningPyeong: input.cleaningPyeong ?? null,
    roomCount: input.roomCount ?? null,
    bathroomCount: input.bathroomCount ?? null,
    verandaCount: input.verandaCount ?? null,

    extraFieldKey: input.extraFieldKey ?? null,
    extraFieldValue: input.extraFieldValue ?? null,

    desiredDateMs: input.desiredDateMs ?? null,
    note: input.note ?? "",

    status: "open",
    isClosed: false,
    quoteCount: 0,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}
