"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  searchCustomerUsers,
  searchPartnerUsers,
  updateCustomerUser,
  updatePartnerUser,
  CustomerUser,
  PartnerUser,
} from "@/lib/firestore";

type Tab = "customers" | "partners";

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("customers");
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState<CustomerUser[]>([]);
  const [partners, setPartners] = useState<PartnerUser[]>([]);
  const [error, setError] = useState("");

  // Edit modal state
  const [editingUser, setEditingUser] = useState<CustomerUser | PartnerUser | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

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
            ← 관리 홈으로
          </Link>
        </div>
      </div>
    );
  }

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setSearching(true);
    setError("");
    setCustomers([]);
    setPartners([]);

    try {
      if (activeTab === "customers") {
        const results = await searchCustomerUsers(searchTerm.trim());
        setCustomers(results);
        if (results.length === 0) {
          setError("검색 결과가 없습니다.");
        }
      } else {
        const results = await searchPartnerUsers(searchTerm.trim());
        setPartners(results);
        if (results.length === 0) {
          setError("검색 결과가 없습니다.");
        }
      }
    } catch (err) {
      console.error(err);
      setError("검색 중 오류가 발생했습니다.");
    } finally {
      setSearching(false);
    }
  };

  const openEditModal = (u: CustomerUser | PartnerUser) => {
    setEditingUser(u);
    if (activeTab === "customers") {
      const cu = u as CustomerUser;
      setEditValues({
        points: String(cu.points || 0),
        tier: cu.tier || "",
        status: cu.status || "active",
      });
    } else {
      const pu = u as PartnerUser;
      setEditValues({
        subscriptionStatus: pu.subscriptionStatus || "",
        subscriptionPlan: pu.subscriptionPlan || "",
        verificationStatus: pu.verificationStatus || "",
        grade: pu.grade || "",
      });
    }
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditValues({});
  };

  const handleSave = async () => {
    if (!editingUser || !user) return;

    setSaving(true);
    setError("");

    try {
      if (activeTab === "customers") {
        await updateCustomerUser(
          editingUser.uid,
          {
            points: parseInt(editValues.points) || 0,
            tier: editValues.tier,
            status: editValues.status,
          },
          user.uid,
          user.email || ""
        );
        // Refresh results
        const results = await searchCustomerUsers(searchTerm.trim());
        setCustomers(results);
      } else {
        await updatePartnerUser(
          editingUser.uid,
          {
            subscriptionStatus: editValues.subscriptionStatus,
            subscriptionPlan: editValues.subscriptionPlan,
            verificationStatus: editValues.verificationStatus,
            grade: editValues.grade,
          },
          user.uid,
          user.email || ""
        );
        // Refresh results
        const results = await searchPartnerUsers(searchTerm.trim());
        setPartners(results);
      }
      closeEditModal();
    } catch (err) {
      console.error(err);
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1 className="admin-title">사용자 관리</h1>
        <Link href="/admin" className="link">
          ← 관리 홈
        </Link>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "customers" ? "tab-active" : ""}`}
          onClick={() => {
            setActiveTab("customers");
            setCustomers([]);
            setPartners([]);
            setError("");
          }}
        >
          Customers
        </button>
        <button
          className={`tab ${activeTab === "partners" ? "tab-active" : ""}`}
          onClick={() => {
            setActiveTab("partners");
            setCustomers([]);
            setPartners([]);
            setError("");
          }}
        >
          Partners
        </button>
      </div>

      {/* Search */}
      <div className="card">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            className="input"
            placeholder="UID 또는 이메일로 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={searching}>
            {searching ? "검색 중..." : "검색"}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </div>

      {/* Customer Results */}
      {activeTab === "customers" && customers.length > 0 && (
        <div className="card mt-16">
          <h2 className="section-title">검색 결과 ({customers.length}건)</h2>
          <div className="user-list">
            {customers.map((cu) => (
              <div key={cu.uid} className="user-item">
                <div className="user-info">
                  <div className="user-email">{cu.email || "(이메일 없음)"}</div>
                  <div className="user-uid">{cu.uid}</div>
                </div>
                <div className="user-meta">
                  <span className="badge badge-info">포인트: {cu.points || 0}</span>
                  <span className="badge badge-info">등급: {cu.tier || "-"}</span>
                  <span className={`badge ${cu.status === "active" ? "badge-success" : "badge-warning"}`}>
                    {cu.status || "active"}
                  </span>
                </div>
                <button className="btn-edit" onClick={() => openEditModal(cu)}>
                  수정
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Partner Results */}
      {activeTab === "partners" && partners.length > 0 && (
        <div className="card mt-16">
          <h2 className="section-title">검색 결과 ({partners.length}건)</h2>
          <div className="user-list">
            {partners.map((pu) => (
              <div key={pu.uid} className="user-item">
                <div className="user-info">
                  <div className="user-email">{pu.email || "(이메일 없음)"}</div>
                  <div className="user-uid">{pu.uid}</div>
                  {pu.businessName && <div className="user-biz">{pu.businessName}</div>}
                </div>
                <div className="user-meta">
                  <span className={`badge ${pu.verificationStatus === "승인" ? "badge-success" : "badge-warning"}`}>
                    {pu.verificationStatus || "미인증"}
                  </span>
                  <span className="badge badge-info">등급: {pu.grade || "-"}</span>
                  <span className="badge badge-info">구독: {pu.subscriptionStatus || "-"}</span>
                </div>
                <button className="btn-edit" onClick={() => openEditModal(pu)}>
                  수정
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">사용자 수정</h2>
            <p className="modal-subtitle">{editingUser.email}</p>

            {activeTab === "customers" ? (
              <>
                <div className="form-group">
                  <label className="label">포인트</label>
                  <input
                    type="number"
                    className="input"
                    value={editValues.points}
                    onChange={(e) => setEditValues({ ...editValues, points: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="label">등급 (tier)</label>
                  <input
                    type="text"
                    className="input"
                    value={editValues.tier}
                    onChange={(e) => setEditValues({ ...editValues, tier: e.target.value })}
                    placeholder="예: 골드, 실버, 브론즈"
                  />
                </div>
                <div className="form-group">
                  <label className="label">상태 (status)</label>
                  <select
                    className="input"
                    value={editValues.status}
                    onChange={(e) => setEditValues({ ...editValues, status: e.target.value })}
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="banned">banned</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="label">구독 상태 (subscriptionStatus)</label>
                  <select
                    className="input"
                    value={editValues.subscriptionStatus}
                    onChange={(e) => setEditValues({ ...editValues, subscriptionStatus: e.target.value })}
                  >
                    <option value="">선택</option>
                    <option value="active">active</option>
                    <option value="trial">trial</option>
                    <option value="expired">expired</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">구독 플랜 (subscriptionPlan)</label>
                  <input
                    type="text"
                    className="input"
                    value={editValues.subscriptionPlan}
                    onChange={(e) => setEditValues({ ...editValues, subscriptionPlan: e.target.value })}
                    placeholder="예: basic, premium"
                  />
                </div>
                <div className="form-group">
                  <label className="label">인증 상태 (verificationStatus)</label>
                  <select
                    className="input"
                    value={editValues.verificationStatus}
                    onChange={(e) => setEditValues({ ...editValues, verificationStatus: e.target.value })}
                  >
                    <option value="">선택</option>
                    <option value="대기">대기</option>
                    <option value="심사중">심사중</option>
                    <option value="승인">승인</option>
                    <option value="반려">반려</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">등급 (grade)</label>
                  <input
                    type="text"
                    className="input"
                    value={editValues.grade}
                    onChange={(e) => setEditValues({ ...editValues, grade: e.target.value })}
                    placeholder="예: 정회원, 프리미엄회원"
                  />
                </div>
              </>
            )}

            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={closeEditModal}>
                취소
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
