import { db } from "@/src/firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  collection,
} from "firebase/firestore";

import type { QuoteDoc } from "@/src/types/models";

export function buildQuoteId(requestId: string, partnerId: string) {
  return `${requestId}_${partnerId}`;
}

type SubmitQuoteInput = {
  partnerId: string;
  price: number;
  message?: string;
};

export async function submitQuote(requestId: string, input: SubmitQuoteInput) {
  return upsertQuote(requestId, input.partnerId, input.price, input.message ?? "");
}

export async function getMyQuote(requestId: string, partnerId: string) {
  if (!requestId || !partnerId) return null;
  const quoteId = buildQuoteId(requestId, partnerId);
  const snap = await getDoc(doc(db, "quotes", quoteId));
  if (!snap.exists()) return null;
  return {
    id: snap.id,
    ...(snap.data() as Omit<QuoteDoc, "id">),
  };
}

export async function upsertQuote(
  requestId: string,
  partnerId: string,
  price: number,
  message: string
) {
  if (!requestId) throw new Error("requestId is required");
  if (!partnerId) throw new Error("partnerId is required");
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("price is invalid");
  }

  const quoteId = buildQuoteId(requestId, partnerId);
  await setDoc(
    doc(db, "quotes", quoteId),
    {
      requestId,
      partnerId,
      price,
      message,
      status: "submitted",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return quoteId;
}

export function subscribeMyQuotes(
  partnerId: string,
  onChange: (quotes: QuoteDoc[]) => void,
  onError?: (error: unknown) => void
) {
  if (!partnerId) {
    onChange([]);
    return () => {};
  }

  const q = query(collection(db, "quotes"), where("partnerId", "==", partnerId));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<QuoteDoc, "id">),
        }))
      );
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}
