import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type ChargeProvider = "kakaopay" | "card" | "bank" | "toss";

type PartnerChargeInput = {
  partnerId?: string;
  type?: "bidTickets" | "cashPoints" | "cashPointsService";
  displayAmountKRW?: number;
  amountSupplyKRW?: number;
  amountPayKRW?: number;
  creditedPoints?: number;
  provider?: ChargeProvider;
};

type StartSubscriptionInput = {
  partnerId?: string;
  plan?: "month" | "month_auto";
  autoRenew?: boolean;
  provider?: ChargeProvider;
};

type TicketPointsPurchaseInput = {
  partnerId?: string;
  amountPayKRW?: number;
  creditedPoints?: number;
};

function requireAuth(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  return context.auth.uid;
}

function toNumber(value: unknown) {
  return Math.max(0, Math.floor(Number(value || 0)));
}

export const createPartnerCharge = functions.https.onCall(async (data: PartnerChargeInput, context) => {
  const uid = requireAuth(context);
  const partnerId = data.partnerId ?? uid;
  if (partnerId !== uid) {
    throw new functions.https.HttpsError("permission-denied", "요청 권한이 없습니다.");
  }

  const chargeType = data.type;
  if (chargeType !== "bidTickets" && chargeType !== "cashPoints" && chargeType !== "cashPointsService") {
    throw new functions.https.HttpsError("invalid-argument", "요청 타입이 올바르지 않습니다.");
  }

  const displayAmountKRW = toNumber(data.displayAmountKRW);
  const amountSupplyKRW = toNumber(data.amountSupplyKRW);
  const amountPayKRW = toNumber(data.amountPayKRW);
  const creditedPoints =
    chargeType === "cashPoints" || chargeType === "cashPointsService" ? displayAmountKRW : toNumber(data.creditedPoints);
  const provider = data.provider ?? "kakaopay";

  if (amountSupplyKRW <= 0 || amountPayKRW <= 0 || creditedPoints <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "결제 정보가 올바르지 않습니다.");
  }

  const userRef = db.doc(`partnerUsers/${partnerId}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError("not-found", "파트너 정보를 찾을 수 없습니다.");
  }

  const user = userSnap.data() ?? {};
  const prevCashPoints = toNumber(user.cashPoints);
  const prevCashPointsService = toNumber(user.cashPointsService);
  const prevGeneral = toNumber(user.points);
  const prevBidTickets = toNumber(user.bidTickets?.general ?? prevGeneral);
  const prevServiceTickets = toNumber(user.bidTickets?.service ?? user.serviceTickets);

  const nextCashPoints = chargeType === "cashPoints" ? prevCashPoints + creditedPoints : prevCashPoints;
  const nextCashPointsService =
    chargeType === "cashPointsService" ? prevCashPointsService + creditedPoints : prevCashPointsService;
  const nextBidTickets = chargeType === "bidTickets" ? prevBidTickets + creditedPoints : prevBidTickets;

  const orderRef = db.collection(`partnerPointOrders/${partnerId}/orders`).doc();
  const ledgerRef = db.collection(`partnerPointLedger/${partnerId}/items`).doc();

  const batch = db.batch();
  batch.set(orderRef, {
    partnerId,
    type: chargeType,
    provider,
    displayAmountKRW: chargeType === "cashPoints" || chargeType === "cashPointsService" ? displayAmountKRW : null,
    amountSupplyKRW,
    amountPayKRW,
    creditedPoints,
    status: "paid",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(ledgerRef, {
    partnerId,
    type: chargeType === "cashPoints" ? "credit_charge_cash" : chargeType === "cashPointsService" ? "credit_charge_cash_service" : "credit_charge",
    deltaPoints: creditedPoints,
    balanceAfter: chargeType === "cashPoints" ? nextCashPoints : chargeType === "cashPointsService" ? nextCashPointsService : nextBidTickets,
    amountPayKRW,
    orderId: orderRef.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (chargeType === "cashPoints") {
    batch.update(userRef, {
      cashPoints: nextCashPoints,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else if (chargeType === "cashPointsService") {
    batch.update(userRef, {
      cashPointsService: nextCashPointsService,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    batch.update(userRef, {
      points: nextBidTickets,
      bidTickets: {
        general: nextBidTickets,
        service: prevServiceTickets,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("partnerTicketLogs").add({
      partnerId,
      ticketType: "general",
      type: "charge",
      amount: creditedPoints,
      beforeBalance: prevBidTickets,
      afterBalance: nextBidTickets,
      delta: creditedPoints,
      reason: "billing",
      source: "partner",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return { orderId: orderRef.id, creditedPoints };
});

export const createBidTicketOrderWithPoints = functions.https.onCall(
  async (data: TicketPointsPurchaseInput, context) => {
    const uid = requireAuth(context);
    const partnerId = data.partnerId ?? uid;
    if (partnerId !== uid) {
      throw new functions.https.HttpsError("permission-denied", "요청 권한이 없습니다.");
    }

    const amountPayKRW = toNumber(data.amountPayKRW);
    const creditedPoints = toNumber(data.creditedPoints);
    if (amountPayKRW <= 0 || creditedPoints <= 0) {
      throw new functions.https.HttpsError("invalid-argument", "결제 정보가 올바르지 않습니다.");
    }

    const userRef = db.doc(`partnerUsers/${partnerId}`);
    const orderRef = db.collection(`partnerPointOrders/${partnerId}/orders`).doc();
    const ledgerRef = db.collection(`partnerPointLedger/${partnerId}/items`).doc();

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new functions.https.HttpsError("not-found", "파트너 정보를 찾을 수 없습니다.");
      }
      const user = userSnap.data() ?? {};
      const prevCashPoints = toNumber(user.cashPoints);
      const prevCashPointsService = toNumber(user.cashPointsService);
      const prevGeneral = toNumber(user.points);
      const prevBidTickets = toNumber(user.bidTickets?.general ?? prevGeneral);
      const prevServiceTickets = toNumber(user.bidTickets?.service ?? user.serviceTickets);

      const totalCash = prevCashPoints + prevCashPointsService;
      if (totalCash < amountPayKRW) {
        throw new functions.https.HttpsError("failed-precondition", "포인트가 부족합니다.");
      }

      const spendFromGeneral = Math.min(prevCashPoints, amountPayKRW);
      const spendFromService = amountPayKRW - spendFromGeneral;
      const nextCashPoints = prevCashPoints - spendFromGeneral;
      const nextCashPointsService = prevCashPointsService - spendFromService;
      const nextBidTickets = prevBidTickets + creditedPoints;

      tx.update(userRef, {
        cashPoints: nextCashPoints,
        cashPointsService: nextCashPointsService,
        points: nextBidTickets,
        bidTickets: {
          general: nextBidTickets,
          service: prevServiceTickets,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(orderRef, {
        partnerId,
        type: "bidTickets_points",
        provider: "cash_points",
        amountSupplyKRW: amountPayKRW,
        amountPayKRW,
        creditedPoints,
        status: "paid",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(ledgerRef, {
        partnerId,
        type: "debit_ticket_points",
        deltaPoints: -amountPayKRW,
        balanceAfter: nextCashPoints + nextCashPointsService,
        amountPayKRW,
        orderId: orderRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(db.collection("partnerTicketLogs").doc(), {
        partnerId,
        ticketType: "general",
        type: "charge",
        amount: creditedPoints,
        beforeBalance: prevBidTickets,
        afterBalance: nextBidTickets,
        delta: creditedPoints,
        reason: "points_payment",
        source: "partner",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { orderId: orderRef.id, creditedPoints };
  }
);

export const startPartnerSubscription = functions.https.onCall(
  async (data: StartSubscriptionInput, context) => {
    const uid = requireAuth(context);
    const partnerId = data.partnerId ?? uid;
    if (partnerId !== uid) {
      throw new functions.https.HttpsError("permission-denied", "요청 권한이 없습니다.");
    }

    const plan = data.plan ?? "month";
    const autoRenew = Boolean(data.autoRenew);
    const provider = data.provider ?? "kakaopay";

    const now = new Date();
    const end = new Date(now);
    end.setDate(now.getDate() + 30);

    const batch = db.batch();
    batch.update(db.doc(`partnerUsers/${partnerId}`), {
      subscriptionStatus: "active",
      subscriptionPlan: plan,
      subscriptionEndDate: admin.firestore.Timestamp.fromDate(end),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(
      db.doc(`partners/${partnerId}`),
      {
        subscription: {
          status: "active",
          plan,
          autoRenew,
          provider,
          currentPeriodStart: admin.firestore.Timestamp.fromDate(now),
          currentPeriodEnd: admin.firestore.Timestamp.fromDate(end),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();
    return { status: "active" };
  }
);

export const cancelPartnerSubscription = functions.https.onCall(
  async (data: { partnerId?: string }, context) => {
    const uid = requireAuth(context);
    const partnerId = data.partnerId ?? uid;
    if (partnerId !== uid) {
      throw new functions.https.HttpsError("permission-denied", "요청 권한이 없습니다.");
    }

    const batch = db.batch();
    batch.update(db.doc(`partnerUsers/${partnerId}`), {
      subscriptionStatus: "cancelled",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(
      db.doc(`partners/${partnerId}`),
      {
        subscription: {
          status: "canceled",
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();
    return { status: "cancelled" };
  }
);

/**
 * ✅ 견적 제출 시 포인트 차감 (일반 > 서비스 순)
 * - 500포인트 차감
 * - 일반 포인트부터 사용, 부족 시 서비스 포인트 사용
 * - 감사 로그 기록
 */
type DeductPointsForQuoteInput = {
  partnerId?: string;
  requestId?: string;
  quotePrice?: number;
};

export const deductPointsForQuote = functions.https.onCall(
  async (data: DeductPointsForQuoteInput, context) => {
    const uid = requireAuth(context);
    const partnerId = data.partnerId ?? uid;
    if (partnerId !== uid) {
      throw new functions.https.HttpsError("permission-denied", "요청 권한이 없습니다.");
    }

    const requestId = data.requestId ?? "";
    const quotePrice = toNumber(data.quotePrice) || 0;
    const pointsToDeduct = 500; // 고정값

    if (!requestId) {
      throw new functions.https.HttpsError("invalid-argument", "요청 ID가 필요합니다.");
    }

    const userRef = db.doc(`partnerUsers/${partnerId}`);
    const ledgerRef = db.collection(`partnerPointLedger/${partnerId}/items`).doc();

    return await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new functions.https.HttpsError("not-found", "파트너 정보를 찾을 수 없습니다.");
      }

      const user = userSnap.data() ?? {};
      const prevCashPoints = toNumber(user.cashPoints);
      const prevCashPointsService = toNumber(user.cashPointsService);
      const totalPoints = prevCashPoints + prevCashPointsService;

      // 포인트 부족 확인
      if (totalPoints < pointsToDeduct) {
        throw new functions.https.HttpsError("failed-precondition", "NEED_POINTS");
      }

      // 포인트 차감 (일반 > 서비스 순)
      const spendFromGeneral = Math.min(prevCashPoints, pointsToDeduct);
      const spendFromService = pointsToDeduct - spendFromGeneral;
      const nextCashPoints = prevCashPoints - spendFromGeneral;
      const nextCashPointsService = prevCashPointsService - spendFromService;

      // 파트너 포인트 업데이트
      tx.update(userRef, {
        cashPoints: nextCashPoints,
        cashPointsService: nextCashPointsService,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 감사 로그 기록
      tx.set(ledgerRef, {
        partnerId,
        type: "debit_quote",
        deltaPoints: -pointsToDeduct,
        generalDeducted: spendFromGeneral,
        serviceDeducted: spendFromService,
        balanceAfter: nextCashPoints + nextCashPointsService,
        requestId,
        quotePrice,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        pointsDeducted: pointsToDeduct,
        generalDeducted: spendFromGeneral,
        serviceDeducted: spendFromService,
        balanceAfter: nextCashPoints + nextCashPointsService,
      };
    });
  }
);
