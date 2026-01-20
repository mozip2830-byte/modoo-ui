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
  where,
} from "firebase/firestore";

import { createNotification } from "@/src/actions/notificationActions";
import { updateTrustOnResponse } from "@/src/actions/trustActions";
import type { PartnerUserDoc, QuoteDoc, RequestDoc } from "@/src/types/models";

type CreateOrUpdateQuoteInput = {
  requestId: string;
  partnerId: string;
  customerId: string;
  price: number;
  memo?: string | null;
};

type QuoteTransactionResult = {
  createdNew: boolean;
  chargedPoints: number; // UI/로그용(실제 차감은 서버에서)
  usedSubscription: boolean;
};

type SubscribeQuotesInput = {
  requestId: string;
  partnerId: string; // 필수: 파트너는 본인 quote만 조회 가능
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

  // ✅ SSOT: partnerUsers에서 구독/포인트 상태를 "읽기만" 한다.
  // (points/ledger/payment/request 업데이트는 서버(Admin)에서만 처리)
  const partnerUserRef = doc(db, "partnerUsers", input.partnerId);

  let createdNew = false;
  let chargedPoints = 0;
  let usedSubscription = false;

  await runTransaction(db, async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) throw new Error("요청을 찾을 수 없습니다.");
    const request = requestSnap.data() as RequestDoc;

    const quoteSnap = await tx.get(quoteRef);

    const partnerUserSnap = await tx.get(partnerUserRef);
    const partnerUser = partnerUserSnap.exists()
      ? (partnerUserSnap.data() as PartnerUserDoc)
      : null;

    const status = request.status ?? "open";
    const subscriptionActive = partnerUser?.subscriptionStatus === "active";
    const pointsBalance = Number(partnerUser?.points ?? 0);

    // ✅ request.isClosed / request.quoteCount는 클라에서 더 이상 신뢰하지 않음(A 방식).
    // 마감 강제는 서버에서 처리하는 것이 정석.
    // 임시로는 "요청이 open이 아니면 신규 제출 금지" 정도만 강하게 체크.
    if (!quoteSnap.exists()) {
      if (status !== "open") throw new Error("요청이 열려있지 않습니다.");

      // 정책: 구독 active면 포인트 무관하게 제출 가능
      // 비구독이면 최소 포인트 기준 체크만(차감은 서버에서)
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
      payload.createdAt = serverTimestamp();
      tx.set(quoteRef, payload, { merge: true });
      createdNew = true;

      // ✅ 제거됨(권한 에러/SSOT 혼란 원인):
      // - tx.update(requestRef, { quoteCount, isClosed, status })
      // - tx.update(partnerUserRef, { points... })
      // - tx.set(ledgerRef/paymentRef, ...)
      usedSubscription = subscriptionActive;
      chargedPoints = subscriptionActive ? 0 : 30; // UI/로그용(실제 차감은 서버)
    } else {
      tx.set(quoteRef, payload, { merge: true });
    }
  });

  // 알림 생성은 현재 rules에서 create를 열어둔 상태면 클라에서도 가능
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

  // 신뢰도 업데이트(서버 추천이지만 현재 유지)
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
  if (!input.requestId || !input.partnerId) {
    input.onData([]);
    return () => {};
  }

  // 파트너는 본인 quote만 조회 가능 (Firestore rules 최소권한 준수)
  const q = query(
    collection(db, "requests", input.requestId, "quotes"),
    where("partnerId", "==", input.partnerId),
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
