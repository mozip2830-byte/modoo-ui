export const VAT_RATE = 0.1;
export const POINTS_PER_KRW = 100;
export const BONUS_RATE = 0.1;

export type BillingCalcResult = {
  amountSupplyKRW: number;
  amountPayKRW: number;
  vatRate: number;
  basePoints: number;
  bonusPoints: number;
  creditedPoints: number;
};

export function calcBilling(amountSupplyKRW: number): BillingCalcResult {
  const safeSupply = Math.max(0, Math.floor(amountSupplyKRW || 0));
  const amountPayKRW = Math.round(safeSupply * (1 + VAT_RATE));
  const basePoints = Math.floor(amountPayKRW / POINTS_PER_KRW);
  const bonusPoints = Math.floor(basePoints * BONUS_RATE);
  const creditedPoints = basePoints + bonusPoints;

  return {
    amountSupplyKRW: safeSupply,
    amountPayKRW,
    vatRate: VAT_RATE,
    basePoints,
    bonusPoints,
    creditedPoints,
  };
}
