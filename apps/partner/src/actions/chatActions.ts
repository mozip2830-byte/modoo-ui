import { db } from "@/src/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import type { ChatDoc, MessageDoc, QuoteDoc, RequestDoc } from "@/src/types/models";
import { upsertChatNotification } from "@/src/actions/notificationActions";

type EnsureChatInput = {
  requestId: string;
  role: "customer" | "partner";
  uid: string;
  partnerId?: string;
};

type SendMessageInput = {
  chatId: string;
  senderRole: "partner" | "customer";
  senderId: string;
  text: string;
};

type UpdateChatReadInput = {
  chatId: string;
  role: "customer" | "partner";
};

type SubscribeChatInput = {
  chatId: string;
  onData: (chat: ChatDoc | null) => void;
  onError?: (error: unknown) => void;
};

export function buildChatId(requestId: string, partnerId: string, customerId: string) {
  return `${requestId}_${partnerId}_${customerId}`;
}

async function ensureQuoteExists(requestId: string, partnerId: string) {
  const quoteSnap = await getDoc(doc(db, "requests", requestId, "quotes", partnerId));
  if (!quoteSnap.exists()) throw new Error("견적을 찾을 수 없습니다.");
  return quoteSnap.data() as QuoteDoc;
}

export async function ensureChatDoc(input: EnsureChatInput) {
  if (!input.requestId) throw new Error("요청 ID가 없습니다.");
  if (!input.uid) throw new Error("로그인이 필요합니다.");

  const requestSnap = await getDoc(doc(db, "requests", input.requestId));
  if (!requestSnap.exists()) throw new Error("요청을 찾을 수 없습니다.");
  const request = requestSnap.data() as RequestDoc;

  if (input.role === "customer") {
    if (request.customerId !== input.uid) {
      throw new Error("요청 권한이 없습니다.");
    }
  }

  const partnerId = input.role === "partner" ? input.uid : input.partnerId ?? request.selectedPartnerId ?? "";
  if (!partnerId) throw new Error("채팅 상대가 필요합니다.");

  if (input.role === "partner" && partnerId !== input.uid) {
    throw new Error("요청 권한이 없습니다.");
  }

  await ensureQuoteExists(input.requestId, partnerId);

  const chatId = buildChatId(input.requestId, partnerId, request.customerId);
  const ref = doc(db, "chats", chatId);
  const snap = await getDoc(ref);

  const payload: Record<string, unknown> = {
    requestId: input.requestId,
    updatedAt: serverTimestamp(),
    customerId: request.customerId,
    partnerId,
  };

  if (snap.exists()) {
    await setDoc(ref, payload, { merge: true });
    return chatId;
  }

  await setDoc(ref, {
    ...payload,
    createdAt: serverTimestamp(),
    lastMessageText: null,
    lastMessageAt: null,
    lastReadAtCustomer: null,
    lastReadAtPartner: null,
    unreadPartner: 0,
    unreadCustomer: 0,
    customerHidden: false,
    partnerHidden: false,
    status: "open",
  });

  return chatId;
}

export function subscribeChat(input: SubscribeChatInput) {
  if (!input.chatId) {
    input.onData(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, "chats", input.chatId),
    (snap) => {
      if (!snap.exists()) {
        input.onData(null);
        return;
      }
      input.onData({ id: snap.id, ...(snap.data() as Omit<ChatDoc, "id">) });
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}

export function subscribePartnerChats(
  partnerId: string,
  onUpdate: (chats: ChatDoc[]) => void,
  onError?: (error: unknown) => void
) {
  if (!partnerId) {
    onUpdate([]);
    return () => {};
  }

  const q = query(
    collection(db, "chats"),
    where("partnerId", "==", partnerId),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ChatDoc, "id">),
        }))
      );
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export function subscribeMessages(
  chatId: string,
  onUpdate: (messages: MessageDoc[]) => void,
  onError?: (error: unknown) => void
) {
  if (!chatId) {
    onUpdate([]);
    return () => {};
  }

  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));

  return onSnapshot(
    q,
    (snap) => {
      if (__DEV__) {
        console.log("[chat][messages] size=", snap.size, "empty=", snap.empty);
      }
      onUpdate(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<MessageDoc, "id">),
        }))
      );
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function sendMessage(input: SendMessageInput) {
  if (!input.text.trim()) return;

  const text = input.text.trim();
  const messageRef = await addDoc(collection(db, "chats", input.chatId, "messages"), {
    senderRole: input.senderRole,
    senderId: input.senderId,
    text,
    type: "text",
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "chats", input.chatId), {
    updatedAt: serverTimestamp(),
    lastMessageText: text,
    lastMessageAt: serverTimestamp(),
  });

  try {
    const chatSnap = await getDoc(doc(db, "chats", input.chatId));
    if (chatSnap.exists()) {
      const chat = chatSnap.data() as ChatDoc;
      const receiverId = input.senderRole === "customer" ? chat.partnerId : chat.customerId;
      if (receiverId) {
        const isCustomerSender = input.senderRole === "customer";
        await upsertChatNotification({
          uid: receiverId,
          chatId: input.chatId,
          requestId: chat.requestId,
          customerId: chat.customerId,
          partnerId: chat.partnerId ?? null,
          title: "새 채팅이 도착했어요",
          body: isCustomerSender
            ? "고객 메시지가 도착했습니다. 지금 확인해보세요."
            : "업체 메시지가 도착했습니다. 지금 확인해보세요.",
        });
      }
    }
  } catch (error) {
    console.warn("[partner][chat] notify error", error);
  }

  return messageRef.id;
}

export async function updateChatRead(input: UpdateChatReadInput) {
  const field = input.role === "customer" ? "lastReadAtCustomer" : "lastReadAtPartner";
  await updateDoc(doc(db, "chats", input.chatId), {
    [field]: serverTimestamp(),
  });
}

export async function sendImageMessage() {
  throw new Error("이미지 메시지는 현재 지원하지 않습니다.");
}

export async function markChatRead() {
  return;
}

export async function setChatHidden() {
  return;
}

export async function markMessageDeleted() {
  return;
}
