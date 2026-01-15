"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSupportTicket,
  getTicketMessages,
  addTicketMessage,
  updateTicketStatus,
  SupportTicket,
  TicketMessage,
} from "@/lib/firestore";

const STATUS_OPTIONS: { value: SupportTicket["status"]; label: string }[] = [
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

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;
  const { user, loading, isAdmin } = useAuth();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  // Reply form
  const [replyContent, setReplyContent] = useState("");
  const [sending, setSending] = useState(false);

  // Status change
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (user && isAdmin && ticketId) {
      loadTicketData();
    }
  }, [user, isAdmin, ticketId]);

  const loadTicketData = async () => {
    setLoadingData(true);
    setError("");
    try {
      const [ticketData, messagesData] = await Promise.all([
        getSupportTicket(ticketId),
        getTicketMessages(ticketId),
      ]);

      if (!ticketData) {
        setError("티켓을 찾을 수 없습니다.");
        return;
      }

      setTicket(ticketData);
      setMessages(messagesData);
    } catch (err) {
      console.error(err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoadingData(false);
    }
  };

  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !user || !ticket) return;

    setSending(true);
    setError("");
    try {
      await addTicketMessage(ticketId, {
        senderId: user.uid,
        senderType: "admin",
        senderEmail: user.email || "",
        content: replyContent.trim(),
      });

      setReplyContent("");
      // Refresh messages
      const messagesData = await getTicketMessages(ticketId);
      setMessages(messagesData);
    } catch (err) {
      console.error(err);
      setError("답변 전송 중 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: SupportTicket["status"]) => {
    if (!user || !ticket) return;

    setChangingStatus(true);
    setError("");
    try {
      await updateTicketStatus(ticketId, newStatus, user.uid, user.email || "");
      // Refresh ticket
      const ticketData = await getSupportTicket(ticketId);
      setTicket(ticketData);
    } catch (err) {
      console.error(err);
      setError("상태 변경 중 오류가 발생했습니다.");
    } finally {
      setChangingStatus(false);
    }
  };

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

  if (loading || loadingData) {
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

  if (!ticket) {
    return (
      <div className="admin-container">
        <div className="card">
          <h1 className="title">티켓 없음</h1>
          <p>{error || "티켓을 찾을 수 없습니다."}</p>
          <Link href="/admin/support" className="link mt-16">
            ← 문의 목록으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1 className="admin-title">문의 상세</h1>
        <Link href="/admin/support" className="link">
          ← 목록으로
        </Link>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Ticket Info */}
      <div className="card">
        <div className="ticket-detail-header">
          <h2 className="ticket-detail-subject">{ticket.subject}</h2>
          <span className={`badge ${STATUS_COLORS[ticket.status]}`}>
            {STATUS_LABELS[ticket.status]}
          </span>
        </div>

        <div className="ticket-detail-meta">
          <div className="info-row">
            <span className="info-label">문의자</span>
            <span className="info-value">{ticket.userEmail}</span>
          </div>
          <div className="info-row">
            <span className="info-label">유형</span>
            <span className="info-value">{ticket.userType}</span>
          </div>
          <div className="info-row">
            <span className="info-label">생성일</span>
            <span className="info-value">{formatDate(ticket.createdAt)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">티켓 ID</span>
            <span className="info-value" style={{ fontSize: 12 }}>{ticket.id}</span>
          </div>
        </div>

        {/* Status Change */}
        <div className="status-change-section">
          <label className="filter-label">상태 변경:</label>
          <div className="filter-buttons">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`filter-btn ${ticket.status === opt.value ? "filter-btn-active" : ""}`}
                onClick={() => handleStatusChange(opt.value)}
                disabled={changingStatus || ticket.status === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages Timeline */}
      <div className="card mt-16">
        <h3 className="section-title">대화 내역</h3>
        <div className="message-timeline">
          {messages.length === 0 ? (
            <p className="empty-state">메시지가 없습니다.</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.senderType === "admin" ? "message-admin" : "message-user"}`}
              >
                <div className="message-header">
                  <span className="message-sender">
                    {msg.senderType === "admin" ? "관리자" : "사용자"} ({msg.senderEmail})
                  </span>
                  <span className="message-time">{formatDate(msg.createdAt)}</span>
                </div>
                <div className="message-content">{msg.content}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Reply Form */}
      <div className="card mt-16">
        <h3 className="section-title">답변 작성</h3>
        <form onSubmit={handleSendReply}>
          <textarea
            className="input textarea"
            placeholder="답변을 입력하세요..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            rows={4}
          />
          <button
            type="submit"
            className="btn btn-primary mt-16"
            disabled={sending || !replyContent.trim()}
          >
            {sending ? "전송 중..." : "답변 전송"}
          </button>
        </form>
      </div>
    </div>
  );
}
