import {
  addDoc,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/src/firebase';

type GetOrCreateRoomInput = {
  requestId: string;
  partnerId: string;
  customerId: string;
  quoteId?: string;
};

type SendRoomMessageInput = {
  roomId: string;
  senderId: string;
  text: string;
};

export function buildRoomId(requestId: string, partnerId: string) {
  return `r_${requestId}__p_${partnerId}`;
}

export async function getOrCreateRoom(input: GetOrCreateRoomInput) {
  const roomId = buildRoomId(input.requestId, input.partnerId);
  const roomRef = doc(db, 'rooms', roomId);

  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(roomRef);
    if (!snapshot.exists()) {
      const participants = {
        [input.partnerId]: true,
        [input.customerId]: true,
      };

      tx.set(roomRef, {
        requestId: input.requestId,
        partnerId: input.partnerId,
        customerId: input.customerId,
        ...(input.quoteId ? { quoteId: input.quoteId } : {}),
        participants,
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
      });
    }
  });

  return roomId;
}

export async function sendRoomMessage(input: SendRoomMessageInput) {
  const messageRef = await addDoc(
    collection(db, 'rooms', input.roomId, 'messages'),
    {
      text: input.text,
      senderId: input.senderId,
      createdAt: serverTimestamp(),
      type: 'text',
    }
  );

  await updateDoc(doc(db, 'rooms', input.roomId), {
    lastMessage: input.text,
    lastSenderId: input.senderId,
    lastMessageAt: serverTimestamp(),
    status: 'active',
  });

  return messageRef.id;
}
