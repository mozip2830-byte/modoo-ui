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
  targetPartnerId?: string | null;
  createdAt?: unknown;
};

export type QuoteDoc = {
  id: string;
  requestId: string;
  partnerId: string;
  customerId: string;
  price: number;
  memo?: string | null;
  photoUrls?: string[];
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
  customerPhone?: string | null;
  partnerPhone?: string | null;
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
  type: "text" | "image" | "mixed";
  imageUrls?: string[];
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
  trust?: TrustDoc;
  partnerId?: string;
  name?: string;
  nameLower?: string;
  profileImages?: string[];
  ratingAvg?: number;
  reviewCount?: number;
  trustScore?: number;
  isActive?: boolean;
  approvedStatus?: "준회원" | "정회원" | "보증회원";
  keywords?: string[];
  serviceArea?: string;
};
