"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="container">
        <div className="loading">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!isAdmin) {
    return (
      <div className="container">
        <div className="card">
          <h1 className="title">권한 없음</h1>
          <p className="subtitle">
            이 페이지에 접근하려면 관리자 권한(admin=true)이 필요합니다.
          </p>

          <div className="warning-box">
            <p>
              현재 계정에는 admin 권한이 설정되어 있지 않습니다.
              <br />
              <br />
              관리자 권한을 받으려면:
              <br />
              1. 메인 페이지에서 UID를 복사하세요.
              <br />
              2. 시스템 관리자에게 UID를 전달하여 admin claim을 요청하세요.
              <br />
              3. 권한 설정 후 로그아웃/로그인 또는 토큰 새로고침을 하세요.
            </p>
          </div>

          <div className="mt-24">
            <Link
              href="/"
              className="btn btn-primary"
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            >
              메인으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1 className="title">운영 페이지</h1>
          <Link href="/" className="link">
            ← 메인으로
          </Link>
        </div>

        <p className="subtitle">관리자 권한으로 접근 중입니다.</p>

        <div className="info-row">
          <span className="info-label">관리자</span>
          <span className="info-value">
            <span className="badge badge-success">admin=true</span>
          </span>
        </div>

        <div className="mt-24">
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            이 페이지는 관리자 전용 기능의 뼈대입니다.
            <br />
            추후 사용자 관리, 통계 등의 기능이 추가될 예정입니다.
          </p>
        </div>
      </div>
    </div>
  );
}
