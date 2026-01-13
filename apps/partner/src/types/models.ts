export type RequestStatus = 'open' | 'matched' | 'closed';
export type QuoteStatus = 'submitted' | 'accepted' | 'rejected';

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

export type MessageDoc = {
  id: string;
  senderId: string;
  text: string;
  createdAt?: unknown;
};
