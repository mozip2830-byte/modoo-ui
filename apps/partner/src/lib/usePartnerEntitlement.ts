import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "@/src/firebase";
import type { PartnerDoc } from "@/src/types/models";
import { refreshSubscriptionStatus } from "@/src/lib/subscriptionScheduler";

type PartnerEntitlement = {
  loading: boolean;
  error: string | null;
  partner: PartnerDoc | null;
  pointsBalance: number;
  subscriptionActive: boolean;
};

export function usePartnerEntitlement(partnerId?: string | null): PartnerEntitlement {
  const [partner, setPartner] = useState<PartnerDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId) {
      setPartner(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "partners", partnerId),
      (snap) => {
        if (!snap.exists()) {
          setPartner(null);
          setError("파트너 정보를 찾을 수 없습니다.");
        } else {
          const data = snap.data() as Omit<PartnerDoc, "id">;
          setPartner({ id: snap.id, ...data });
          refreshSubscriptionStatus(snap.id, data.subscription).catch((err) => {
            console.error("[partner][subscription] refresh error", err);
          });
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
    const balance = partner?.points?.balance ?? 0;
    const subscriptionActive = partner?.subscription?.status === "active";
    return {
      loading,
      error,
      partner,
      pointsBalance: balance,
      subscriptionActive,
    };
  }, [loading, error, partner]);
}
