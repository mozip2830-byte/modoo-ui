"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { signInWithGooglePopup } from "@/lib/auth";
import { useAuth } from "@/lib/useAuth";
import { useUserRole } from "@/lib/useUserRole";

export default function PartnerLoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useUserRole(user?.uid);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (!user) return;
    if (role === "partner") {
      router.replace("/partner");
    } else if (role) {
      router.replace("/partner/onboarding");
    }
  }, [loading, roleLoading, user, role, router]);

  const handleGoogleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const showForbidden = !loading && !roleLoading && user && role !== "partner";

  return (
    <div className="page">
      <Header />
      <section className="section">
        <div className="container grid-2">
          <Card className="feature-card">
            <h2>파트너 전용 로그인</h2>
            <p className="muted">
              파트너 계정으로 로그인하면 요청 관리, 채팅, 포인트 충전 등 모든 기능을 이용할 수 있습니다.
            </p>
          </Card>

          <Card className="feature-card">
            {showForbidden ? (
              <>
                <h3>접근 권한 없음</h3>
                <p className="muted">이 계정은 파트너 권한이 없습니다. 전환을 진행해 주세요.</p>
                <div className="cta-row">
                  <Button variant="outline" onClick={() => router.replace("/")}>
                    고객 랜딩으로
                  </Button>
                  <Button onClick={() => router.replace("/partner/onboarding")}>
                    파트너로 전환하기
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3>로그인</h3>
                <p className="muted">현재는 Google 로그인만 제공합니다.</p>
                {error ? <p style={{ color: "#c0392b" }}>{error}</p> : null}
                <Button onClick={handleGoogleLogin} disabled={submitting}>
                  {submitting ? "로그인 중..." : "Google로 로그인"}
                </Button>
              </>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
