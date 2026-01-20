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
 * - requestId / partnerId 에 "_"가 들어가면 깨질 수 있음.
 * - Firestore 자동 ID는 일반적으로 "_"를 쓰지 않으니 이 구조를 전제로 사용.
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

/**
 * ✅ FirebaseError 로그 헬퍼
 */
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
 * ✅ 견적 존재 확인 (customer용 - 고객이 읽을 수 있는 경로만 사용)
 * - customer는 본인 request의 quotes를 읽을 수 있음 (rules: getRequestCustomerId() == auth.uid)
 * - where("partnerId","==",partnerId) + limit(1)로 존재 확인
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

/**
 * ✅ 견적 존재 확인 (partner용 - 기존 로직 유지)
 */
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
 * ✅ 채팅방 ensure (SSOT 버전 - customer/partner 분기)
 *
 * 단계:
 *   A) request read → requestCustomerId 확보 (SSOT)
 *   B) ensureQuoteExists (role별 분기)
 *   C) setDoc(chats) merge:true
 *
 * customer 흐름:
 *   - request 문서를 읽어 customerId SSOT 확보
 *   - input.uid === requestCustomerId 검증 (본인 요청만 채팅 가능)
 *   - ensureQuoteExistsForCustomer 호출
 *   - setDoc(chats)
 *
 * partner 흐름:
 *   - request 문서를 읽어 customerId SSOT 확보
 *   - ensureQuoteExistsForPartner 호출
 *   - setDoc(chats)
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

  // partnerId 확정 (기존 로직 유지)
  const partnerId = input.role === "partner" ? input.uid : input.partnerId ?? "";
  if (!partnerId) throw new Error("채팅 상대가 필요합니다.");

  // partner role인데 partnerId를 외부에서 다른 값으로 넣는 경우 방어
  if (input.role === "partner" && partnerId !== input.uid) {
    throw new Error("요청 권한이 없습니다.");
  }

  // ────────────────────────────────────────────────────────────
  // 단계 A: request 문서에서 customerId SSOT 확보
  // ────────────────────────────────────────────────────────────
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

  // customerId는 무조건 requestCustomerId 사용 (SSOT)
  const customerId = requestCustomerId;

  // 추가 검증
  if (input.role === "customer") {
    // customer는 본인 요청에만 채팅 가능
    if (input.uid !== customerId) {
      console.error("[ensureChatDoc] customer uid mismatch", {
        inputUid: input.uid,
        requestCustomerId: customerId,
      });
      throw new Error("요청 권한이 없습니다.");
    }
  } else if (input.role === "partner") {
    // partner가 input.customerId를 전달했다면 일치 여부 검증 (데이터 꼬임 조기 차단)
    if (input.customerId && input.customerId !== customerId) {
      console.warn("[ensureChatDoc] customerId mismatch", {
        inputCustomerId: input.customerId,
        requestCustomerId: customerId,
      });
      throw new Error("채팅방 고객 정보 불일치");
    }
  }

  // ────────────────────────────────────────────────────────────
  // 단계 B: 견적 존재 확인 (role별 분기)
  // ────────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────────
  // 단계 C: setDoc(chats) - merge:true
  // ────────────────────────────────────────────────────────────
  const chatId = buildChatId(input.requestId, partnerId, customerId);
  const ref = doc(db, "chats", chatId);

  // participants 필드는 rules/쿼리엔 필수는 아니지만, 추후 확장 대비
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
        // 최초 생성 시 필요한 초기값들(merge로 기존 값이 있으면 보존되거나 필요한 필드만 갱신됨)
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

/** ✅ 고객용: customerId 기반 채팅 목록 구독 */
export function subscribeCustomerChats(
  customerId: string,
  onUpdate: (chats: ChatDoc[]) => void,
  onError?: (error: unknown) => void
) {
  if (!customerId) {
    onUpdate([]);
    return () => {};
  }

  const q = query(
    collection(db, "chats"),
    where("customerId", "==", customerId),
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
 * ✅ getDoc(chatRef) 제거 (권한/비용/타이밍 이슈 감소)
 * - receiverId / requestId / customerId / partnerId 를 chatId 포맷에서 파싱
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
  throw new Error("이미지 메시지는 현재 지원하지 않습니다.");
}

// legacy no-op (호환 유지)
export async function markChatRead() {
  return;
}
export async function setChatHidden() {
  return;
}
export async function markMessageDeleted() {
  return;
}
