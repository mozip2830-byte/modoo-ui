"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import {
  deleteReview,
  getCustomerUser,
  getReviewsByPartner,
  searchPartnerUsers,
  setReviewHidden,
  PartnerUser,
  ReviewItem,
} from "@/lib/firestore";

function formatDate(value?: { toDate?: () => Date } | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : value.toDate?.();
  if (!date) return "-";
  return date.toLocaleString("ko-KR");
}

type CustomerMeta = {
  name: string;
  email: string;
};

export default function AdminReviewsPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [partnerResults, setPartnerResults] = useState<PartnerUser[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerUser | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [customerFilter, setCustomerFilter] = useState("");
  const [customerMeta, setCustomerMeta] = useState<Record<string, CustomerMeta>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setSearching(true);
    setError("");
    setPartnerResults([]);
    setSelectedPartner(null);
    setReviews([]);
    setCustomerMeta({});

    try {
      const results = await searchPartnerUsers(searchTerm.trim());
      setPartnerResults(results);
      if (results.length === 0) {
        setError("검색 결과가 없습니다.");
      }
    } catch (err) {
      console.error(err);
      setError("검색 중 오류가 발생했습니다.");
    } finally {
      setSearching(false);
    }
  };

  const loadReviews = async (partnerId: string) => {
    setLoadingReviews(true);
    setError("");
    try {
      const data = await getReviewsByPartner(partnerId);
      setReviews(data);

      const uniqueCustomerIds = Array.from(
        new Set(data.map((item) => item.customerId).filter(Boolean))
      );
      const entries = await Promise.all(
        uniqueCustomerIds.map(async (id) => {
          const customer = await getCustomerUser(id);
          const name = customer?.displayName || customer?.email || id;
          return [id, { name, email: customer?.email || "" }] as const;
        })
      );
      setCustomerMeta(Object.fromEntries(entries));
    } catch (err) {
      console.error(err);
      setError("리뷰를 불러오지 못했습니다.");
    } finally {
      setLoadingReviews(false);
    }
  };

  const filteredReviews = useMemo(() => {
    if (!customerFilter.trim()) return reviews;
    const needle = customerFilter.trim().toLowerCase();
    return reviews.filter((review) => {
      const meta = customerMeta[review.customerId];
      const name = meta?.name ?? "";
      const email = meta?.email ?? "";
      return name.toLowerCase().includes(needle) || email.toLowerCase().includes(needle);
    });
  }, [reviews, customerFilter, customerMeta]);

  const handleSelectPartner = (partner: PartnerUser) => {
    setSelectedPartner(partner);
    setCustomerFilter("");
    loadReviews(partner.uid);
  };

  const handleToggleHidden = async (review: ReviewItem) => {
    if (!user) return;
    try {
      await setReviewHidden(review.id, !review.hidden, user.uid, user.email || "");
      if (selectedPartner) {
        await loadReviews(selectedPartner.uid);
      }
    } catch (err) {
      console.error(err);
      setError("리뷰 처리 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (review: ReviewItem) => {
    if (!user) return;
    const ok = window.confirm("이 리뷰를 삭제할까요?");
    if (!ok) return;
    try {
      await deleteReview(review.id, user.uid, user.email || "");
      if (selectedPartner) {
        await loadReviews(selectedPartner.uid);
      }
    } catch (err) {
      console.error(err);
      setError("리뷰 삭제 중 오류가 발생했습니다.");
    }
  };

  if (loading) {
    return (
      <div className="admin-container">
        <div className="loading">로딩 중...</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="admin-container">
        <div className="card">
          <h1 className="title">권한 없음</h1>
          <p>관리자 권한이 필요합니다.</p>
          <Link href="/admin" className="link mt-16">
            관리자 홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1 className="admin-title">리뷰 관리</h1>
        <Link href="/admin" className="link">
          관리자 홈
        </Link>
      </div>

      <div className="card">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            className="input"
            placeholder="파트너 UID 또는 이메일"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={searching}>
            {searching ? "검색 중..." : "검색"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      {partnerResults.length > 0 && (
        <div className="card mt-16">
          <h2 className="section-title">파트너 선택</h2>
          <div className="user-list">
            {partnerResults.map((pu) => (
              <div key={pu.uid} className="user-item">
                <div className="user-info">
                  <div className="user-email">{pu.email || "(이메일 없음)"}</div>
                  <div className="user-uid">{pu.uid}</div>
                  {pu.businessName && <div className="user-biz">{pu.businessName}</div>}
                </div>
                <button className="btn-edit" onClick={() => handleSelectPartner(pu)}>
                  선택
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPartner && (
        <div className="card mt-16">
          <div className="info-row">
            <span className="info-label">선택 파트너</span>
            <span className="info-value">
              {selectedPartner.email ?? "-"} ({selectedPartner.uid})
            </span>
          </div>
          <div className="form-group mt-16">
            <label className="label">고객 이름/이메일 검색</label>
            <input
              type="text"
              className="input"
              placeholder="고객 이름 또는 이메일"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="card mt-16">
        <h2 className="section-title">리뷰 목록</h2>
        {loadingReviews ? (
          <div className="loading">불러오는 중...</div>
        ) : filteredReviews.length === 0 ? (
          <p className="subtitle">표시할 리뷰가 없습니다.</p>
        ) : (
          <div className="user-list">
            {filteredReviews.map((review) => {
              const meta = customerMeta[review.customerId];
              return (
                <div key={review.id} className="user-item">
                  <div className="user-info">
                    <div className="user-email">
                      {meta?.name ?? review.customerId} {review.hidden ? "(숨김)" : ""}
                    </div>
                    <div className="user-uid">{meta?.email ?? ""}</div>
                    <div className="user-uid">리뷰 ID: {review.id}</div>
                    <div className="user-uid">작성: {formatDate(review.createdAt)}</div>
                    <div className="user-uid">
                      평점 {review.rating ?? "-"} / 사진 {review.photoCount ?? 0}
                    </div>
                    {review.text ? <div className="user-biz">{review.text}</div> : null}
                  </div>
                  <div className="user-actions">
                    <button className="btn-edit" onClick={() => handleToggleHidden(review)}>
                      {review.hidden ? "숨김 해제" : "숨김"}
                    </button>
                    <button className="btn-edit" onClick={() => handleDelete(review)}>
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
