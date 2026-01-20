import { db } from "@/src/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { upsertChatNotification } from "@/src/actions/notificationActions";
import type { ChatDoc, MessageDoc, QuoteDoc } from "@/src/types/models";

type EnsureChatInput = {
  requestId: string;
  role: "customer" | "partner";
  uid: string;
  partnerId?: string;
  customerId?: string;
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

/**
 * chatId: `${requestId}_${partnerId}_${customerId}`
 * - requestId / partnerId / customerId를 '_'로 연결한 형태
 * - customerId에 '_'가 포함될 수 있어서, parse 시 customerId는 나머지를 join 처리
 */
export function parseChatId(chatId: string | null) {
  if (!chatId) return { requestId: "", partnerId: "", customerId: "" };
  const parts = chatId.split("_");
  if (parts.length < 3) return { requestId: "", partnerId: "", customerId: "" };

  const requestId = parts[0] ?? "";
  const partnerId = parts[1] ?? "";
  const customerId = parts.slice(2).join("_");

  return { requestId, partnerId, customerId };
}

/** FirebaseError 로그 helper */
function logFirebaseError(stage: string, err: unknown) {
  if (err && typeof err === "object" && "code" in err) {
    const fbErr = err as { code: string; message: string };
    console.error(`[chatActions] ${stage} FirebaseError`, {
      code: fbErr.code,
      message: fbErr.message,
    });
  } else {
    console.error(`[chatActions] ${stage} error`, err);
  }
}

/**
 * 견적 존재 확인 (customer)
 * - customer는 본인 request의 quotes를 읽을 수 있음
 * - where("partnerId","==",partnerId) + limit(1)로 존재만 확인
 */
async function ensureQuoteExistsForCustomer(requestId: string, partnerId: string) {
  console.log("[ensureQuoteExistsForCustomer] start", { requestId, partnerId });
  try {
    const q = query(
      collection(db, "requests", requestId, "quotes"),
      where("partnerId", "==", partnerId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log("[ensureQuoteExistsForCustomer] quote not found (empty)");
      throw new Error("견적을 찾을 수 없습니다.");
    }
    console.log("[ensureQuoteExistsForCustomer] success", { quoteId: snap.docs[0].id });
    return snap.docs[0].data() as QuoteDoc;
  } catch (err: unknown) {
    logFirebaseError("ensureQuoteExistsForCustomer", err);
    throw err;
  }
}

/** 견적 존재 확인 (partner) */
async function ensureQuoteExistsForPartner(requestId: string, partnerId: string) {
  console.log("[ensureQuoteExistsForPartner] start", { requestId, partnerId });
  try {
    const q = query(
      collection(db, "requests", requestId, "quotes"),
      where("partnerId", "==", partnerId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log("[ensureQuoteExistsForPartner] quote not found (empty)");
      throw new Error("견적을 찾을 수 없습니다.");
    }
    console.log("[ensureQuoteExistsForPartner] success", { quoteId: snap.docs[0].id });
    return snap.docs[0].data() as QuoteDoc;
  } catch (err: unknown) {
    logFirebaseError("ensureQuoteExistsForPartner", err);
    throw err;
  }
}

/**
 * 채팅방 ensure (SSOT)
 *
 * 단계:
 *   A) request read → request.customerId (SSOT)
 *   B) ensureQuoteExists(role 분기)
 *   C) setDoc(chats) merge:true
 */
export async function ensureChatDoc(input: EnsureChatInput) {
  console.log("[ensureChatDoc] start", {
    role: input.role,
    uid: input.uid,
    requestId: input.requestId,
    partnerId: input.partnerId,
    customerId: input.customerId,
  });

  if (!input.requestId) throw new Error("요청 ID가 없습니다.");
  if (!input.uid) throw new Error("로그인이 필요합니다.");

  // partnerId 결정
  const partnerId = input.role === "partner" ? input.uid : input.partnerId ?? "";
  if (!partnerId) throw new Error("채팅 상대 정보가 필요합니다.");

  // partner role인데 partnerId가 uid와 다르게 들어오면 방지
  if (input.role === "partner" && partnerId !== input.uid) {
    throw new Error("요청 권한이 없습니다.");
  }

  // -------------------------
  // Stage A: request 문서에서 customerId SSOT 가져오기
  // -------------------------
  console.log("[ensureChatDoc] stage A: reading request doc...");
  let requestCustomerId: string;
  try {
    const requestRef = doc(db, "requests", input.requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) {
      throw new Error("요청을 찾을 수 없습니다.");
    }
    const requestData = requestSnap.data();
    requestCustomerId = (requestData?.customerId as string) ?? "";
    if (!requestCustomerId) {
      throw new Error("요청 고객 정보가 없습니다.");
    }
    console.log("[ensureChatDoc] stage A ok", { requestCustomerId });
  } catch (err: unknown) {
    logFirebaseError("stage A (request read)", err);
    throw err;
  }

  // customerId는 무조건 request의 customerId를 SSOT로 사용
  const customerId = requestCustomerId;

  // -------------------------
  // 추가 검증
  // -------------------------
  if (input.role === "customer") {
    // customer는 본인 request만 채팅 가능
    if (input.uid !== customerId) {
      console.error("[ensureChatDoc] customer uid mismatch", {
        inputUid: input.uid,
        requestCustomerId: customerId,
      });
      throw new Error("요청 권한이 없습니다.");
    }
  } else if (input.role === "partner") {
    // partner가 customerId를 전달해 왔으면 일치 여부 검사(데이터 섞임 방지)
    if (input.customerId && input.customerId !== customerId) {
      console.warn("[ensureChatDoc] customerId mismatch", {
        inputCustomerId: input.customerId,
        requestCustomerId: customerId,
      });
      throw new Error("채팅방 고객 정보가 일치하지 않습니다.");
    }
  }

  // -------------------------
  // Stage B: 견적 존재 확인
  // -------------------------
  console.log("[ensureChatDoc] stage B: checking quote...", { role: input.role });
  try {
    if (input.role === "customer") {
      await ensureQuoteExistsForCustomer(input.requestId, partnerId);
    } else {
      await ensureQuoteExistsForPartner(input.requestId, partnerId);
    }
    console.log("[ensureChatDoc] stage B ok");
  } catch (err: unknown) {
    logFirebaseError("stage B (quote check)", err);
    throw err;
  }

  // -------------------------
  // Stage C: setDoc(chats) merge:true
  // -------------------------
  const chatId = buildChatId(input.requestId, partnerId, customerId);
  const ref = doc(db, "chats", chatId);

  // participants는 rules/쿼리에서 활용 가능
  const participants = [customerId, partnerId];

  const basePayload: Record<string, unknown> = {
    requestId: input.requestId,
    updatedAt: serverTimestamp(),
    customerId,
    partnerId,
    participants,
  };

  console.log("[ensureChatDoc] stage C: setDoc...", { chatId, customerId, partnerId });
  try {
    await setDoc(
      ref,
      {
        ...basePayload,
        // 초기값 (merge로 기존값 유지 + 없는 필드만 채움)
        lastMessageText: null,
        lastMessageAt: null,
        lastReadAtCustomer: null,
        lastReadAtPartner: null,
        unreadPartner: 0,
        unreadCustomer: 0,
        customerHidden: false,
        partnerHidden: false,
        status: "open",
      },
      { merge: true }
    );
    console.log("[ensureChatDoc] stage C ok", { chatId });
  } catch (err: unknown) {
    logFirebaseError("stage C (setDoc chats)", err);
    throw err;
  }

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

/** customerId 기반 채팅 목록 구독 */
function chatSortKey(chat: ChatDoc) {
  const pick = (value: unknown) => {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "object") {
      const maybe = value as { toMillis?: () => number; seconds?: number };
      if (typeof maybe.toMillis === "function") return maybe.toMillis();
      if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
    }
    return 0;
  };

  return pick(chat.updatedAt) || pick(chat.lastMessageAt) || pick(chat.createdAt);
}

export function subscribeCustomerChats(
  customerId: string,
  onUpdate: (chats: ChatDoc[]) => void,
  onError?: (error: unknown) => void
) {
  if (!customerId || typeof customerId !== "string") {
    console.warn("[subscribeCustomerChats] invalid customerId", customerId);
    onUpdate([]);
    return () => {};
  }

  const byCustomer = new Map<string, ChatDoc>();
  const byParticipants = new Map<string, ChatDoc>();

  const emit = () => {
    const merged = new Map([...byCustomer, ...byParticipants]);
    const items = Array.from(merged.values());
    // 서버 orderBy에 의존하지 않고 클라이언트에서 안전하게 정렬
    items.sort((a, b) => chatSortKey(b) - chatSortKey(a));
    onUpdate(items);
  };

  const handleSnap = (target: Map<string, ChatDoc>) => (snap: any) => {
    target.clear();
    snap.docs.forEach((docSnap: any) => {
      target.set(docSnap.id, {
        id: docSnap.id,
        ...(docSnap.data() as Omit<ChatDoc, "id">),
      });
    });
    emit();
  };

  const handleError = (error: unknown) => {
    logFirebaseError("subscribeCustomerChats", error);
    if (onError) onError(error);
  };

  const baseRef = collection(db, "chats");

  // ✅ 과거 문서에 updatedAt이 없을 수 있어서 orderBy를 제거 (0개/인덱스 이슈 방지)
  const qByCustomer = query(baseRef, where("customerId", "==", customerId));

  const qByParticipants = query(baseRef, where("participants", "array-contains", customerId));

  const unsubCustomer = onSnapshot(qByCustomer, handleSnap(byCustomer), handleError);
  const unsubParticipants = onSnapshot(qByParticipants, handleSnap(byParticipants), handleError);

  return () => {
    unsubCustomer();
    unsubParticipants();
  };
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

/**
 * getDoc(chatRef) 제거
 * - receiverId/requestId/customerId/partnerId는 chatId에서 파싱
 */
export async function sendMessage(input: SendMessageInput) {
  const text = input.text.trim();
  if (!text) return;

  const { requestId, partnerId, customerId } = parseChatId(input.chatId);
  if (!requestId || !partnerId || !customerId) {
    throw new Error("채팅 ID 형식이 올바르지 않습니다.");
  }

  const chatRef = doc(db, "chats", input.chatId);

  const receiverId = input.senderRole === "customer" ? partnerId : customerId;
  const receiverUnreadField = input.senderRole === "customer" ? "unreadPartner" : "unreadCustomer";
  const senderReadField = input.senderRole === "customer" ? "lastReadAtCustomer" : "lastReadAtPartner";

  await addDoc(collection(db, "chats", input.chatId, "messages"), {
    senderRole: input.senderRole,
    senderId: input.senderId,
    text,
    type: "text",
    createdAt: serverTimestamp(),
  });

  await updateDoc(chatRef, {
    updatedAt: serverTimestamp(),
    lastMessageText: text,
    lastMessageAt: serverTimestamp(),
    [receiverUnreadField]: increment(1),
    [senderReadField]: serverTimestamp(),
  });

  try {
    await upsertChatNotification({
      uid: receiverId,
      chatId: input.chatId,
      requestId,
      customerId,
      partnerId,
      title: "새 채팅이 도착했어요",
      body:
        input.senderRole === "customer"
          ? "고객 메시지가 도착했습니다. 지금 확인해보세요."
          : "업체 메시지가 도착했습니다. 지금 확인해보세요.",
    });
  } catch (error) {
    console.warn("[chat] notify error", error);
  }
}

export async function updateChatRead(input: UpdateChatReadInput) {
  const chatRef = doc(db, "chats", input.chatId);

  if (input.role === "customer") {
    await updateDoc(chatRef, {
      lastReadAtCustomer: serverTimestamp(),
      unreadCustomer: 0,
    });
    return;
  }

  await updateDoc(chatRef, {
    lastReadAtPartner: serverTimestamp(),
    unreadPartner: 0,
  });
}

export async function sendImageMessage() {
  throw new Error("이미지 메시지는 아직 지원하지 않습니다.");
}

// legacy no-op
export async function markChatRead() {
  return;
}
export async function setChatHidden() {
  return;
}
export async function markMessageDeleted() {
  return;
}
