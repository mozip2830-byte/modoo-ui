import { db } from "@/src/firebase";
import {
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import type { QuoteDoc, RequestDoc, QuoteMessageData } from "@/src/types/models";

type CreateOrUpdateQuoteInput = {
  requestId: string;
  partnerId: string;
  customerId: string;
  price: number;
  memo?: string | null;
};

type SubscribeQuotesInput = {
  requestId: string;
  onData: (quotes: QuoteDoc[]) => void;
  onError?: (error: unknown) => void;
  order?: "asc" | "desc";
  limit?: number;
};

type SubscribeMyQuoteInput = {
  requestId: string;
  partnerId: string;
  onData: (quote: QuoteDoc | null) => void;
  onError?: (error: unknown) => void;
};

type SelectPartnerInput = {
  requestId: string;
  partnerId: string;
};

export async function createOrUpdateQuoteTransaction(input: CreateOrUpdateQuoteInput) {
  if (!input.requestId) throw new Error("요청 ID가 없습니다.");
  if (!input.partnerId) throw new Error("업체 ID가 없습니다.");
  if (!input.customerId) throw new Error("고객 ID가 없습니다.");
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new Error("가격을 다시 확인해주세요.");
  }

  const requestRef = doc(db, "requests", input.requestId);
  const quoteRef = doc(db, "requests", input.requestId, "quotes", input.partnerId);

  await runTransaction(db, async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) throw new Error("요청을 찾을 수 없습니다.");
    const request = requestSnap.data() as RequestDoc;
    const quoteSnap = await tx.get(quoteRef);
    const quoteCount = Number(request.quoteCount ?? 0);
    const status = request.status ?? "open";
    const closed = Boolean(request.isClosed) || quoteCount >= 10;

    if (!quoteSnap.exists()) {
      if (closed) throw new Error("견적이 마감되었습니다.");
      if (status !== "open") throw new Error("요청이 열려있지 않습니다.");
    } else if (status !== "open" && status !== "closed") {
      throw new Error("요청이 열려있지 않습니다.");
    }

    const payload: Record<string, unknown> = {
      requestId: input.requestId,
      partnerId: input.partnerId,
      customerId: input.customerId,
      price: input.price,
      memo: input.memo ?? null,
      status: quoteSnap.exists()
        ? (quoteSnap.data() as QuoteDoc).status ?? "submitted"
        : "submitted",
      updatedAt: serverTimestamp(),
    };

    if (!quoteSnap.exists()) {
      const nextCount = quoteCount + 1;
      payload.createdAt = serverTimestamp();
      tx.set(quoteRef, payload, { merge: true });
      const hitLimit = nextCount >= 10;
      tx.update(requestRef, {
        quoteCount: nextCount,
        isClosed: hitLimit ? true : Boolean(request.isClosed),
        status: hitLimit ? "closed" : status,
      });
    } else {
      tx.set(quoteRef, payload, { merge: true });
    }
  });
}

export function subscribeQuotesForRequest(input: SubscribeQuotesInput) {
  if (!input.requestId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, "requests", input.requestId, "quotes"),
    orderBy("createdAt", input.order ?? "desc"),
    ...(input.limit ? [limit(input.limit)] : [])
  );

  return onSnapshot(
    q,
    (snap) => {
      input.onData(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<QuoteDoc, "id">),
        }))
      );
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}

export function subscribeMyQuote(input: SubscribeMyQuoteInput) {
  if (!input.requestId || !input.partnerId) {
    input.onData(null);
    return () => {};
  }

  const ref = doc(db, "requests", input.requestId, "quotes", input.partnerId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        input.onData(null);
        return;
      }
      input.onData({ id: snap.id, ...(snap.data() as Omit<QuoteDoc, "id">) });
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}

export async function selectPartnerTransaction(input: SelectPartnerInput) {
  if (!input.requestId) throw new Error("요청 ID가 없습니다.");
  if (!input.partnerId) throw new Error("업체 ID가 없습니다.");

  const requestRef = doc(db, "requests", input.requestId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists()) throw new Error("요청을 찾을 수 없습니다.");
    tx.update(requestRef, { selectedPartnerId: input.partnerId });
  });
}

/**
 * ✅ 고객: 채팅에서 견적 확정
 * - QuoteDoc.status를 "accepted"로 변경
 * - ChatDoc.acceptedQuoteId 설정
 */
export async function acceptQuoteInChat(
  requestId: string,
  quoteId: string,
  chatId: string
) {
  if (!requestId) throw new Error("요청 ID가 없습니다.");
  if (!quoteId) throw new Error("견적 ID가 없습니다.");
  if (!chatId) throw new Error("채팅 ID가 없습니다.");

  await updateDoc(
    doc(db, "requests", requestId, "quotes", quoteId),
    { status: "accepted", updatedAt: serverTimestamp() }
  );

  await updateDoc(doc(db, "chats", chatId), {
    acceptedQuoteId: quoteId,
  });
}

/**
 * ✅ 고객: 견적서 저장
 * - 고객이 견적서를 북마크 형식으로 저장
 * - customerUsers 문서의 savedQuotes 배열에 추가
 */
export async function saveQuoteForCustomer(
  customerId: string,
  requestId: string,
  quoteData: QuoteMessageData
) {
  if (!customerId) throw new Error("고객 ID가 없습니다.");
  if (!requestId) throw new Error("요청 ID가 없습니다.");

  const customerRef = doc(db, "customerUsers", customerId);
  const savedQuote = {
    requestId,
    quoteData,
    savedAt: serverTimestamp(),
  };

  await updateDoc(customerRef, {
    savedQuotes: arrayUnion(savedQuote),
  });
}

/**
 * ✅ 고객: 결제 완료
 * - ChatDoc.paymentStatus를 "completed"로 변경
 * - ChatDoc.paymentCompletedAt 설정
 * (추후 PG 연동 시 결제 로직 추가 가능)
 */
export async function completePayment(chatId: string) {
  if (!chatId) throw new Error("채팅 ID가 없습니다.");

  await updateDoc(doc(db, "chats", chatId), {
    paymentStatus: "completed",
    paymentCompletedAt: serverTimestamp(),
  });
}
