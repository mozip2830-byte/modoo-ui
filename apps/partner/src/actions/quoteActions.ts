﻿import { db } from "@/src/firebase";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where
} from "firebase/firestore";

import { createNotification } from "@/src/actions/notificationActions";
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
  chargedTickets: number;
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

  // ✅ SSOT: partnerUsers에서 구독/입찰권 상태를 "읽기만" 한다.
  // (입찰권/ledger/payment/request 업데이트는 서버(Admin)에서만 처리)
  const partnerUserRef = doc(db, "partnerUsers", input.partnerId);

  let createdNew = false;
  let chargedTickets = 0;
  let usedSubscription = false;

  await runTransaction(db, async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) throw new Error("요청을 찾을 수 없습니다.");
    const request = requestSnap.data() as RequestDoc;
    const targetPartnerId = request.targetPartnerId ?? null;

    const quoteSnap = await tx.get(quoteRef);

    if (targetPartnerId && targetPartnerId !== input.partnerId) {
      throw new Error("지정된 파트너만 견적을 보낼 수 있습니다.");
    }

    const partnerUserSnap = await tx.get(partnerUserRef);
    const partnerUser = partnerUserSnap.exists()
      ? (partnerUserSnap.data() as PartnerUserDoc)
      : null;

    const status = request.status ?? "open";
    const subscriptionActive = partnerUser?.subscriptionStatus === "active";
    const legacyPoints = Number(partnerUser?.points ?? 0);
    
    // 🐛 BUG FIX 3: 동시성 제어를 위해 request 문서의 quoteCount를 신뢰하고 트랜잭션 내에서 관리해야 함.
    const currentQuoteCount = request.quoteCount ?? 0;

    const hasBidTickets = Boolean(partnerUser?.bidTickets);
    const generalTickets = Number(partnerUser?.bidTickets?.general ?? legacyPoints);
    const serviceTickets = Number(partnerUser?.bidTickets?.service ?? partnerUser?.serviceTickets ?? 0);

    // ✅ request.isClosed / request.quoteCount는 클라에서 더 이상 신뢰하지 않음(A 방식).
    // 마감 강제는 서버에서 처리하는 것이 정석.
    // 임시로는 "요청이 open이 아니면 신규 제출 금지" 정도만 강하게 체크.
    if (!quoteSnap.exists()) {
      // ✅ FIX: status가 'selected' 등으로 변경되어도 isClosed가 false면 견적 제출 가능해야 함
      if (request.isClosed) throw new Error("요청이 마감되었습니다.");

      // 10건 마감 체크 (트랜잭션 내에서 수행하여 11번째 제출 방지)
      if (currentQuoteCount >= 10) {
        throw new Error("견적이 마감되었습니다.");
      }

      // 정책: 구독 active면 입찰권 무관하게 제출 가능
      // 비구독이면 일반/서비스 입찰권 중 1장 필요
      if (!subscriptionActive && generalTickets + serviceTickets < 1) {
        throw new Error("NEED_TICKETS");
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
      const nextCount = currentQuoteCount + 1;
      payload.createdAt = serverTimestamp();
      tx.set(quoteRef, payload, { merge: true });
      createdNew = true;

      usedSubscription = subscriptionActive;

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

  // Ticket logs are handled by server-side billing jobs.

  return { createdNew, chargedTickets, usedSubscription };
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
