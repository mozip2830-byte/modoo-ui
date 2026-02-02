"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { getOrder, type PaymentOrder } from "@/lib/payApi";

export default function PayResultPage() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("orderId") ?? "";
  const status = params.get("status") ?? "fail";
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

  return (
    <div className="page">
      <Header />
      <section className="section">
        <div className="container">
          <Card className="feature-card">
            {loading ? <p className="muted">결과 확인 중...</p> : null}
            {error ? <p style={{ color: "#c0392b" }}>{error}</p> : null}
            {order ? (
              <div className="stack">
                <h2>
                  {order.status === "PAID"
                    ? "결제가 완료되었습니다"
                    : order.status === "READY"
                    ? "결제 처리 중입니다(웹훅 대기)"
                    : "결제가 실패했습니다"}
                </h2>
                <p className="muted">주문번호: {order.orderId}</p>
                <p className="muted">금액: {order.amount.toLocaleString("ko-KR")}원</p>
                {order.status !== "PAID" && order.statusDetail ? (
                  <p className="muted">
                    사유:{" "}
                    {order.statusDetail.includes("CARD")
                      ? "카드 승인 실패"
                      : order.statusDetail.includes("CANCEL")
                      ? "결제가 취소되었습니다"
                      : "처리 실패"}
                  </p>
                ) : null}
                {/* TODO: 앱 복귀 딥링크 버튼 추가 위치 */}
                <div className="cta-row">
                  <Button onClick={() => router.push("/partner")}>파트너 대시보드로</Button>
                  <Button variant="outline" onClick={() => router.push("/partner/points")}>
                    포인트로 돌아가기
                  </Button>
                  {order.status === "READY" ? (
                    <Button variant="soft" onClick={() => window.location.reload()}>
                      새로고침
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      </section>
    </div>
  );
}
