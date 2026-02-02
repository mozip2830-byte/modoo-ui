import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;
    if (!token) {
      return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const payload = (await request.json()) as { orderId?: string };
    const orderId = payload.orderId ?? "";
    if (!orderId) {
      return NextResponse.json({ message: "orderId가 필요합니다." }, { status: 400 });
    }

    const orderRef = adminDb.collection("payment_orders").doc(orderId);
    const txId = `stub_${Date.now()}`;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        throw new Error("ORDER_NOT_FOUND");
      }
      const data = snap.data() as { uid?: string; status?: string };
      if (data.uid !== uid) {
        throw new Error("FORBIDDEN");
      }
      if (data.status !== "READY") {
        throw new Error("INVALID_STATUS");
      }

      tx.set(
        orderRef,
        {
          pgProvider: "stub",
          pgTxId: txId,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });

    const redirectUrl = `/pay/mock-pg?orderId=${encodeURIComponent(orderId)}&tx=${encodeURIComponent(txId)}`;
    return NextResponse.json({ redirectUrl }, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "ORDER_NOT_FOUND") {
        return NextResponse.json({ message: "주문을 찾을 수 없습니다." }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ message: "접근 권한이 없습니다." }, { status: 403 });
      }
      if (err.message === "INVALID_STATUS") {
        return NextResponse.json({ message: "결제 가능한 상태가 아닙니다." }, { status: 400 });
      }
    }
    console.error("[web][pay][session] error", err);
    return NextResponse.json({ message: "세션 생성에 실패했습니다." }, { status: 500 });
  }
}
