import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { db } from "@/src/firebase";
import type { PartnerUserDoc } from "@/src/types/models";

type PartnerEntitlement = {
  loading: boolean;
  error: string | null;
  partnerUser: PartnerUserDoc | null;
  pointsBalance: number;
  generalTickets: number;
  serviceTickets: number;
  totalTickets: number;
  subscriptionActive: boolean;
};

/**
 * SSOT: partnerUsers/{uid} 기준으로 entitlement(포인트/구독) 상태를 읽는다.
 * - pointsBalance: partnerUsers.points (Number, 없으면 0)
 * - subscriptionActive: partnerUsers.subscriptionStatus === "active"
 */
export function usePartnerEntitlement(partnerId?: string | null): PartnerEntitlement {
  const [partnerUser, setPartnerUser] = useState<PartnerUserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId) {
      setPartnerUser(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "partnerUsers", partnerId),
      (snap) => {
        if (!snap.exists()) {
          setPartnerUser(null);
          setError("파트너 정보를 찾을 수 없습니다.");
        } else {
          const data = snap.data() as Omit<PartnerUserDoc, "id">;
          setPartnerUser({ id: snap.id, ...data });
          setError(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[partner][entitlement] load error", err);
        setError("파트너 정보를 불러오지 못했습니다.");
        setLoading(false);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  return useMemo(() => {
    // SSOT: partnerUsers의 flat 필드 사용
    const legacyPoints = Number(partnerUser?.points ?? 0);
    const generalTickets = Number(partnerUser?.bidTickets?.general ?? legacyPoints);
    const serviceTickets = Number(partnerUser?.bidTickets?.service ?? partnerUser?.serviceTickets ?? 0);
    const pointsBalance = generalTickets;
    const subscriptionActive = partnerUser?.subscriptionStatus === "active";

    return {
      loading,
      error,
      partnerUser,
      pointsBalance,
      generalTickets,
      serviceTickets,
      totalTickets: generalTickets + serviceTickets,
      subscriptionActive,
    };
  }, [loading, error, partnerUser]);
}

// 하위 호환성을 위한 alias (기존 코드에서 partner 필드를 사용하는 경우)
export function usePartnerEntitlementCompat(partnerId?: string | null) {
  const result = usePartnerEntitlement(partnerId);
  return {
    ...result,
    partner: result.partnerUser, // alias for backward compatibility
  };
}
