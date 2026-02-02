"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/useAuth";

type QuotePayload = {
  customerName: string;
  phone: string;
  serviceType: string;
  address: string;
  details: string;
};

export default function QuotePage() {
  const { user, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<QuotePayload>({
    customerName: "",
    phone: "",
    serviceType: "",
    address: "",
    details: ""
  });

  const update = (key: keyof QuotePayload, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (!form.customerName.trim() || !form.phone.trim() || !form.serviceType.trim()) {
      setError("필수 정보를 입력해 주세요.");
      return;
    }
    if (!user) {
      setError("로그인이 필요합니다.");
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, uid: user.uid })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data?.message ?? "요청에 실패했습니다.");
        return;
      }
      setSuccess("요청이 접수되었습니다. 앱에서 이어서 관리할 수 있습니다.");
      setForm({
        customerName: "",
        phone: "",
        serviceType: "",
        address: "",
        details: ""
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <Header />
      <section className="section">
        <div className="container grid-2">
          <Card className="feature-card">
            <h2>간편 견적 요청</h2>
            <p className="muted">
              간단한 정보만 입력하면 파트너가 제안서를 보냅니다. 채팅/결제는 앱에서 이어집니다.
            </p>
            <ul className="muted">
              <li>필수 정보만 입력</li>
              <li>견적 수신 후 앱에서 비교</li>
              <li>개인정보는 안전하게 보호</li>
            </ul>
          </Card>

          <Card className="feature-card">
            <div className="stack">
              <div>
                <h3>견적 요청 정보</h3>
                <p className="muted">* 표시 항목은 필수입니다.</p>
              </div>

              {loading ? (
                <p className="muted">로그인 상태 확인 중...</p>
              ) : !user ? (
                <div className="stack">
                  <p className="muted">견적 요청을 위해 로그인해 주세요.</p>
                  <Button variant="outline">로그인</Button>
                </div>
              ) : null}

              {error ? <p style={{ color: "#c0392b" }}>{error}</p> : null}
              {success ? <p style={{ color: "#1b8c6b" }}>{success}</p> : null}

              <div className="stack">
                <label>
                  고객명 *
                  <Input
                    value={form.customerName}
                    onChange={(e) => update("customerName", e.target.value)}
                    placeholder="이름을 입력해 주세요"
                  />
                </label>
                <label>
                  연락처 *
                  <Input
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="010-0000-0000"
                  />
                </label>
                <label>
                  서비스 유형 *
                  <Input
                    value={form.serviceType}
                    onChange={(e) => update("serviceType", e.target.value)}
                    placeholder="예: 청소, 이사"
                  />
                </label>
                <label>
                  주소
                  <Input
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="예: 서울시 강남구"
                  />
                </label>
                <label>
                  상세 요청
                  <Input
                    as="textarea"
                    value={form.details}
                    onChange={(e) => update("details", e.target.value)}
                    placeholder="요청 사항을 입력해 주세요"
                  />
                </label>
              </div>

              <Button onClick={handleSubmit} disabled={submitting || !user}>
                {submitting ? "제출 중..." : "견적 요청하기"}
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
