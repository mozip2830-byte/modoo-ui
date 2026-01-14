import { db } from "@/src/firebase";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";

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
