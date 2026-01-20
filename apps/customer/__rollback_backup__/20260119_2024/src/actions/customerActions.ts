import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase";

type CreateRequestInput = {
  title: string;
  description: string;
  location: string;
  budget: number;
  customerId: string;
};

type AcceptQuoteInput = {
  quoteId: string;
  requestId: string;
  partnerId: string;
  customerId: string;
};

export async function createRequest(input: CreateRequestInput) {
  const payload = {
    title: input.title,
    description: input.description,
    location: input.location,
    budget: input.budget,
    customerId: input.customerId,
    status: "open" as const,
    selectedPartnerId: null,
    quoteCount: 0,
    isClosed: false,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "requests"), payload);
  return docRef.id;
}

export async function acceptQuote(input: AcceptQuoteInput) {
  const requestRef = doc(db, "requests", input.requestId);
  await updateDoc(requestRef, {
    selectedPartnerId: input.partnerId,
    updatedAt: serverTimestamp(),
  });

  return input.requestId;
}
