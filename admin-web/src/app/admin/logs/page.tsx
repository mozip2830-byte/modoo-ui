"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import {
  getPartnerTicketLogs,
  searchPartnerUsers,
  PartnerTicketLog,
  PartnerUser,
} from "@/lib/firestore";

function formatDate(value?: { toDate?: () => Date } | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : value.toDate?.();
  if (!date) return "-";
  return date.toLocaleString("ko-KR");
}

function renderTypeLabel(type?: PartnerTicketLog["type"]) {
  switch (type) {
    case "use":
      return "입찰권 사용";
    case "charge":
      return "입찰권 충전";
    case "refund":
      return "중복 입찰 반환";
    case "deduct":
      return "입찰권 차감";
    case "set":
      return "수동 설정";
    default:
      return "-";
  }
}

export default function AdminLogsPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [partnerResults, setPartnerResults] = useState<PartnerUser[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerUser | null>(null);
  const [logType, setLogType] = useState<"all" | PartnerTicketLog["type"]>("all");
  const [logs, setLogs] = useState<PartnerTicketLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!selectedPartner) {
      setLogs([]);
      return;
    }
    const run = async () => {
      setLoadingLogs(true);
      setError("");
      try {
        const types = logType === "all" ? undefined : [logType];
        const data = await getPartnerTicketLogs({
          partnerId: selectedPartner.uid,
          types,
          limitCount: 200,
        });
        setLogs(data);
      } catch (err) {
        console.error(err);
        setError("로그를 불러오지 못했습니다.");
      } finally {
        setLoadingLogs(false);
      }
    };
    run();
  }, [selectedPartner, logType]);

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

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setSearching(true);
    setError("");
    setPartnerResults([]);
    setSelectedPartner(null);

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

  const selectedLabel = useMemo(() => {
    if (!selectedPartner) return "선택된 파트너 없음";
    return `${selectedPartner.email ?? "-"} (${selectedPartner.uid})`;
  }, [selectedPartner]);

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1 className="admin-title">입찰권 로그</h1>
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
                <button className="btn-edit" onClick={() => setSelectedPartner(pu)}>
                  선택
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-16">
        <div className="info-row">
          <span className="info-label">선택 파트너</span>
          <span className="info-value">{selectedLabel}</span>
        </div>
        <div className="form-group mt-16">
          <label className="label">로그 타입</label>
          <select
            className="input"
            value={logType}
            onChange={(e) => setLogType(e.target.value as typeof logType)}
          >
            <option value="all">전체</option>
            <option value="use">입찰권 사용</option>
            <option value="charge">입찰권 충전</option>
            <option value="refund">중복 입찰 반환</option>
            <option value="deduct">입찰권 차감</option>
            <option value="set">수동 설정</option>
          </select>
        </div>
      </div>

      <div className="card mt-16">
        <h2 className="section-title">로그 목록</h2>
        {loadingLogs ? (
          <div className="loading">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <p className="subtitle">표시할 로그가 없습니다.</p>
        ) : (
          <div className="user-list">
            {logs.map((log) => (
              <div key={log.id} className="user-item">
                <div className="user-info">
                  <div className="user-email">{renderTypeLabel(log.type)}</div>
                  <div className="user-uid">{formatDate(log.createdAt)}</div>
                  <div className="user-uid">파트너: {log.partnerId}</div>
                  {log.requestId ? <div className="user-uid">요청: {log.requestId}</div> : null}
                  {log.adminEmail ? <div className="user-uid">관리자: {log.adminEmail}</div> : null}
                </div>
                <div className="user-meta">
                  <span className="badge badge-info">
                    종류: {log.ticketType === "service" ? "서비스" : "일반"}
                  </span>
                  <span className="badge badge-points">수량 {log.amount}</span>
                  {typeof log.beforeBalance === "number" && typeof log.afterBalance === "number" ? (
                    <span className="badge badge-info">
                      {log.beforeBalance} → {log.afterBalance}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
