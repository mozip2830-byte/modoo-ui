"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function HomePage() {
  const router = useRouter();
  const { user, loading, claims, isAdmin, signOut, refreshToken } = useAuth();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleRefreshToken = async () => {
    setRefreshing(true);
    try {
      await refreshToken();
    } catch (err) {
      console.error("Token refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth/login");
  };

  // Filter claims to show relevant info
  const displayClaims = claims
    ? Object.fromEntries(
        Object.entries(claims).filter(
          ([key]) =>
            !["iss", "aud", "auth_time", "iat", "exp", "sub", "user_id", "firebase"].includes(key)
        )
      )
    : null;

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1 className="title">관리자 정보</h1>
          <button className="btn btn-secondary" onClick={handleSignOut}>
            로그아웃
          </button>
        </div>

        <div className="info-row">
          <span className="info-label">이메일</span>
          <span className="info-value">{user.email}</span>
        </div>

        <div className="info-row">
          <span className="info-label">UID</span>
          <span className="info-value">
            {user.uid.substring(0, 12)}...
            <button className="copy-btn" onClick={copyUid}>
              {copied ? "복사됨!" : "복사"}
            </button>
          </span>
        </div>

        <div className="info-row">
          <span className="info-label">전체 UID</span>
          <span className="info-value" style={{ fontSize: "11px" }}>
            {user.uid}
          </span>
        </div>

        <div className="info-row">
          <span className="info-label">관리자 권한</span>
          <span className="info-value">
            {isAdmin ? (
              <span className="badge badge-success">admin=true</span>
            ) : (
              <span className="badge badge-danger">admin 없음</span>
            )}
          </span>
        </div>

        <div className="mt-16">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="info-label">Custom Claims</span>
            <button
              className="copy-btn"
              onClick={handleRefreshToken}
              disabled={refreshing}
            >
              {refreshing ? "갱신 중..." : "토큰 새로고침"}
            </button>
          </div>
          <div className="claims-box">
            {displayClaims && Object.keys(displayClaims).length > 0
              ? JSON.stringify(displayClaims, null, 2)
              : "(custom claims 없음)"}
          </div>
        </div>

        {!isAdmin && (
          <div className="warning-box">
            <p>
              <strong>⚠️ admin=true 권한이 없습니다.</strong>
              <br />
              관리자 권한이 설정되기 전까지 운영 페이지에 접근할 수 없습니다.
              <br />
              <br />
              권한 설정 후 위의 "토큰 새로고침" 버튼을 클릭하거나, 로그아웃 후
              다시 로그인하세요.
            </p>
          </div>
        )}

        <div className="mt-24">
          <Link href="/admin" className="btn btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            운영 페이지로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
