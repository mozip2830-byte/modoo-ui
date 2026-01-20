import { db } from "@/src/firebase";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import type { RequestDoc } from "@/src/types/models";

export type SubscribeOpenRequestsForCustomerInput = {
  customerId: string;
  limit?: number;
  onData: (requests: RequestDoc[]) => void;
  onError?: (error: unknown) => void;
};

function logRequestError(stage: string, err: unknown) {
  if (err && typeof err === "object" && "code" in err) {
    const fbErr = err as { code: string; message: string };
    console.error(`[requestActions] ${stage} FirebaseError`, {
      code: fbErr.code,
      message: fbErr.message,
    });
  } else {
    console.error(`[requestActions] ${stage} error`, err);
  }
}

export function subscribeOpenRequestsForCustomer(
  input: SubscribeOpenRequestsForCustomerInput
) {
  if (!input.customerId) {
    input.onData([]);
    return () => {};
  }

  const requestQuery = query(
    collection(db, "requests"),
    where("customerId", "==", input.customerId),
    orderBy("createdAt", "desc"),
    limit(input.limit ?? 30)
  );

  const quoteUnsubs = new Map<string, () => void>();
  const requestMap = new Map<string, RequestDoc>();
  const quoteCounts = new Map<string, number>();

  const emit = () => {
    const requestsWithQuotes = Array.from(requestMap.values())
      .map((request) => {
        const count = quoteCounts.get(request.id) ?? 0;
        return { ...request, quoteCount: count };
      });
    input.onData(requestsWithQuotes);
  };

  const cleanupQuotes = (idsToRemove: string[]) => {
    idsToRemove.forEach((id) => {
      const unsub = quoteUnsubs.get(id);
      if (unsub) unsub();
      quoteUnsubs.delete(id);
      quoteCounts.delete(id);
    });
  };

  const requestsUnsub = onSnapshot(
    requestQuery,
    (snap) => {
      const nextIds = new Set<string>();
      const nextMap = new Map<string, RequestDoc>();

      snap.docs.forEach((docSnap) => {
        const request = {
          id: docSnap.id,
          ...(docSnap.data() as Omit<RequestDoc, "id">),
        };
        nextIds.add(docSnap.id);
        nextMap.set(docSnap.id, request);
      });

      console.log("[quotes] requests count=", nextIds.size);

      const removed = Array.from(requestMap.keys()).filter((id) => !nextIds.has(id));
      cleanupQuotes(removed);

      requestMap.clear();
      nextMap.forEach((value, key) => requestMap.set(key, value));

      nextIds.forEach((requestId) => {
        if (quoteUnsubs.has(requestId)) return;

        const request = nextMap.get(requestId);
        if (typeof request?.quoteCount === "number" && request.quoteCount > 0) {
          quoteCounts.set(requestId, request.quoteCount);
          return;
        }

        const quoteQuery = collection(db, "requests", requestId, "quotes");

        const unsub = onSnapshot(
          quoteQuery,
          (quoteSnap) => {
            quoteCounts.set(requestId, quoteSnap.size);
            emit();
          },
          (error) => {
            logRequestError("subscribeOpenRequestsForCustomer:quotes", error);
            if (input.onError) input.onError(error);
          }
        );

        quoteUnsubs.set(requestId, unsub);
      });

      emit();
    },
    (error) => {
      logRequestError("subscribeOpenRequestsForCustomer:requests", error);
      if (input.onError) input.onError(error);
    }
  );

  return () => {
    requestsUnsub();
    cleanupQuotes(Array.from(quoteUnsubs.keys()));
  };
}

type FetchRequestsWithQuotesInput = {
  customerId: string;
  limit?: number;
};

export async function fetchRequestsWithQuotesForCustomer(
  input: FetchRequestsWithQuotesInput
) {
  if (!input.customerId) return [];

  const baseQuery = query(
    collection(db, "requests"),
    where("customerId", "==", input.customerId),
    orderBy("createdAt", "desc"),
    ...(input.limit ? [limit(input.limit)] : [])
  );

  const snap = await getDocs(baseQuery);
  const requests = snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<RequestDoc, "id">),
  }));

  const hasQuotes = await Promise.all(
    requests.map(async (request) => {
      const quoteCount = Number(request.quoteCount ?? 0);
      if (quoteCount > 0) return true;

      const quotesSnap = await getDocs(
        query(collection(db, "requests", request.id, "quotes"), limit(1))
      );

      return !quotesSnap.empty;
    })
  );

  return requests.filter((_, index) => hasQuotes[index]);
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
