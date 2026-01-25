import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@/src/firebase";
import { createOrUpdateQuoteTransaction } from "@/src/actions/quoteActions";
import type { PartnerAdBidDoc, PartnerPaymentDoc, PartnerPointLedgerDoc } from "@/src/types/models";

export const submitQuoteWithBilling = createOrUpdateQuoteTransaction;

type ChargeProvider = "kakaopay" | "card" | "bank" | "toss";

type BidTicketChargeInput = {
  partnerId: string;
  amountSupplyKRW: number;
  amountPayKRW: number;
  creditedPoints: number;
  provider: ChargeProvider;
};

type CashPointChargeInput = {
  partnerId: string;
  displayAmountKRW: number;
  amountSupplyKRW: number;
  amountPayKRW: number;
  pointType?: "general" | "service";
  provider: ChargeProvider;
};

type TicketPointsPurchaseInput = {
  partnerId: string;
  amountPayKRW: number;
  creditedPoints: number;
};

type StartSubscriptionInput = {
  partnerId: string;
  plan: "month" | "month_auto";
  autoRenew: boolean;
  provider: ChargeProvider;
};

export async function createBidTicketOrderAndCredit(input: BidTicketChargeInput) {
  const callable = httpsCallable(functions, "createPartnerCharge");
  const result = await callable({
    ...input,
    type: "bidTickets",
  });
  return result.data;
}

export async function createCashPointOrderAndCredit(input: CashPointChargeInput) {
  const callable = httpsCallable(functions, "createPartnerCharge");
  const pointType = input.pointType ?? "general";
  const result = await callable({
    ...input,
    type: pointType === "service" ? "cashPointsService" : "cashPoints",
  });
  return result.data;
}

export async function createBidTicketOrderWithPoints(input: TicketPointsPurchaseInput) {
  const callable = httpsCallable(functions, "createBidTicketOrderWithPoints");
  const result = await callable(input);
  return result.data;
}

export async function startSubscription(input: StartSubscriptionInput) {
  const callable = httpsCallable(functions, "startPartnerSubscription");
  const result = await callable(input);
  return result.data;
}

export async function cancelSubscription(partnerId: string) {
  const callable = httpsCallable(functions, "cancelPartnerSubscription");
  const result = await callable({ partnerId });
  return result.data;
}

type SubscribePaymentHistoryInput = {
  partnerId: string;
  onData: (items: PartnerPaymentDoc[]) => void;
  onError?: (error: unknown) => void;
};

export function subscribePaymentHistory(input: SubscribePaymentHistoryInput) {
  if (!input.partnerId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, `partnerPointOrders/${input.partnerId}/orders`),
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
      input.onError?.(error);
    }
  );
}

type SubscribePointLedgerInput = {
  partnerId: string;
  onData: (items: PartnerPointLedgerDoc[]) => void;
  onError?: (error: unknown) => void;
};

export function subscribePointLedger(input: SubscribePointLedgerInput) {
  if (!input.partnerId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, `partnerPointLedger/${input.partnerId}/items`),
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
      input.onError?.(error);
    }
  );
}

type SubscribeAdBidHistoryInput = {
  partnerId: string;
  onData: (items: PartnerAdBidDoc[]) => void;
  onError?: (error: unknown) => void;
};

export function subscribeAdBidHistory(input: SubscribeAdBidHistoryInput) {
  if (!input.partnerId) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, "partnerAdBids"),
    where("partnerId", "==", input.partnerId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      input.onData(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PartnerAdBidDoc, "id">),
        }))
      );
    },
    (error) => {
      input.onError?.(error);
    }
  );
}

type CreateAdBidInput = {
  partnerId: string;
  category: string;
  region: string;
  regionDetail?: string | null;
  amount: number;
};

export async function createPartnerAdBid(input: CreateAdBidInput) {
  const callable = httpsCallable(functions, "createPartnerAdBid");
  const result = await callable(input);
  return result.data;
}
