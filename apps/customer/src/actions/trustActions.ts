import { db } from "@/src/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import type { PartnerDoc, TrustFactors, TrustDoc } from "@/src/types/models";
import { calcTrustBadge, calcTrustScore, calcTrustTier } from "@/src/lib/trustCalculator";

export async function updatePartnerTrustFromReview(partnerId: string, rating: number) {
  if (!partnerId) return;
  const partnerRef = doc(db, "partners", partnerId);
  const snap = await getDoc(partnerRef);
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

  const nextCount = factors.reviewCount + 1;
  const nextAvg = nextCount === 1 ? rating : (factors.reviewAvg * factors.reviewCount + rating) / nextCount;

  const nextFactors: TrustFactors = {
    ...factors,
    reviewCount: nextCount,
    reviewAvg: Math.round(nextAvg * 10) / 10,
  };

  const { score, breakdown } = calcTrustScore(nextFactors);
  const trust: TrustDoc = {
    score,
    badge: calcTrustBadge(score),
    tier: calcTrustTier(score),
    factors: nextFactors,
    breakdown,
    updatedAt: null,
  };

  await setDoc(
    partnerRef,
    {
      ratingAvg: trust.factors.reviewAvg,
      reviewCount: trust.factors.reviewCount,
      trust: {
        ...trust,
        updatedAt: serverTimestamp(),
      },
    },
    { merge: true }
  );
}
