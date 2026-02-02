"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/useAuth";
import { useUserRole } from "@/lib/useUserRole";

export function PartnerGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole(user?.uid);

  const isOnboarding = pathname === "/partner/onboarding";

  useEffect(() => {
    if (isOnboarding) return;
    if (authLoading) return;
    if (!user) {
      router.replace("/partner/login");
    }
  }, [authLoading, user, router, isOnboarding]);

  if (authLoading || roleLoading) {
    return (
      <div className="guard-center">
        <Card>
          <p className="muted">권한을 확인 중입니다...</p>
        </Card>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!isOnboarding && role !== "partner") {
    return (
      <div className="guard-center">
        <Card className="stack">
          <h3>접근 권한이 없습니다</h3>
          <p className="muted">파트너 계정으로 로그인해 주세요.</p>
          <div className="cta-row">
            <Link href="/">
              <Button variant="outline">고객 랜딩으로</Button>
            </Link>
            <Link href="/partner/onboarding">
              <Button>파트너로 전환하기</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
