import { db } from "@/src/firebase";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import type { PartnerDoc, QuoteDoc, RequestDoc } from "@/src/types/models";
import { createNotification } from "@/src/actions/notificationActions";
import { updateTrustOnResponse } from "@/src/actions/trustActions";

type CreateOrUpdateQuoteInput = {
  requestId: string;
  partnerId: string;
  customerId: string;
  price: number;
  memo?: string | null;
};

type QuoteTransactionResult = {
  createdNew: boolean;
  chargedPoints: number;
  usedSubscription: boolean;
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

export async function createOrUpdateQuoteTransaction(
  input: CreateOrUpdateQuoteInput
): Promise<QuoteTransactionResult> {
  if (!input.requestId) throw new Error("요청 ID가 없습니다.");
  if (!input.partnerId) throw new Error("업체 ID가 없습니다.");
  if (!input.customerId) throw new Error("고객 ID가 없습니다.");
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new Error("가격을 다시 확인해주세요.");
  }

  const requestRef = doc(db, "requests", input.requestId);
  const quoteRef = doc(db, "requests", input.requestId, "quotes", input.partnerId);
  const partnerRef = doc(db, "partners", input.partnerId);
  const ledgerRef = doc(collection(db, "partnerPointLedger", input.partnerId, "items"));
  const paymentRef = doc(collection(db, "partnerPayments", input.partnerId, "items"));
  let createdNew = false;
  let chargedPoints = 0;
  let usedSubscription = false;

  await runTransaction(db, async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) throw new Error("요청을 찾을 수 없습니다.");
    const request = requestSnap.data() as RequestDoc;
    const quoteSnap = await tx.get(quoteRef);
    const partnerSnap = await tx.get(partnerRef);
    const partner = partnerSnap.exists() ? (partnerSnap.data() as PartnerDoc) : null;
    const quoteCount = Number(request.quoteCount ?? 0);
    const status = request.status ?? "open";
    const closed = Boolean(request.isClosed) || quoteCount >= 10;
    const subscriptionActive = partner?.subscription?.status === "active";
    const pointsBalance = Number(partner?.points?.balance ?? 0);

    if (!quoteSnap.exists()) {
      if (closed) throw new Error("견적이 마감되었습니다.");
      if (status !== "open") throw new Error("요청이 열려있지 않습니다.");
      if (!subscriptionActive && pointsBalance < 30) {
        throw new Error("NEED_POINTS");
      }
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
      createdNew = true;
      const hitLimit = nextCount >= 10;
      tx.update(requestRef, {
        quoteCount: nextCount,
        isClosed: hitLimit ? true : Boolean(request.isClosed),
        status: hitLimit ? "closed" : status,
      });

      if (!subscriptionActive) {
        chargedPoints = 30;
        usedSubscription = false;
        tx.update(partnerRef, {
          "points.balance": pointsBalance - chargedPoints,
          "points.updatedAt": serverTimestamp(),
        });
        tx.set(ledgerRef, {
          type: "debit_quote",
          deltaPoints: -chargedPoints,
          balanceAfter: pointsBalance - chargedPoints,
          requestId: input.requestId,
          createdAt: serverTimestamp(),
        });
        tx.set(paymentRef, {
          type: "debit",
          provider: "manual",
          amountSupplyKRW: 0,
          amountPayKRW: 0,
          status: "paid",
          createdAt: serverTimestamp(),
        });
      } else {
        usedSubscription = true;
      }
    } else {
      tx.set(quoteRef, payload, { merge: true });
    }
  });

  if (createdNew) {
    await createNotification({
      uid: input.customerId,
      type: "quote_received",
      title: "견적이 도착했어요",
      body: "새 견적 1건이 도착했습니다. 지금 확인해보세요.",
      data: {
        requestId: input.requestId,
        quoteId: input.partnerId,
        partnerId: input.partnerId,
      },
    });
  }

  if (createdNew) {
    try {
      const requestSnap = await getDoc(doc(db, "requests", input.requestId));
      const createdAt = requestSnap.exists()
        ? (requestSnap.data() as RequestDoc).createdAt
        : null;
      const createdAtMs =
        createdAt && (createdAt as any).toMillis ? (createdAt as any).toMillis() : Date.now();
      const diffMinutes = Math.max(1, Math.round((Date.now() - createdAtMs) / 60000));
      await updateTrustOnResponse(input.partnerId, diffMinutes);
    } catch (error) {
      console.warn("[partner][trust] response update error", error);
    }
  }

  return { createdNew, chargedPoints, usedSubscription };
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
