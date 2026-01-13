import { db, storage } from "@/src/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import type { ChatDoc, MessageDoc } from "@/src/types/models";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

type EnsureChatInput = {
  requestId: string;
  partnerId: string;
  customerId: string;
};

type SendMessageInput = {
  chatId: string;
  senderRole: "partner" | "customer";
  senderId: string;
  text: string;
};

type SendImageInput = {
  chatId: string;
  senderRole: "partner" | "customer";
  senderId: string;
  uri: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

type MarkReadInput = {
  chatId: string;
  role: "partner" | "customer";
};

type HideChatInput = {
  chatId: string;
  role: "partner" | "customer";
  hidden: boolean;
};

type DeleteMessageInput = {
  chatId: string;
  messageId: string;
  role: "partner" | "customer";
};

export function buildChatId(requestId: string, partnerId: string) {
  return `${requestId}_${partnerId}`;
}

export async function ensureChatExists(input: EnsureChatInput) {
  const chatId = buildChatId(input.requestId, input.partnerId);
  const ref = doc(db, "chats", chatId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return chatId;
  }

  await setDoc(ref, {
    requestId: input.requestId,
    partnerId: input.partnerId,
    customerId: input.customerId || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessageText: null,
    lastMessageAt: null,
    unreadPartner: 0,
    unreadCustomer: 0,
    customerHidden: false,
    partnerHidden: false,
    status: "open",
  });

  return chatId;
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

  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(
    q,
    (snap) => {
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
    imageUrl: null,
    imagePath: null,
    deletedForPartner: false,
    deletedForCustomer: false,
    createdAt: serverTimestamp(),
  });

  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    lastMessageText: text,
    lastMessageAt: serverTimestamp(),
  };

  if (input.senderRole === "partner") {
    updates.unreadCustomer = increment(1);
  } else {
    updates.unreadPartner = increment(1);
  }

  await updateDoc(doc(db, "chats", input.chatId), updates);

  return messageRef.id;
}

export async function sendImageMessage(input: SendImageInput) {
  const mimeType = input.mimeType ?? "image/jpeg";
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error("Unsupported image type");
  }

  if (input.sizeBytes && input.sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large");
  }

  const messageRef = doc(collection(db, "chats", input.chatId, "messages"));
  const messageId = messageRef.id;
  const imagePath = `chats/${input.chatId}/images/${messageId}.jpg`;
  const storageRef = ref(storage, imagePath);

  const response = await fetch(input.uri);
  const blob = await response.blob();
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large");
  }

  await uploadBytes(storageRef, blob, { contentType: mimeType });
  const imageUrl = await getDownloadURL(storageRef);

  await setDoc(messageRef, {
    senderRole: input.senderRole,
    senderId: input.senderId,
    text: "",
    type: "image",
    imageUrl,
    imagePath,
    deletedForPartner: false,
    deletedForCustomer: false,
    createdAt: serverTimestamp(),
  });

  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    lastMessageText: "Photo",
    lastMessageAt: serverTimestamp(),
  };

  if (input.senderRole === "partner") {
    updates.unreadCustomer = increment(1);
  } else {
    updates.unreadPartner = increment(1);
  }

  await updateDoc(doc(db, "chats", input.chatId), updates);

  return messageId;
}

export async function markChatRead(input: MarkReadInput) {
  const field = input.role === "partner" ? "unreadPartner" : "unreadCustomer";
  await updateDoc(doc(db, "chats", input.chatId), {
    [field]: 0,
  });
}

export async function setChatHidden(input: HideChatInput) {
  const field = input.role === "partner" ? "partnerHidden" : "customerHidden";
  await updateDoc(doc(db, "chats", input.chatId), {
    [field]: input.hidden,
    updatedAt: serverTimestamp(),
  });
}

export async function markMessageDeleted(input: DeleteMessageInput) {
  const field = input.role === "partner" ? "deletedForPartner" : "deletedForCustomer";
  await updateDoc(doc(db, "chats", input.chatId, "messages", input.messageId), {
    [field]: true,
  });
}
