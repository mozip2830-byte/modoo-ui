import { NextResponse } from "next/server";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

const PRODUCT_PRICES: Record<string, number> = {
  POINT_10000: 10000,
  POINT_30000: 30000,
  POINT_50000: 50000
};

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
    const payload = (await request.json()) as { productId?: string };
    const productId = payload.productId ?? "";
    const amount = PRODUCT_PRICES[productId];
    if (!amount) {
      return NextResponse.json({ message: "알 수 없는 상품입니다." }, { status: 400 });
    }

    const orderRef = adminDb.collection("payment_orders").doc();
    const now = new Date().toISOString();
    await orderRef.set({
      uid,
      amount,
      productId,
      status: "READY",
      pgProvider: null,
      pgTxId: null,
      statusDetail: null,
      createdAt: now,
      updatedAt: now
    });

    return NextResponse.json({ orderId: orderRef.id }, { status: 200 });
  } catch (err) {
    console.error("[web][pay][orders] create error", err);
    return NextResponse.json({ message: "주문 생성에 실패했습니다." }, { status: 500 });
  }
}
