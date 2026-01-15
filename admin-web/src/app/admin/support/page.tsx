"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getSupportTickets, SupportTicket } from "@/lib/firestore";

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "open", label: "열림" },
  { value: "inProgress", label: "처리중" },
  { value: "resolved", label: "해결됨" },
  { value: "closed", label: "종료" },
];

const STATUS_COLORS: Record<string, string> = {
  open: "badge-danger",
  inProgress: "badge-warning",
  resolved: "badge-success",
  closed: "badge-info",
};

const STATUS_LABELS: Record<string, string> = {
  open: "열림",
  inProgress: "처리중",
  resolved: "해결됨",
  closed: "종료",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

export default function AdminSupportPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();

  const [statusFilter, setStatusFilter] = useState("all");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (user && isAdmin) {
      loadTickets();
    }
  }, [user, isAdmin, statusFilter]);

  const loadTickets = async () => {
    setLoadingTickets(true);
    setError("");
    try {
      const result = await getSupportTickets(statusFilter);
      setTickets(result);
    } catch (err) {
      console.error(err);
      setError("티켓 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoadingTickets(false);
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
            ← 관리 홈으로
          </Link>
        </div>
      </div>
    );
  }

  const formatDate = (timestamp: { seconds: number } | null | undefined) => {
    if (!timestamp) return "-";
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1 className="admin-title">고객 지원</h1>
        <Link href="/admin" className="link">
          ← 관리 홈
        </Link>
      </div>

      {/* Status Filter */}
      <div className="card">
        <div className="filter-row">
          <label className="filter-label">상태 필터:</label>
          <div className="filter-buttons">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`filter-btn ${statusFilter === opt.value ? "filter-btn-active" : ""}`}
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ticket List */}
      <div className="card mt-16">
        <h2 className="section-title">
          문의 목록 {!loadingTickets && `(${tickets.length}건)`}
        </h2>

        {error && <p className="error">{error}</p>}

        {loadingTickets ? (
          <div className="loading">로딩 중...</div>
        ) : tickets.length === 0 ? (
          <p className="empty-state">문의가 없습니다.</p>
        ) : (
          <div className="ticket-list">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/admin/support/${ticket.id}`}
                className="ticket-item"
              >
                <div className="ticket-header">
                  <span className={`badge ${STATUS_COLORS[ticket.status]}`}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                  <span className="ticket-priority">
                    {PRIORITY_LABELS[ticket.priority]}
                  </span>
                </div>
                <div className="ticket-subject">{ticket.subject}</div>
                <div className="ticket-meta">
                  <span className="ticket-user">
                    {ticket.userEmail} ({ticket.userType})
                  </span>
                  <span className="ticket-date">{formatDate(ticket.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
