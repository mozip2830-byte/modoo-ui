"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { getOrder, type PaymentOrder } from "@/lib/payApi";
import { createPaySession } from "@/lib/paySessionApi";

export default function PayCheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("orderId") ?? "";
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setError("orderId가 필요합니다.");
      return;
    }
    setLoading(true);
    getOrder(orderId)
      .then((data) => setOrder(data))
      .catch((err) => setError(err instanceof Error ? err.message : "주문 조회 실패"))
      .finally(() => setLoading(false));
  }, [orderId]);

  return (
    <div className="page">
      <Header />
      <section className="section">
        <div className="container grid-2">
          <Card className="feature-card">
            <h2>포인트 충전 결제</h2>
            <p className="muted">결제는 외부 PG로 연결될 예정입니다.</p>
          </Card>
          <Card className="feature-card">
            {loading ? <p className="muted">주문 조회 중...</p> : null}
            {error ? <p style={{ color: "#c0392b" }}>{error}</p> : null}
            {order ? (
              <div className="stack">
                <p>주문번호: {order.orderId}</p>
                <p>상품: {order.productId}</p>
                <p>금액: {order.amount.toLocaleString("ko-KR")}원</p>
                <p>상태: {order.status}</p>
                <Button
                  onClick={async () => {
                    try {
                      setSessionLoading(true);
                      const { redirectUrl } = await createPaySession(orderId);
                      window.location.assign(redirectUrl);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "결제 시작 실패");
                    } finally {
                      setSessionLoading(false);
                    }
                  }}
                  disabled={sessionLoading}
                >
                  {sessionLoading ? "결제 시작 중..." : "결제 시작"}
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      </section>
    </div>
  );
}
