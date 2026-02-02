"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/useAuth";
import { clearRoleCache, useUserRole } from "@/lib/useUserRole";
import { onboardPartner } from "@/lib/partnerApi";

export default function PartnerOnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole(user?.uid);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceRegion, setServiceRegion] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      router.replace("/partner/login");
      return;
    }
    if (role === "partner") {
      router.replace("/partner");
    }
  }, [authLoading, roleLoading, user, role, router]);

  const handleSubmit = async () => {
    setError(null);
    if (!displayName.trim()) {
      setError("업체명/닉네임을 입력해 주세요.");
      return;
    }
    if (!agreeTerms) {
      setError("약관에 동의해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await onboardPartner({
        displayName: displayName.trim(),
        phone: phone.trim() || undefined,
        serviceRegion: serviceRegion.trim() || undefined,
        agreeTerms
      });
      clearRoleCache(user?.uid);
      router.replace("/partner");
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
            <h2>파트너 전환</h2>
            <p className="muted">
              기본 정보를 입력하면 파트너 권한으로 전환됩니다. 자세한 설정은 파트너 콘솔에서
              이어서 진행할 수 있습니다.
            </p>
          </Card>

          <Card className="feature-card">
            <div className="stack">
              <h3>기본 정보</h3>
              {error ? <p style={{ color: "#c0392b" }}>{error}</p> : null}
              <label>
                업체명/닉네임 *
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="예: 모두의집 파트너"
                />
              </label>
              <label>
                연락처
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                />
              </label>
              <label>
                서비스 지역
                <Input
                  value={serviceRegion}
                  onChange={(e) => setServiceRegion(e.target.value)}
                  placeholder="예: 서울 강남"
                />
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                />
                약관에 동의합니다. (필수)
              </label>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "전환 중..." : "파트너로 전환하기"}
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
