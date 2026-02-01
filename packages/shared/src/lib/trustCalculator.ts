import type { TrustBadge, TrustFactors, TrustTier } from "../types/models";

export type TrustBreakdown = {
  businessScore: number;
  photoScore: number;
  reviewScore: number;
  ratingScore: number;
  responseRateScore: number;
  responseTimeScore: number;
  reportPenalty: number;
};

export function calcTrustScore(factors: TrustFactors) {
  const businessScore = factors.businessVerified ? 25 : 0;
  const photos = Math.min(20, Math.max(0, factors.profilePhotosCount || 0));
  const reviews = Math.min(50, Math.max(0, factors.reviewCount || 0));
  const reviewAvg = Math.min(5, Math.max(0, factors.reviewAvg || 0));
  const responseRate = Math.min(100, Math.max(0, factors.responseRate7d || 0));
  const responseTime = Math.max(0, factors.responseTimeMedianMin7d || 0);
  const reportCount = Math.min(10, Math.max(0, factors.reportCount90d || 0));

  const photoScore = Math.round((photos / 20) * 15);
  const reviewScore = Math.round((reviews / 50) * 20);
  const ratingScore = Math.round((reviewAvg / 5) * 20);
  const responseRateScore = Math.round((responseRate / 100) * 10);
  const responseTimeScore = responseTime === 0 ? 0 : responseTime <= 30 ? 10 : responseTime <= 60 ? 6 : 3;
  const reportPenalty = reportCount * 3;

  const score = Math.max(
    0,
    Math.min(100, businessScore + photoScore + reviewScore + ratingScore + responseRateScore + responseTimeScore - reportPenalty)
  );

  return {
    score,
    breakdown: {
      businessScore,
      photoScore,
      reviewScore,
      ratingScore,
      responseRateScore,
      responseTimeScore,
      reportPenalty,
    },
  };
}

export function calcTrustBadge(score: number): TrustBadge {
  if (score >= 85) return "TOP";
  if (score >= 60) return "TRUSTED";
  if (score >= 30) return "BASIC";
  return "NEW";
}

export function calcTrustTier(score: number): TrustTier {
  if (score >= 85) return "A";
  if (score >= 60) return "B";
  return "C";
}
