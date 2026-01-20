export type RequestStatus = "open" | "closed" | "completed" | "cancelled";
export type QuoteStatus = "submitted" | "accepted" | "declined";

export type RequestDoc = {
  id: string;
  title: string;
  description: string;
  location: string;
  budget: number;
  status: RequestStatus;
  customerId: string;
  selectedPartnerId?: string | null;
  quoteCount?: number;
  isClosed?: boolean;
  createdAt?: unknown;
};

export type QuoteDoc = {
  id: string;
  requestId: string;
  partnerId: string;
  customerId: string;
  price: number;
  memo?: string | null;
  status: QuoteStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type PartnerPhotoDoc = {
  id: string;
  url: string;
  thumbUrl?: string | null;
  thumbPath?: string | null;
  storagePath: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  createdAt?: unknown;
  isPrimary?: boolean;
  order?: number;
};

export type ReviewDoc = {
  id: string;
  partnerId: string;
  customerId: string;
  rating: number;
  text: string;
  photoCount?: number;
  createdAt?: unknown;
};

export type ReviewPhotoDoc = {
  id: string;
  url: string;
  thumbUrl?: string | null;
  thumbPath?: string | null;
  storagePath: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  createdAt?: unknown;
};

export type ChatDoc = {
  id: string;
  requestId: string;
  customerId: string;
  partnerId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastMessageText?: string | null;
  lastMessageAt?: unknown | null;
  lastReadAtCustomer?: unknown | null;
  lastReadAtPartner?: unknown | null;
  unreadPartner: number;
  unreadCustomer: number;
  customerHidden?: boolean;
  partnerHidden?: boolean;
  status?: "open" | "closed";
};

export type MessageDoc = {
  id: string;
  senderRole: "partner" | "customer";
  senderId: string;
  text: string;
  type: "text";
  createdAt?: unknown;
};

export type NotificationType =
  | "quote_received"
  | "chat_received"
  | "points_low"
  | "points_charged"
  | "subscription_active"
  | "subscription_expired"
  | "trust_updated"
  | "system";

export type NotificationDoc = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt?: unknown;
};

export type PointsInfo = {
  balance: number;
  updatedAt?: unknown | null;
};

export type SubscriptionStatus = "none" | "active" | "expired" | "past_due" | "canceled";
export type SubscriptionPlan = "trial_3d" | "trial_7d" | "month" | "month_auto";

export type SubscriptionInfo = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  autoRenew: boolean;
  discountRate: number;
  currentPeriodStart?: unknown | null;
  currentPeriodEnd?: unknown | null;
  nextBillingAt?: unknown | null;
  provider?: "kakaopay" | "toss" | "card" | "bank" | "manual" | null;
};

export type TrustBadge = "NEW" | "BASIC" | "TRUSTED" | "TOP";
export type TrustTier = "A" | "B" | "C";

export type TrustFactors = {
  businessVerified: boolean;
  profilePhotosCount: number;
  reviewCount: number;
  reviewAvg: number;
  responseRate7d: number;
  responseTimeMedianMin7d: number;
  reportCount90d: number;
};

export type TrustDoc = {
  score: number;
  badge: TrustBadge;
  tier: TrustTier;
  factors: TrustFactors;
  breakdown?: {
    businessScore: number;
    photoScore: number;
    reviewScore: number;
    ratingScore: number;
    responseRateScore: number;
    responseTimeScore: number;
    reportPenalty: number;
  };
  updatedAt?: unknown | null;
};

export type PartnerDoc = {
  id: string;
  tier?: "associate" | "member" | "premium";
  businessVerified?: boolean;
  approvedStatus?: "준회원" | "정회원" | "보증회원";
  name?: string;
  nameLower?: string;
  profileImages?: string[];
  ratingAvg?: number;
  reviewCount?: number;
  trustScore?: number;
  isActive?: boolean;
  serviceArea?: string;
  companyName?: string;
  serviceCategories?: string[];
  serviceRegions?: string[];
  points?: PointsInfo;
  subscription?: SubscriptionInfo;
  trust?: TrustDoc;
  updatedAt?: unknown;
};

export type PartnerUserDoc = {
  id: string;
  uid: string;
  email: string;
  role: "partner";
  grade: "준회원" | "정회원" | "보증회원";
  verificationStatus: "미제출" | "검수중" | "승인" | "반려";
  profileCompleted: boolean;
  businessVerified: boolean;
  verificationUpdatedAt?: unknown | null;
  createdAt?: unknown;
  // SSOT for entitlement (points & subscription)
  points?: number;
  subscriptionStatus?: "active" | "inactive" | "expired" | "cancelled" | "none";
  subscriptionPlan?: string;
};

export type PartnerPaymentType = "charge" | "subscription" | "refund" | "debit";

export type PartnerPaymentDoc = {
  id: string;
  type: PartnerPaymentType;
  provider: "kakaopay" | "toss" | "card" | "bank" | "manual";
  amountSupplyKRW: number;
  amountPayKRW: number;
  basePoints?: number;
  bonusPoints?: number;
  creditedPoints?: number;
  status: "pending" | "paid" | "failed" | "canceled" | "refunded";
  createdAt?: unknown;
};

export type PartnerPointLedgerDoc = {
  id: string;
  type: "credit_charge" | "debit_quote" | "credit_bonus" | "refund";
  deltaPoints: number;
  balanceAfter: number;
  amountPayKRW?: number;
  orderId?: string;
  requestId?: string;
  createdAt?: unknown;
};

