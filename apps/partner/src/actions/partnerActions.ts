import { db } from "@/src/firebase";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";

import type {
  PartnerDoc,
  PartnerPaymentDoc,
  PartnerPointLedgerDoc,
  QuoteDoc,
  RequestDoc,
} from "@/src/types/models";
import { calcBilling } from "@/src/lib/billingCalc";
import { createNotification } from "@/src/actions/notificationActions";
import { createOrUpdateQuoteTransaction } from "@/src/actions/quoteActions";

export function buildQuoteId(requestId: string, partnerId: string) {
  return partnerId;
}

type UpsertQuoteInput = {
  requestId: string;
  partnerId: string;
  price: number;
  memo?: string | null;
};

type SubscribeQuotesInput = {
  requestId: string;
  onData: (quotes: QuoteDoc[]) => void;
  onError?: (error: unknown) => void;
};

type SubscribeRequestInput = {
  requestId: string;
  onData: (request: RequestDoc | null) => void;
  onError?: (error: unknown) => void;
};

type SubscribeMyQuotesInput = {
  partnerId: string;
  onData: (quotes: QuoteDoc[]) => void;
  onError?: (error: unknown) => void;
};

type SubscribePaymentHistoryInput = {
  partnerId: string;
  onData: (items: PartnerPaymentDoc[]) => void;
  onError?: (error: unknown) => void;
};

type SubscribePointLedgerInput = {
  partnerId: string;
  onData: (items: PartnerPointLedgerDoc[]) => void;
  onError?: (error: unknown) => void;
};

type CreatePointOrderInput = {
  partnerId: string;
  amountSupplyKRW: number;
  provider?: "kakaopay" | "toss" | "card" | "bank" | "manual";
};

type QuoteSubmitInput = {
  requestId: string;
  partnerId: string;
  customerId: string;
  price: number;
  memo?: string | null;
};

type UpdateSubscriptionInput = {
  partnerId: string;
  autoRenew?: boolean;
  provider?: "kakaopay" | "toss" | "card" | "bank" | "manual";
};

type StartSubscriptionInput = {
  partnerId: string;
  plan: "trial_3d" | "trial_7d" | "month" | "month_auto";
  autoRenew: boolean;
  provider?: "kakaopay" | "toss" | "card" | "bank" | "manual";
};

export async function upsertQuote(input: UpsertQuoteInput): Promise<void> {
  if (!input.requestId) throw new Error("요청 ID가 없습니다.");
  if (!input.partnerId) throw new Error("업체 ID가 없습니다.");
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new Error("가격을 다시 확인해주세요.");
  }

  const quoteId = buildQuoteId(input.requestId, input.partnerId);
  const ref = doc(db, "requests", input.requestId, "quotes", quoteId);
  const snap = await getDoc(ref);

  const payload: Record<string, unknown> = {
    requestId: input.requestId,
    partnerId: input.partnerId,
    price: input.price,
    memo: input.memo ?? null,
    status: "submitted",
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(ref, payload, { merge: true });
}

export async function submitQuoteWithBilling(input: QuoteSubmitInput) {
  return createOrUpdateQuoteTransaction(input);
}

export async function getMyQuote(requestId: string, partnerId: string) {
  if (!requestId || !partnerId) return null;
  const quoteId = buildQuoteId(requestId, partnerId);
  const snap = await getDoc(doc(db, "requests", requestId, "quotes", quoteId));
  if (!snap.exists()) return null;
  return {
    id: snap.id,
    ...(snap.data() as Omit<QuoteDoc, "id">),
  };
}

