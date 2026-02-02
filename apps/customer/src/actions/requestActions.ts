import { db } from "@/src/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import type { RequestDoc } from "@/src/types/models";

type CreateRequestInput = {
  customerId: string;
  targetPartnerId?: string | null;
  serviceType: string;
  serviceSubType: string;
  addressRoad: string;
  addressJibun?: string | null;
  addressDong: string;
  zonecode?: string | null;
  cleaningPyeong?: number | null;
  roomCount?: number | null;
  bathroomCount?: number | null;
  verandaCount?: number | null;
  extraFieldKey?: string | null;
  extraFieldValue?: string | number | null;
  desiredDateMs?: number | null;
  note?: string | null;
};

export async function createRequest(input: CreateRequestInput) {
  let customerName: string | null = null;
  let customerPhotoUrl: string | null = null;

  try {
    const customerSnap = await getDoc(doc(db, "customerUsers", input.customerId));
    if (customerSnap.exists()) {
      const customerData = customerSnap.data() as {
        nickname?: string;
        name?: string;
        email?: string;
        photoUrl?: string | null;
      };
      customerName =
        customerData.nickname?.trim() ||
        customerData.name?.trim() ||
        customerData.email?.trim() ||
        null;
      customerPhotoUrl = customerData.photoUrl ?? null;
    }
  } catch (error) {
    console.warn("[createRequest] customer profile load error", error);
  }

  const payload = {
    customerId: input.customerId,
    targetPartnerId: input.targetPartnerId ?? null,
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
    note: input.note ?? null,
    customerName,
    customerPhotoUrl,
    status: "open" as const,
    quoteCount: 0,
    isClosed: false,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "requests"), payload);
  return docRef.id;
}

type SubscribeOpenInput = {
  customerId: string;
  limit?: number;
  onData: (requests: RequestDoc[]) => void;
  onError?: (error: unknown) => void;
};

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function isExpiredRequest(createdAt: unknown) {
  const ts = createdAt as { toMillis?: () => number } | null;
  const ms = ts?.toMillis ? ts.toMillis() : null;
  if (!ms) return false;
  return Date.now() - ms >= FIVE_DAYS_MS;
}

async function closeExpiredRequest(requestId: string) {
  try {
    await updateDoc(doc(db, "requests", requestId), {
      isClosed: true,
      closedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("[requests] auto-close failed", { requestId, error });
  }
}

export function subscribeOpenRequestsForCustomer(input: SubscribeOpenInput) {
  if (!input.customerId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, "requests"),
    where("customerId", "==", input.customerId),
    where("status", "==", "open"),
    orderBy("createdAt", "desc"),
    ...(input.limit ? [limit(input.limit)] : [])
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<RequestDoc, "id">),
      }));

      const active: RequestDoc[] = [];
      rows.forEach((row) => {
        // isClosed 필터링은 클라이언트에서 처리
        if (row.isClosed) return;

        if (isExpiredRequest(row.createdAt)) {
          void closeExpiredRequest(row.id);
        } else {
          active.push(row);
        }
      });

      input.onData(active);
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}

let lastDocCountPerUid: Record<string, number> = {};

export function subscribeMyRequests(
  uid: string,
  onData: (requests: RequestDoc[]) => void,
  onError?: (error: unknown) => void
) {
  if (!uid) {
    onData([]);
    return () => {};
  }

  const q = query(
    collection(db, "requests"),
    where("customerId", "==", uid),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      // 데이터 개수가 변경될 때만 로그 출력
      if (lastDocCountPerUid[uid] !== snap.size) {
        lastDocCountPerUid[uid] = snap.size;
        console.log(`[subscribeMyRequests] snapshot: ${snap.size} docs`);
      }

      const rows = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<RequestDoc, "id">),
      }));

      rows.forEach((row) => {
        if (row.status === "open" && !row.isClosed && isExpiredRequest(row.createdAt)) {
          void closeExpiredRequest(row.id);
        }
      });

      onData(rows);
    },
    (error) => {
      // 🚨 중요: 인덱스 누락 시 여기에 에러와 생성 링크가 출력됩니다. (터미널 확인 필수)
      console.error("[subscribeMyRequests] Firestore Error:", error);
      if (onError) onError(error);
    }
  );
}
