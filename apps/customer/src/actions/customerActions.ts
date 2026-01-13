import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../firebase';

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

type SendMessageInput = {
  roomId: string;
  senderId: string;
  text: string;
};

export async function createRequest(input: CreateRequestInput) {
  const payload = {
    title: input.title,
    description: input.description,
    location: input.location,
    budget: input.budget,
    customerId: input.customerId,
    status: 'open' as const,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'requests'), payload);
  return docRef.id;
}

export async function acceptQuote(input: AcceptQuoteInput) {
  const quoteRef = doc(db, 'quotes', input.quoteId);
  const requestRef = doc(db, 'requests', input.requestId);

  const batch = writeBatch(db);
  batch.update(quoteRef, { status: 'accepted' });
  batch.update(requestRef, { status: 'matched' });

  const otherQuotesQuery = query(
    collection(db, 'quotes'),
    where('requestId', '==', input.requestId)
  );
  const otherQuotes = await getDocs(otherQuotesQuery);
  otherQuotes.forEach((quoteSnap) => {
    if (quoteSnap.id !== input.quoteId) {
      batch.update(quoteSnap.ref, { status: 'rejected' });
    }
  });

  await batch.commit();

  const roomQuery = query(
    collection(db, 'rooms'),
    where('requestId', '==', input.requestId),
    where('partnerId', '==', input.partnerId),
    where('customerId', '==', input.customerId)
  );
  const roomSnapshot = await getDocs(roomQuery);
  let roomId: string;

  if (!roomSnapshot.empty) {
    roomId = roomSnapshot.docs[0].id;
  } else {
    const roomPayload = {
      requestId: input.requestId,
      partnerId: input.partnerId,
      customerId: input.customerId,
      quoteId: input.quoteId,
      createdAt: serverTimestamp(),
    };
    const roomRef = await addDoc(collection(db, 'rooms'), roomPayload);
    roomId = roomRef.id;
  }

  await addDoc(collection(db, 'rooms', roomId, 'messages'), {
    senderId: input.customerId,
    text: '채팅이 시작되었습니다.',
    createdAt: serverTimestamp(),
  });

  return roomId;
}

export async function sendMessage(input: SendMessageInput) {
  const messageRef = await addDoc(collection(db, 'rooms', input.roomId, 'messages'), {
    senderId: input.senderId,
    text: input.text,
    createdAt: serverTimestamp(),
  });
  return messageRef.id;
}
