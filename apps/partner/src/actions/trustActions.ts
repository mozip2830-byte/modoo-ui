import { db } from "@/src/firebase";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

import type { PartnerDoc, TrustDoc, TrustFactors } from "@/src/types/models";
import { calcTrustBadge, calcTrustScore, calcTrustTier } from "@/src/lib/trustCalculator";

export function buildTrustDoc(factors: TrustFactors): TrustDoc {
  const { score, breakdown } = calcTrustScore(factors);
  const badge = calcTrustBadge(score);
  const tier = calcTrustTier(score);
  return {
    score,
    badge,
    tier,
    factors,
    breakdown,
    updatedAt: null,
  };
}

export async function refreshPartnerTrust(partnerId: string) {
  if (!partnerId) return;
  const ref = doc(db, "partners", partnerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const partner = snap.data() as PartnerDoc;
  const factors: TrustFactors = {
    businessVerified: partner.businessVerified ?? false,
    profilePhotosCount: partner.trust?.factors?.profilePhotosCount ?? 0,
    reviewCount: partner.trust?.factors?.reviewCount ?? 0,
    reviewAvg: partner.trust?.factors?.reviewAvg ?? 0,
    responseRate7d: partner.trust?.factors?.responseRate7d ?? 0,
    responseTimeMedianMin7d: partner.trust?.factors?.responseTimeMedianMin7d ?? 0,
    reportCount90d: partner.trust?.factors?.reportCount90d ?? 0,
  };

  const trust = buildTrustDoc(factors);
  await updateDoc(ref, {
    trust: {
      ...trust,
      updatedAt: serverTimestamp(),
    },
  });
}

export async function updateTrustOnResponse(partnerId: string, responseMinutes: number) {
  if (!partnerId) return;
  const ref = doc(db, "partners", partnerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const partner = snap.data() as PartnerDoc;
  const factors = partner.trust?.factors ?? {
    businessVerified: partner.businessVerified ?? false,
    profilePhotosCount: 0,
    reviewCount: 0,
    reviewAvg: 0,
    responseRate7d: 0,
    responseTimeMedianMin7d: 0,
    reportCount90d: 0,
  };

  const nextFactors: TrustFactors = {
    ...factors,
    businessVerified: partner.businessVerified ?? false,
    responseRate7d: Math.min(100, Math.max(0, factors.responseRate7d + 5)),
    responseTimeMedianMin7d:
      factors.responseTimeMedianMin7d === 0
        ? responseMinutes
        : Math.round((factors.responseTimeMedianMin7d + responseMinutes) / 2),
  };

  const trust = buildTrustDoc(nextFactors);
  await updateDoc(ref, {
    trust: {
      ...trust,
      updatedAt: serverTimestamp(),
    },
  });
}

export async function increaseReportCount(partnerId: string) {
  if (!partnerId) return;
  const ref = doc(db, "partners", partnerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const partner = snap.data() as PartnerDoc;
  const current = partner.trust?.factors?.reportCount90d ?? 0;
  const nextFactors: TrustFactors = {
    businessVerified: partner.businessVerified ?? false,
    profilePhotosCount: partner.trust?.factors?.profilePhotosCount ?? 0,
    reviewCount: partner.trust?.factors?.reviewCount ?? 0,
    reviewAvg: partner.trust?.factors?.reviewAvg ?? 0,
    responseRate7d: partner.trust?.factors?.responseRate7d ?? 0,
    responseTimeMedianMin7d: partner.trust?.factors?.responseTimeMedianMin7d ?? 0,
    reportCount90d: current + 1,
  };
  const trust = buildTrustDoc(nextFactors);
  await updateDoc(ref, {
    trust: {
      ...trust,
      updatedAt: serverTimestamp(),
    },
  });
}
