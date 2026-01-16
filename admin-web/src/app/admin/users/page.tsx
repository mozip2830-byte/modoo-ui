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
  updatePartnerPoints,
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

  // Points modal state (for partners)
  const [pointsUser, setPointsUser] = useState<PartnerUser | null>(null);
  const [pointsMode, setPointsMode] = useState<"charge" | "deduct" | "set">("charge");
  const [pointsAmount, setPointsAmount] = useState("");
  const [savingPoints, setSavingPoints] = useState(false);

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

  const openPointsModal = (pu: PartnerUser) => {
    setPointsUser(pu);
    setPointsMode("charge");
    setPointsAmount("");
  };

  const closePointsModal = () => {
    setPointsUser(null);
    setPointsAmount("");
  };

  const handlePointsSave = async () => {
    if (!pointsUser || !user || !pointsAmount) return;

    setSavingPoints(true);
    setError("");

    try {
      const currentPoints = pointsUser.points ?? 0;
      const amount = parseInt(pointsAmount) || 0;
      let newPoints = 0;

      if (pointsMode === "charge") {
        newPoints = currentPoints + amount;
      } else if (pointsMode === "deduct") {
        newPoints = Math.max(0, currentPoints - amount);
      } else {
        newPoints = amount;
      }

      await updatePartnerPoints(pointsUser.uid, newPoints, user.uid, user.email || "");

      // Refresh results
      const results = await searchPartnerUsers(searchTerm.trim());
      setPartners(results);
      closePointsModal();
    } catch (err) {
      console.error(err);
      setError("포인트 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingPoints(false);
    }
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
          고객
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
          파트너
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
              <div key={pu.uid} className="user-item user-item-partner">
                <div className="user-info">
                  <div className="user-email">{pu.email || "(이메일 없음)"}</div>
                  <div className="user-uid">{pu.uid}</div>
                  {pu.businessName && <div className="user-biz">{pu.businessName}</div>}
                </div>
                <div className="user-meta">
                  <span className="badge badge-points">포인트: {pu.points ?? 0}</span>
                  <span className={`badge ${pu.verificationStatus === "승인" ? "badge-success" : "badge-warning"}`}>
                    {pu.verificationStatus || "미인증"}
                  </span>
                  <span className="badge badge-info">등급: {pu.grade || "-"}</span>
                  <span className="badge badge-info">구독: {pu.subscriptionStatus || "-"}</span>
                </div>
                <div className="user-actions">
                  <button className="btn-points" onClick={() => openPointsModal(pu)}>
                    포인트
                  </button>
                  <button className="btn-edit" onClick={() => openEditModal(pu)}>
                    수정
                  </button>
                </div>
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
                  <label className="label">상태</label>
                  <select
                    className="input"
                    value={editValues.status}
                    onChange={(e) => setEditValues({ ...editValues, status: e.target.value })}
                  >
                    <option value="active">활성</option>
                    <option value="suspended">정지</option>
                    <option value="banned">차단</option>
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

      {/* Points Modal (Partners) */}
      {pointsUser && (
        <div className="modal-overlay" onClick={closePointsModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">포인트 관리</h2>
            <p className="modal-subtitle">{pointsUser.email}</p>

            <div className="points-current">
              <span className="points-label">현재 포인트</span>
              <span className="points-value">{pointsUser.points ?? 0}</span>
            </div>

            {/* Quick Buttons */}
            <div className="form-group">
              <label className="label">빠른 조작</label>
              <div className="quick-points-buttons">
                <button
                  className="quick-btn quick-btn-plus"
                  onClick={() => {
                    const current = pointsUser.points ?? 0;
                    setPointsMode("set");
                    setPointsAmount(String(current + 100));
                  }}
                >
                  +100
                </button>
                <button
                  className="quick-btn quick-btn-plus"
                  onClick={() => {
                    const current = pointsUser.points ?? 0;
                    setPointsMode("set");
                    setPointsAmount(String(current + 1000));
                  }}
                >
                  +1000
                </button>
                <button
                  className="quick-btn quick-btn-minus"
                  onClick={() => {
                    const current = pointsUser.points ?? 0;
                    setPointsMode("set");
                    setPointsAmount(String(Math.max(0, current - 100)));
                  }}
                >
                  -100
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="label">작업 유형</label>
              <div className="points-mode-buttons">
                <button
                  className={`points-mode-btn ${pointsMode === "charge" ? "active" : ""}`}
                  onClick={() => setPointsMode("charge")}
                >
                  충전 (+)
                </button>
                <button
                  className={`points-mode-btn ${pointsMode === "deduct" ? "active" : ""}`}
                  onClick={() => setPointsMode("deduct")}
                >
                  차감 (-)
                </button>
                <button
                  className={`points-mode-btn ${pointsMode === "set" ? "active" : ""}`}
                  onClick={() => setPointsMode("set")}
                >
                  직접 설정
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="label">
                {pointsMode === "charge" ? "충전할 포인트" : pointsMode === "deduct" ? "차감할 포인트" : "설정할 포인트"}
              </label>
              <input
                type="number"
                className="input"
                placeholder="0"
                value={pointsAmount}
                onChange={(e) => setPointsAmount(e.target.value)}
                min="0"
              />
            </div>

            {pointsAmount && (
              <div className="points-preview">
                <span className="points-preview-label">변경 후 포인트:</span>
                <span className="points-preview-value">
                  {pointsMode === "charge"
                    ? (pointsUser.points ?? 0) + (parseInt(pointsAmount) || 0)
                    : pointsMode === "deduct"
                    ? Math.max(0, (pointsUser.points ?? 0) - (parseInt(pointsAmount) || 0))
                    : parseInt(pointsAmount) || 0}
                </span>
              </div>
            )}

            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={closePointsModal}>
                취소
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePointsSave}
                disabled={savingPoints || !pointsAmount}
              >
                {savingPoints ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
