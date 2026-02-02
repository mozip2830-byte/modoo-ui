"use client";

import { Card } from "@/components/ui/Card";

export default function PartnerDashboardPage() {
  return (
    <div className="grid-2">
      <Card className="feature-card">
        <h3>요청 수</h3>
        <p className="muted">이번 주 신규 요청: 24건</p>
      </Card>
      <Card className="feature-card">
        <h3>응답률</h3>
        <p className="muted">최근 7일 평균: 78%</p>
      </Card>
      <Card className="feature-card">
        <h3>포인트 잔액</h3>
        <p className="muted">준비 중</p>
      </Card>
      <Card className="feature-card">
        <h3>정산 예정</h3>
        <p className="muted">월말 정산 예정액: -</p>
      </Card>
    </div>
  );
}
