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
    <div className="admin-container">
      <div className="admin-header">
        <h1 className="admin-title">관리자 홈</h1>
        <Link href="/" className="link">
          ← 메인으로
        </Link>
      </div>

      <div className="card">
        <div className="info-row">
          <span className="info-label">관리자</span>
          <span className="info-value">
            <span className="badge badge-success">admin=true</span>
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">이메일</span>
          <span className="info-value">{user.email}</span>
        </div>
      </div>

      <div className="card mt-16">
        <h2 className="section-title">관리 메뉴</h2>

        <div className="admin-menu">
          <Link href="/admin/users" className="admin-menu-item">
            <div className="admin-menu-icon">👥</div>
            <div className="admin-menu-content">
              <div className="admin-menu-title">사용자 관리</div>
              <div className="admin-menu-desc">고객/파트너 검색, 정보 수정</div>
            </div>
          </Link>

          <Link href="/admin/support" className="admin-menu-item">
            <div className="admin-menu-icon">💬</div>
            <div className="admin-menu-content">
              <div className="admin-menu-title">고객 지원</div>
              <div className="admin-menu-desc">문의 관리, 답변 처리</div>
            </div>
          </Link>
          <Link href="/admin/banners" className="admin-menu-item">
            <div className="admin-menu-icon">??</div>
            <div className="admin-menu-content">
              <div className="admin-menu-title">홈 배너</div>
              <div className="admin-menu-desc">배너 이미지, 링크, 노출 제어</div>
            </div>
          </Link>
          <Link href="/admin/logs" className="admin-menu-item">
            <div className="admin-menu-icon">LOG</div>
            <div className="admin-menu-content">
              <div className="admin-menu-title">입찰권 로그</div>
              <div className="admin-menu-desc">입찰권 사용/반환/충전 확인</div>
            </div>
          </Link>
          <Link href="/admin/reviews" className="admin-menu-item">
            <div className="admin-menu-icon">REV</div>
            <div className="admin-menu-content">
              <div className="admin-menu-title">리뷰 관리</div>
              <div className="admin-menu-desc">리뷰 검색/숨김/삭제</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
