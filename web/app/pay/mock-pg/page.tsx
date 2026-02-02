"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { auth } from "@/lib/firebaseClient";
import { getOrder, type PaymentOrder } from "@/lib/payApi";

export default function MockPgPage() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("orderId") ?? "";
  const tx = params.get("tx") ?? "";
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const confirmTest = async (status: "PAID" | "FAILED") => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("로그인이 필요합니다.");
      const token = await user.getIdToken();
      await fetch("/api/pay/confirm-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderId, status })
      });
    } catch (err) {
      console.error("[mock-pg] confirm-test error", err);
    } finally {
      const statusParam = status === "PAID" ? "success" : "fail";
      router.push(`/pay/result?orderId=${orderId}&status=${statusParam}&tx=${tx}`);
    }
  };

  return (
    <div className="page">
      <Header />
      <section className="section">
        <div className="container">
          <Card className="feature-card">
            <h2>Mock PG 결제창</h2>
            {loading ? <p className="muted">주문 조회 중...</p> : null}
            {error ? <p style={{ color: "#c0392b" }}>{error}</p> : null}
            {order ? (
              <div className="stack">
                <p>주문번호: {order.orderId}</p>
                <p>상품: {order.productId}</p>
                <p>금액: {order.amount.toLocaleString("ko-KR")}원</p>
                <div className="cta-row">
                  <Button onClick={() => confirmTest("PAID")}>결제 성공</Button>
                  <Button variant="outline" onClick={() => confirmTest("FAILED")}>
                    결제 실패
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      </section>
    </div>
  );
}
