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

  /**
   * ✅ 자동ID quotes 구조 + rules 최소권한을 동시에 만족시키려면,
   * request get을 피하고 customerId를 "화면에서 이미 알고 있는 값"으로 받아야 안전하다.
   *
   * - partner 화면: request.customerId를 이미 가지고 있음(요청 상세에서 가져옴)
   * - customer 화면: 본인 uid가 customerId
   */
  customerId?: string;
};

type SendMessageInput = {
  chatId: string;
  senderRole: "partner" | "customer";
  senderId: string;
  text?: string;
  imageUrls?: string[];
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
 * ✅ chatId 파싱 헬퍼
 * chatId 형식: `${requestId}_${partnerId}_${customerId}`
 * - getDoc 없이 receiverId, requestId 등을 추출하기 위해 사용
 */
export function parseChatId(chatId: string) {
  const parts = chatId.split("_");
  if (parts.length < 3) {
    return { requestId: "", partnerId: "", customerId: "" };
  }
  const requestId = parts[0] ?? "";
  const partnerId = parts[1] ?? "";
  // customerId에 "_"가 들어갈 일은 없지만, 혹시 대비해서 나머지 join
  const customerId = parts.slice(2).join("_");
  return { requestId, partnerId, customerId };
}

/**
 * ✅ 자동ID quotes 구조 대응:
 * - 문서ID가 partnerId가 아니므로 getDoc(/quotes/{partnerId}) 금지
 * - where("partnerId","==",partnerId) + limit(1)로 존재 확인
 *
 * ⚠️ rules가 "quotes get/list 분리"로 수정되어 있어야
 *    quote가 없을 때 permission-denied가 아니라 "empty"로 떨어진다.
 */
async function ensureQuoteExists(requestId: string, partnerId: string) {
  console.log("[ensureQuoteExists] start", { requestId, partnerId });
  try {
    const q = query(
      collection(db, "requests", requestId, "quotes"),
      where("partnerId", "==", partnerId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log("[ensureQuoteExists] quote not found (empty)");
      throw new Error("견적을 찾을 수 없습니다.");
    }
    console.log("[ensureQuoteExists] success", { quoteId: snap.docs[0].id });
    return snap.docs[0].data() as QuoteDoc;
  } catch (err: unknown) {
    // FirebaseError 구분 로그
    if (err && typeof err === "object" && "code" in err) {
      const fbErr = err as { code: string; message: string };
      console.error("[ensureQuoteExists] FirebaseError", { code: fbErr.code, message: fbErr.message });
    }
    throw err;
  }
}

/**
 * ✅ 채팅방 ensure (SSOT 버전)
 * - request 문서에서 customerId를 강제로 읽어옴 (create rule 만족을 위한 SSOT)
 * - chat getDoc 존재확인은 하지 않는다(없을 때 permission-denied 타이밍 이슈 회피)
 * - setDoc(..., {merge:true})로 생성/갱신을 한 번에 처리
 *
 * 단계:
 *   A) request read → requestCustomerId 확보
 *   B) ensureQuoteExists
 *   C) setDoc(chats)
 */
export async function ensureChatDoc(input: EnsureChatInput) {
  console.log("[ensureChatDoc] start", { role: input.role, uid: input.uid, requestId: input.requestId });

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
    console.log("[ensureChatDoc] stage A success", { requestCustomerId });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const fbErr = err as { code: string; message: string };
      console.error("[ensureChatDoc] stage A FirebaseError", { code: fbErr.code, message: fbErr.message });
    } else {
      console.error("[ensureChatDoc] stage A error", err);
    }
    throw err;
  }

  // customerId는 무조건 requestCustomerId 사용 (SSOT)
  const customerId = requestCustomerId;

  // 추가 검증
  if (input.role === "customer") {
    // customer는 본인 요청에만 채팅 가능
    if (input.uid !== customerId) {
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
  // 단계 B: 견적 존재 확인 (견적 기반 채팅 정책 유지)
  // ────────────────────────────────────────────────────────────
  console.log("[ensureChatDoc] stage B: checking quote...");
  try {
    await ensureQuoteExists(input.requestId, partnerId);
    console.log("[ensureChatDoc] stage B success");
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const fbErr = err as { code: string; message: string };
      console.error("[ensureChatDoc] stage B FirebaseError", { code: fbErr.code, message: fbErr.message });
    } else {
      console.error("[ensureChatDoc] stage B error", err);
    }
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

  console.log("[ensureChatDoc] stage C: setDoc...", { chatId });
  try {
    // 🐛 BUG FIX: setDoc merge는 필드가 존재하면 덮어쓰므로, 기존 채팅의 lastMessageText가 null로 초기화됨.
    // 문서가 존재하는지 먼저 확인하고, 없을 때만 초기값을 세팅해야 함.
    const chatSnap = await getDoc(ref);

    if (!chatSnap.exists()) {
      await setDoc(ref, {
        ...basePayload,
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
    } else {
      // 이미 존재하면 basePayload(참여자 정보, 업데이트 시간 등)만 갱신
      await setDoc(ref, basePayload, { merge: true });
    }
    console.log("[ensureChatDoc] stage C success", { chatId });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const fbErr = err as { code: string; message: string };
      console.error("[ensureChatDoc] stage C FirebaseError", { code: fbErr.code, message: fbErr.message });
    } else {
      console.error("[ensureChatDoc] stage C error", err);
    }
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

  // ✅ rules list는 resource를 못 쓰니,
  // 반드시 where("partnerId","==",uid) 패턴만 사용해야 안전하다.
  const q = query(collection(db, "chats"), where("partnerId", "==", partnerId), orderBy("updatedAt", "desc"));

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

export async function sendMessage(input: SendMessageInput) {
  const text = (input.text ?? "").trim();
  const imageUrls = (input.imageUrls ?? []).filter(Boolean);
  const hasImages = imageUrls.length > 0;
  if (!text && !hasImages) return;

  // ✅ 핵심 변경: getDoc 제거 → chatId 파싱으로 대체
  // - chat 문서가 존재하지 않을 때 getDoc이 permission-denied 발생 가능
  // - chatId 형식이 `${requestId}_${partnerId}_${customerId}`이므로 파싱으로 해결
  const { requestId, partnerId, customerId } = parseChatId(input.chatId);
  if (!requestId || !partnerId || !customerId) {
    throw new Error("채팅 ID 형식이 올바르지 않습니다.");
  }

  const receiverId = input.senderRole === "customer" ? partnerId : customerId;
  const receiverUnreadField = input.senderRole === "customer" ? "unreadPartner" : "unreadCustomer";
  const senderReadField = input.senderRole === "customer" ? "lastReadAtCustomer" : "lastReadAtPartner";

  const chatRef = doc(db, "chats", input.chatId);

  await addDoc(collection(db, "chats", input.chatId, "messages"), {
    senderRole: input.senderRole,
    senderId: input.senderId,
    text,
    type: hasImages ? (text ? "mixed" : "image") : "text",
    imageUrls: hasImages ? imageUrls : [],
    createdAt: serverTimestamp(),
  });

  const lastMessageText = text || (hasImages ? `사진 ${imageUrls.length}장` : "");
  await updateDoc(chatRef, {
    updatedAt: serverTimestamp(),
    lastMessageText,
    lastMessageAt: serverTimestamp(),
    [receiverUnreadField]: increment(1),
    [senderReadField]: serverTimestamp(),
  });

  // 알림
  try {
    if (receiverId) {
      const isCustomerSender = input.senderRole === "customer";
      await upsertChatNotification({
        uid: receiverId,
        chatId: input.chatId,
        requestId,
        customerId,
        partnerId,
        title: "새 채팅이 도착했어요",
        body: isCustomerSender
          ? "고객 메시지가 도착했습니다. 지금 확인해보세요."
          : "업체 메시지가 도착했습니다. 지금 확인해보세요.",
      });
    }
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
