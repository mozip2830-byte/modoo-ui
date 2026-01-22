import { db } from "@/src/firebase";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
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

export function subscribeMyRequests(
  uid: string,
  onData: (requests: RequestDoc[]) => void,
  onError?: (error: unknown) => void
) {
  console.log("[subscribeMyRequests] init for uid:", uid);
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
      console.log(`[subscribeMyRequests] success. docs found: ${snap.size}`);
      onData(
        snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<RequestDoc, "id">),
        }))
      );
    },
    (error) => {
      // 🚨 중요: 인덱스 누락 시 여기에 에러와 생성 링크가 출력됩니다. (터미널 확인 필수)
      console.error("[subscribeMyRequests] Firestore Error:", error);
      if (onError) onError(error);
    }
  );
}
