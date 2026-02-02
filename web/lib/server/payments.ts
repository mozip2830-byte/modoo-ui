import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "../firebaseAdmin";

type Status = "READY" | "PAID" | "FAILED" | "CANCELLED";

type FinalizeInput = {
  orderId: string;
  nextStatus: Status;
  pgProvider?: "stub" | "toss" | "inicis" | "nice" | null;
  pgTxId?: string | null;
  statusDetail?: string | null;
};

type FinalizeResult = {
  applied: boolean;
  currentStatus: Status;
  message: string;
};

const MAX_DETAIL = 200;

function trimDetail(detail?: string | null) {
  if (!detail) return null;
  const cleaned = detail.trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_DETAIL ? `${cleaned.slice(0, MAX_DETAIL)}...` : cleaned;
}

function isAllowedTransition(current: Status, next: Status): boolean {
  if (current === next) return true;
  if (current === "READY" && (next === "PAID" || next === "FAILED" || next === "CANCELLED")) {
    return true;
  }
  return false;
}

export async function finalizePayment(input: FinalizeInput): Promise<FinalizeResult> {
  const adminDb = getAdminDb();
  if (!adminDb) {
    throw new Error("ADMIN_NOT_READY");
  }

  const orderRef = adminDb.collection("payment_orders").doc(input.orderId);
  const ledgerRef = adminDb.collection("point_ledger").doc(`${input.orderId}_POINT_CHARGE`);
  const detail = trimDetail(input.statusDetail);

  let result: FinalizeResult = { applied: false, currentStatus: "READY", message: "" };

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) {
      throw new Error("ORDER_NOT_FOUND");
    }

    const order = snap.data() as { status?: Status; uid?: string; amount?: number };
    const currentStatus = order.status ?? "READY";
    const allowed = isAllowedTransition(currentStatus, input.nextStatus);

    if (!allowed) {
      const ignored = trimDetail(`IGNORED: ${currentStatus} -> ${input.nextStatus}`);
      tx.set(
        orderRef,
        {
          statusDetail: ignored,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      result = {
        applied: false,
        currentStatus,
        message: "transition_ignored"
      };
      return;
    }

    if (input.nextStatus === "PAID") {
      const ledgerSnap = await tx.get(ledgerRef);
      if (!ledgerSnap.exists) {
        tx.set(ledgerRef, {
          uid: order.uid,
          type: "credit",
          amount: order.amount ?? 0,
          reason: "POINT_CHARGE",
          orderId: input.orderId,
          createdAt: FieldValue.serverTimestamp()
        });
      }
    }

    tx.set(
      orderRef,
      {
        status: input.nextStatus,
        pgProvider: input.pgProvider ?? null,
        pgTxId: input.pgTxId ?? null,
        statusDetail: detail,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    result = {
      applied: true,
      currentStatus: input.nextStatus,
      message: "transition_applied"
    };
  });

  return result;
}
