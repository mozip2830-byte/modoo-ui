import admin from "firebase-admin";
import { NextResponse } from "next/server";

import { getAdminDb } from "../../../../../lib/firebaseAdmin";

export async function GET(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;
    if (!token) {
      return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
    }

    const db = getAdminDb();
    if (!db) {
      return new Response(
        JSON.stringify({ error: "Firebase Admin is not configured." }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const orderId = params.orderId;

    const orderSnap = await db.collection("payment_orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ message: "주문을 찾을 수 없습니다." }, { status: 404 });
    }

    const data = orderSnap.data() as { uid?: string };
    if (data.uid !== uid) {
      return NextResponse.json({ message: "접근 권한이 없습니다." }, { status: 403 });
    }

    return NextResponse.json({ orderId, ...data }, { status: 200 });
  } catch (err) {
    console.error("[web][pay][orders] get error", err);
    return NextResponse.json({ message: "주문 조회에 실패했습니다." }, { status: 500 });
  }
}
