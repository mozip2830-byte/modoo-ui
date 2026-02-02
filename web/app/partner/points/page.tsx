"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createOrder } from "@/lib/payApi";
import { getBalance, getLedger, type LedgerItem } from "@/lib/pointsApi";

export default function PartnerPointsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleCharge = async (productId: string) => {
    setError(null);
    setLoading(true);
    try {
      const { orderId } = await createOrder(productId);
      router.push(`/pay/checkout?orderId=${orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "주문 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setBalanceLoading(true);
    getBalance()
      .then((data) => setBalance(data.balance))
      .catch((err) => setError(err instanceof Error ? err.message : "잔액 조회 실패"))
      .finally(() => setBalanceLoading(false));
  }, []);

  useEffect(() => {
    setLedgerLoading(true);
    getLedger()
      .then((items) => setLedger(items))
      .catch((err) => setError(err instanceof Error ? err.message : "원장 조회 실패"))
      .finally(() => setLedgerLoading(false));
  }, []);

  return (
    <Card className="feature-card">
      <h3>포인트</h3>
      <p className="muted">잔액과 충전 내역을 확인하고 포인트를 충전할 수 있습니다.</p>
      <div className="card">
        <p className="muted">현재 잔액</p>
        <h2>{balanceLoading ? "불러오는 중..." : `${balance.toLocaleString("ko-KR")} P`}</h2>
      </div>
      {error ? <p style={{ color: "#c0392b" }}>{error}</p> : null}
      <div className="cta-row">
        <Button variant="outline" onClick={() => handleCharge("POINT_10000")} disabled={loading}>
          10,000P 충전
        </Button>
        <Button variant="outline" onClick={() => handleCharge("POINT_30000")} disabled={loading}>
          30,000P 충전
        </Button>
        <Button variant="outline" onClick={() => handleCharge("POINT_50000")} disabled={loading}>
          50,000P 충전
        </Button>
      </div>
      <div className="stack" style={{ marginTop: 16 }}>
        <h4>거래 내역</h4>
        {ledgerLoading ? <p className="muted">불러오는 중...</p> : null}
        {!ledgerLoading && ledger.length === 0 ? (
          <p className="muted">거래 내역이 없습니다.</p>
        ) : null}
        {!ledgerLoading
          ? ledger.map((item) => (
              <div key={item.id} className="card">
                <div className="meta-row" style={{ justifyContent: "space-between" }}>
                  <span>{item.reason}</span>
                  <strong style={{ color: item.type === "credit" ? "#1b8c6b" : "#c0392b" }}>
                    {item.type === "credit" ? "+" : "-"}
                    {item.amount.toLocaleString("ko-KR")} P
                  </strong>
                </div>
                <p className="muted">{item.createdAt ? item.createdAt : "-"}</p>
              </div>
            ))
          : null}
      </div>
    </Card>
  );
}
