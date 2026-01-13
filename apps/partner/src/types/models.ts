export type RequestStatus = 'open' | 'matched' | 'closed';
export type QuoteStatus = 'submitted' | 'withdrawn' | 'accepted' | 'rejected';

export type RequestDoc = {
  id: string;
  title: string;
  description: string;
  location: string;
  budget: number;
  status: RequestStatus;
  customerId: string;
  createdAt?: unknown;
};

export type QuoteDoc = {
  id: string;
  requestId: string;
  partnerId: string;
  price: number;
  message: string;
  status: QuoteStatus;
  createdAt?: unknown;
};

export type RoomDoc = {
  id: string;
  requestId: string;
  customerId: string;
  partnerId: string;
  quoteId: string;
  createdAt?: unknown;
};

export type RoomMessageDoc = {
  id: string;
  senderId: string;
  text: string;
  createdAt?: unknown;
};

export type ChatDoc = {
  id: string;
  requestId: string;
  partnerId: string;
  customerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastMessageText?: string | null;
  lastMessageAt?: unknown | null;
  unreadPartner: number;
  unreadCustomer: number;
  customerHidden?: boolean;
  partnerHidden?: boolean;
  status?: 'open' | 'closed';
};

export type MessageDoc = {
  id: string;
  senderRole: 'partner' | 'customer';
  senderId: string;
  text: string;
  type: 'text' | 'image';
  imageUrl?: string | null;
  imagePath?: string | null;
  deletedForPartner?: boolean;
  deletedForCustomer?: boolean;
  createdAt?: unknown;
};