export function subscribeQuotes(input: SubscribeQuotesInput) {
  if (!input.requestId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, "requests", input.requestId, "quotes"),
    orderBy("createdAt", "desc")
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

export function subscribeMyQuotes(input: SubscribeMyQuotesInput) {
  if (!input.partnerId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collectionGroup(db, "quotes"),
    where("partnerId", "==", input.partnerId),
    orderBy("createdAt", "desc")
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

export function subscribeRequest(input: SubscribeRequestInput) {
  if (!input.requestId) {
    input.onData(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, "requests", input.requestId),
    (snap) => {
      if (!snap.exists()) {
        input.onData(null);
        return;
      }
      input.onData({ id: snap.id, ...(snap.data() as Omit<RequestDoc, "id">) });
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}

export async function createPointOrderAndCredit(input: CreatePointOrderInput) {
  if (!input.partnerId) throw new Error("업체 ID가 없습니다.");
  const billing = calcBilling(input.amountSupplyKRW);
  const partnerRef = doc(db, "partners", input.partnerId);
  const orderRef = doc(collection(db, "partnerPointOrders", input.partnerId, "orders"));
  const ledgerRef = doc(collection(db, "partnerPointLedger", input.partnerId, "items"));
  const paymentRef = doc(collection(db, "partnerPayments", input.partnerId, "items"));

  await runTransaction(db, async (tx) => {
    const partnerSnap = await tx.get(partnerRef);
    const partner = partnerSnap.exists() ? (partnerSnap.data() as PartnerDoc) : null;
    const currentBalance = Number(partner?.points?.balance ?? 0);

    tx.set(orderRef, {
      provider: input.provider ?? "manual",
      amountSupplyKRW: billing.amountSupplyKRW,
      amountPayKRW: billing.amountPayKRW,
      vatRate: billing.vatRate,
      basePoints: billing.basePoints,
      bonusPoints: billing.bonusPoints,
      creditedPoints: billing.creditedPoints,
      status: "paid",
      createdAt: serverTimestamp(),
      paidAt: serverTimestamp(),
    });

    tx.set(paymentRef, {
      type: "charge",
      provider: input.provider ?? "manual",
      amountSupplyKRW: billing.amountSupplyKRW,
      amountPayKRW: billing.amountPayKRW,
      basePoints: billing.basePoints,
      bonusPoints: billing.bonusPoints,
      creditedPoints: billing.creditedPoints,
      status: "paid",
      createdAt: serverTimestamp(),
    });

    tx.set(ledgerRef, {
      type: "credit_charge",
      deltaPoints: billing.creditedPoints,
      balanceAfter: currentBalance + billing.creditedPoints,
      amountPayKRW: billing.amountPayKRW,
      orderId: orderRef.id,
      createdAt: serverTimestamp(),
    });

    tx.set(
      partnerRef,
      {
        points: {
          balance: currentBalance + billing.creditedPoints,
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  await createNotification({
    uid: input.partnerId,
    type: "points_charged",
    title: "포인트 충전 완료",
    body: `${billing.creditedPoints}p가 적립되었습니다.`,
    data: {
      amountPayKRW: billing.amountPayKRW,
      creditedPoints: billing.creditedPoints,
    },
  });

  return billing;
}

export function subscribePaymentHistory(input: SubscribePaymentHistoryInput) {
  if (!input.partnerId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, "partnerPayments", input.partnerId, "items"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      input.onData(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PartnerPaymentDoc, "id">),
        }))
      );
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}

export function subscribePointLedger(input: SubscribePointLedgerInput) {
  if (!input.partnerId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, "partnerPointLedger", input.partnerId, "items"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      input.onData(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PartnerPointLedgerDoc, "id">),
        }))
      );
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}

export async function startSubscription(input: StartSubscriptionInput) {
  if (!input.partnerId) throw new Error("업체 ID가 없습니다.");

  const now = new Date();
  const periodDays = input.plan === "trial_3d" ? 3 : input.plan === "trial_7d" ? 7 : 30;
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);
  const discountRate = input.plan === "month_auto" ? 0.15 : 0;
  const payAmountSupply = input.plan === "month_auto" ? 85000 : input.plan.startsWith("trial") ? 0 : 100000;
  const payAmount = calcBilling(payAmountSupply);
  const paymentRef = doc(collection(db, "partnerPayments", input.partnerId, "items"));

  await setDoc(
    doc(db, "partners", input.partnerId),
    {
      subscription: {
        status: "active",
        plan: input.plan,
        autoRenew: input.autoRenew,
        discountRate,
        currentPeriodStart: Timestamp.fromDate(now),
        currentPeriodEnd: Timestamp.fromDate(periodEnd),
        nextBillingAt: Timestamp.fromDate(periodEnd),
        provider: input.provider ?? "manual",
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(paymentRef, {
    type: "subscription",
    provider: input.provider ?? "manual",
    amountSupplyKRW: payAmount.amountSupplyKRW,
    amountPayKRW: payAmount.amountPayKRW,
    status: "paid",
    createdAt: serverTimestamp(),
  });

  await createNotification({
    uid: input.partnerId,
    type: "subscription_active",
    title: "구독이 활성화되었습니다",
    body: "무제한 견적 제안이 가능합니다.",
  });
}

export async function cancelSubscription(partnerId: string) {
  if (!partnerId) throw new Error("업체 ID가 없습니다.");

  await setDoc(
    doc(db, "partners", partnerId),
    {
      subscription: {
        status: "canceled",
        autoRenew: false,
        nextBillingAt: null,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await createNotification({
    uid: partnerId,
    type: "subscription_expired",
    title: "구독이 만료되었습니다",
    body: "포인트 충전 후 견적 제안이 가능합니다.",
  });
}

export async function updateSubscriptionSettings(input: UpdateSubscriptionInput) {
  if (!input.partnerId) throw new Error("업체 ID가 없습니다.");

  await setDoc(
    doc(db, "partners", input.partnerId),
    {
      subscription: {
        autoRenew: input.autoRenew,
        provider: input.provider,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
