export const VAT_RATE = 0.1;
export const BASE_TICKET_PRICE = 11000;
export const BASE_TICKETS_PER_UNIT = 3;
export const BONUS_TICKET_PRICE = 33000;
export const BONUS_TICKETS_PER_UNIT = 1;

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
  const basePoints = Math.floor(safeSupply / BASE_TICKET_PRICE) * BASE_TICKETS_PER_UNIT;
  const bonusPoints = Math.floor(safeSupply / BONUS_TICKET_PRICE) * BONUS_TICKETS_PER_UNIT;
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
