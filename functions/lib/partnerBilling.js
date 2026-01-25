"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelPartnerSubscription = exports.startPartnerSubscription = exports.createBidTicketOrderWithPoints = exports.createPartnerCharge = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
function requireAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    return context.auth.uid;
}
function toNumber(value) {
    return Math.max(0, Math.floor(Number(value || 0)));
}
exports.createPartnerCharge = functions.https.onCall(async (data, context) => {
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
    const creditedPoints = chargeType === "cashPoints" || chargeType === "cashPointsService" ? displayAmountKRW : toNumber(data.creditedPoints);
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
    const nextCashPointsService = chargeType === "cashPointsService" ? prevCashPointsService + creditedPoints : prevCashPointsService;
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
    }
    else if (chargeType === "cashPointsService") {
        batch.update(userRef, {
            cashPointsService: nextCashPointsService,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    else {
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
exports.createBidTicketOrderWithPoints = functions.https.onCall(async (data, context) => {
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
});
exports.startPartnerSubscription = functions.https.onCall(async (data, context) => {
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
    batch.set(db.doc(`partners/${partnerId}`), {
        subscription: {
            status: "active",
            plan,
            autoRenew,
            provider,
            currentPeriodStart: admin.firestore.Timestamp.fromDate(now),
            currentPeriodEnd: admin.firestore.Timestamp.fromDate(end),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    return { status: "active" };
});
exports.cancelPartnerSubscription = functions.https.onCall(async (data, context) => {
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
    batch.set(db.doc(`partners/${partnerId}`), {
        subscription: {
            status: "canceled",
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    return { status: "cancelled" };
});
