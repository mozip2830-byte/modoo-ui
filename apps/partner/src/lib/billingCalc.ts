export const VAT_RATE = 0.1;
export const BASE_TICKET_PRICE = 11000;
export const BASE_TICKETS_PER_UNIT = 3;
export const BONUS_TICKET_PRICE = 33000;
export const BONUS_TICKETS_PER_UNIT = 1;
export const TICKET_PRICE_MARKUP_RATE = 0.3;
export const POINTS_SERVICE_FEE_RATE = 0.3;

export type BidTicketBilling = {
  amountSupplyKRW: number;
  amountPayKRW: number;
  vatRate: number;
  markupRate: number;
  basePoints: number;
  bonusPoints: number;
  creditedPoints: number;
};

export type CashPointBilling = {
  displayAmountKRW: number;
  amountSupplyKRW: number;
  amountPayKRW: number;
  vatRate: number;
  serviceFeeRate: number;
  creditedPoints: number;
};

export function calcBidTicketBilling(amountSupplyKRW: number): BidTicketBilling {
  const safeSupply = Math.max(0, Math.floor(amountSupplyKRW || 0));
  const amountPayKRW = Math.round(safeSupply * (1 + VAT_RATE) * (1 + TICKET_PRICE_MARKUP_RATE));
  const basePoints = Math.floor(safeSupply / BASE_TICKET_PRICE) * BASE_TICKETS_PER_UNIT;
  const bonusPoints = Math.floor(safeSupply / BONUS_TICKET_PRICE) * BONUS_TICKETS_PER_UNIT;
  const creditedPoints = basePoints + bonusPoints;

  return {
    amountSupplyKRW: safeSupply,
    amountPayKRW,
    vatRate: VAT_RATE,
    markupRate: TICKET_PRICE_MARKUP_RATE,
    basePoints,
    bonusPoints,
    creditedPoints,
  };
}

export function calcCashPointBilling(displayAmountKRW: number): CashPointBilling {
  const safeDisplay = Math.max(0, Math.floor(displayAmountKRW || 0));
  const amountSupplyKRW = Math.round(safeDisplay * (1 + POINTS_SERVICE_FEE_RATE));
  const amountPayKRW = Math.round(amountSupplyKRW * (1 + VAT_RATE));

  return {
    displayAmountKRW: safeDisplay,
    amountSupplyKRW,
    amountPayKRW,
    vatRate: VAT_RATE,
    serviceFeeRate: POINTS_SERVICE_FEE_RATE,
    creditedPoints: safeDisplay,
  };
}
