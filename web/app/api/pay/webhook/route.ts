import { NextResponse } from "next/server";
import { finalizePayment } from "@/lib/server/payments";

type WebhookPayload = {
  orderId?: string;
  status?: "PAID" | "FAILED";
};

export async function POST(request: Request) {
  try {
    const secret = process.env.PG_WEBHOOK_SECRET ?? "";
    const signature = request.headers.get("x-pg-signature") ?? "";
    // TODO: 실제 PG 연동 시 서명/시크릿 검증 로직 추가
    // 예: HMAC(body, secret) === signature
    if (secret && !signature) {
      return NextResponse.json({ message: "서명 검증 실패" }, { status: 401 });
    }
    const payload = (await request.json()) as WebhookPayload;
    const orderId = payload.orderId ?? "";
    const status = payload.status ?? "FAILED";

    if (!orderId) {
      return NextResponse.json({ message: "orderId가 필요합니다." }, { status: 400 });
    }

    await finalizePayment({
      orderId,
      nextStatus: status === "FAILED" ? "FAILED" : "PAID",
      pgProvider: process.env.PG_PROVIDER === "toss" ? "toss" : "stub",
      statusDetail: status === "FAILED" ? "PAYMENT_FAILED" : null
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "ORDER_NOT_FOUND") {
      return NextResponse.json({ message: "주문을 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[web][pay][webhook] error", err);
    return NextResponse.json({ message: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
