import { db } from "@/src/firebase";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import type { RequestDoc } from "@/src/types/models";

type SubscribeOpenInput = {
  limit?: number;
  onData: (requests: RequestDoc[]) => void;
  onError?: (error: unknown) => void;
};

type SubscribeMyQuotedInput = {
  partnerId: string;
  onData: (requests: RequestDoc[]) => void;
  onError?: (error: unknown) => void;
};

export function subscribeOpenRequestsForPartner(input: SubscribeOpenInput) {
  const q = query(
    collection(db, "requests"),
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

export function subscribeMyQuotedRequestsForPartner(input: SubscribeMyQuotedInput) {
  if (!input.partnerId) {
    input.onData([]);
    return () => {};
  }

  const quotesQuery = query(
    collectionGroup(db, "quotes"),
    where("partnerId", "==", input.partnerId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    quotesQuery,
    async (snap) => {
      const requestIds = Array.from(new Set(snap.docs.map((docSnap) => docSnap.data().requestId)));
      const requests = await Promise.all(
        requestIds.map(async (requestId) => {
          const requestSnap = await getDoc(doc(db, "requests", requestId));
          if (!requestSnap.exists()) return null;
          return { id: requestSnap.id, ...(requestSnap.data() as Omit<RequestDoc, "id">) };
        })
      );

      const filtered = requests.filter((item): item is RequestDoc => Boolean(item));
      filtered.sort((a, b) => {
        const aMs = (a.createdAt as any)?.toMillis ? (a.createdAt as any).toMillis() : 0;
        const bMs = (b.createdAt as any)?.toMillis ? (b.createdAt as any).toMillis() : 0;
        return bMs - aMs;
      });
      input.onData(filtered);
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}
