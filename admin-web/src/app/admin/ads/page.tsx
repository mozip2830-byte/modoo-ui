"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import {
  getPartnerAdBids,
  getPartnerAdPlacements,
  PartnerAdBid,
  PartnerAdPlacement,
} from "@/lib/firestore";

function formatDate(value?: { toDate?: () => Date } | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : value.toDate?.();
  if (!date) return "-";
  return date.toLocaleString("ko-KR");
}

function normalize(value?: string | null) {
  return (value ?? "").trim();
}

export default function AdminAdsPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();

  const [bids, setBids] = useState<PartnerAdBid[]>([]);
  const [placements, setPlacements] = useState<PartnerAdPlacement[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  const [category, setCategory] = useState("all");
  const [region, setRegion] = useState("all");
  const [weekKey, setWeekKey] = useState("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const run = async () => {
      setLoadingData(true);
      setError("");
      try {
        const [bidData, placementData] = await Promise.all([
          getPartnerAdBids(400),
          getPartnerAdPlacements(400),
        ]);
        setBids(bidData);
        setPlacements(placementData);
      } catch (err) {
        console.error(err);
        setError("입찰 데이터를 불러오지 못했습니다.");
      } finally {
        setLoadingData(false);
      }
    };
    run();
  }, [user, isAdmin]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    bids.forEach((bid) => bid.category && set.add(bid.category));
    placements.forEach((item) => item.category && set.add(item.category));
    return ["all", ...Array.from(set)];
  }, [bids, placements]);

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    bids.forEach((bid) => bid.regionKey && set.add(bid.regionKey));
    bids.forEach((bid) => bid.region && set.add(bid.region));
    placements.forEach((item) => item.regionKey && set.add(item.regionKey));
    placements.forEach((item) => item.region && set.add(item.region));
    return ["all", ...Array.from(set)];
  }, [bids, placements]);

  const weekOptions = useMemo(() => {
    const set = new Set<string>();
    bids.forEach((bid) => bid.weekKey && set.add(bid.weekKey));
    placements.forEach((item) => item.weekKey && set.add(item.weekKey));
    return ["all", ...Array.from(set).sort().reverse()];
  }, [bids, placements]);

  const filteredBids = useMemo(() => {
    return bids.filter((bid) => {
      if (category !== "all" && bid.category !== category) return false;
      const bidRegion = normalize(bid.regionKey ?? bid.region);
      if (region !== "all" && bidRegion !== region) return false;
      if (weekKey !== "all" && bid.weekKey !== weekKey) return false;
      if (status !== "all" && bid.status !== status) return false;
      return true;
    });
  }, [bids, category, region, weekKey, status]);

  const filteredPlacements = useMemo(() => {
    return placements.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      const itemRegion = normalize(item.regionKey ?? item.region);
      if (region !== "all" && itemRegion !== region) return false;
      if (weekKey !== "all" && item.weekKey !== weekKey) return false;
      return true;
    });
  }, [placements, category, region, weekKey]);

  const winnersByWeek = useMemo(() => {
    const map = new Map<string, PartnerAdPlacement[]>();
    filteredPlacements.forEach((item) => {
      const key = item.weekKey ?? "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      items: items.sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0)),
    }));
  }, [filteredPlacements]);

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
        <h1 className="admin-title">광고 입찰 현황</h1>
        <Link href="/admin" className="link">
          관리자 홈
        </Link>
      </div>

      <div className="card">
        <h2 className="section-title">검색 필터</h2>
        <div className="form-grid">
          <div className="form-group">
            <label className="label">카테고리</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "전체" : item}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">지역</label>
            <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
              {regionOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "전체" : item}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">주차</label>
            <select className="input" value={weekKey} onChange={(e) => setWeekKey(e.target.value)}>
              {weekOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "전체" : item}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">상태</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">전체</option>
              <option value="pending">진행중</option>
              <option value="won">낙찰</option>
              <option value="lost">탈락</option>
              <option value="late">마감 이후</option>
            </select>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {loadingData && <p className="subtitle">데이터를 불러오는 중...</p>}
      </div>

      <div className="card mt-16">
        <h2 className="section-title">입찰 진행</h2>
        {filteredBids.length === 0 ? (
          <p className="subtitle">표시할 입찰이 없습니다.</p>
        ) : (
          <div className="table">
            <div className="table-row table-header">
              <div>파트너</div>
              <div>카테고리</div>
              <div>지역</div>
              <div>금액</div>
              <div>상태</div>
              <div>등록일</div>
            </div>
            {filteredBids.map((bid) => (
              <div key={bid.id} className="table-row">
                <div className="table-cell">{bid.partnerId}</div>
                <div className="table-cell">{bid.category ?? "-"}</div>
                <div className="table-cell">{bid.regionKey ?? bid.region ?? "-"}</div>
                <div className="table-cell">{Number(bid.amount ?? 0).toLocaleString()}P</div>
                <div className="table-cell">{bid.status ?? "-"}</div>
                <div className="table-cell">{formatDate(bid.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mt-16">
        <h2 className="section-title">입찰 결과</h2>
        {filteredPlacements.length === 0 ? (
          <p className="subtitle">표시할 결과가 없습니다.</p>
        ) : (
          <div className="table">
            <div className="table-row table-header">
              <div>주차</div>
              <div>순위</div>
              <div>파트너</div>
              <div>카테고리</div>
              <div>지역</div>
              <div>금액</div>
              <div>배치일</div>
            </div>
            {filteredPlacements.map((item) => (
              <div key={item.id} className="table-row">
                <div className="table-cell">{item.weekKey ?? "-"}</div>
                <div className="table-cell">{item.rank ?? "-"}</div>
                <div className="table-cell">{item.partnerId}</div>
                <div className="table-cell">{item.category ?? "-"}</div>
                <div className="table-cell">{item.regionKey ?? item.region ?? "-"}</div>
                <div className="table-cell">{Number(item.amount ?? 0).toLocaleString()}P</div>
                <div className="table-cell">{formatDate(item.placedAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mt-16">
        <h2 className="section-title">주별 낙찰 업체</h2>
        {winnersByWeek.length === 0 ? (
          <p className="subtitle">주별 데이터가 없습니다.</p>
        ) : (
          <div className="user-list">
            {winnersByWeek.map((group) => (
              <div key={group.key} className="user-item">
                <div className="user-info">
                  <div className="user-email">{group.key}</div>
                  <div className="user-uid">
                    총 {group.items.length}건 낙찰
                  </div>
                  <div className="user-uid">
                    {group.items
                      .map((item) => `${item.rank ?? "-"}등: ${item.partnerId}`)
                      .join(", ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
