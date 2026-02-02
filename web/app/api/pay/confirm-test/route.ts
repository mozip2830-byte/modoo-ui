import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { finalizePayment } from "@/lib/server/payments";

type Payload = {
  orderId?: string;
  status?: "PAID" | "FAILED";
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Not allowed" }, { status: 403 });
  }

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
    const payload = (await request.json()) as Payload;
    const orderId = payload.orderId ?? "";
    const status = payload.status ?? "PAID";

    if (!orderId) {
      return NextResponse.json({ message: "orderId가 필요합니다." }, { status: 400 });
    }

    const orderSnap = await adminDb.collection("payment_orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ message: "주문을 찾을 수 없습니다." }, { status: 404 });
    }
    const order = orderSnap.data() as { uid?: string };
    if (order.uid !== uid) {
      return NextResponse.json({ message: "접근 권한이 없습니다." }, { status: 403 });
    }

    await finalizePayment({
      orderId,
      nextStatus: status === "FAILED" ? "FAILED" : "PAID",
      pgProvider: "stub",
      statusDetail: status === "FAILED" ? "TEST_FAILED" : "TEST_PAID"
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "ORDER_NOT_FOUND") {
      return NextResponse.json({ message: "주문을 찾을 수 없습니다." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ message: "접근 권한이 없습니다." }, { status: 403 });
    }
    console.error("[web][pay][confirm-test] error", err);
    return NextResponse.json({ message: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
