import { db } from "@/src/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import type { NotificationDoc, NotificationType } from "@/src/types/models";

type SubscribeNotificationsInput = {
  uid: string;
  onData: (items: NotificationDoc[]) => void;
  onError?: (error: unknown) => void;
};

type CreateNotificationInput = {
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export function subscribeNotifications(input: SubscribeNotificationsInput) {
  if (!input.uid) {
    input.onData([]);
    return () => {};
  }

  const q = query(
    collection(db, "notifications", input.uid, "items"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      input.onData(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<NotificationDoc, "id">),
        }))
      );
    },
    (error) => {
      if (input.onError) input.onError(error);
    }
  );
}

export function subscribeUnreadCount(
  uid: string,
  onCount: (count: number) => void,
  onError?: (error: unknown) => void
) {
  if (!uid) {
    onCount(0);
    return () => {};
  }

  // ✅ read==false 조건 + 정렬 (인덱스 필요할 수 있음. 에러나면 Firebase가 링크 줌)
  const q = query(
    collection(db, "notifications", uid, "items"),
    where("read", "==", false),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => onCount(snap.size),
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function markNotificationRead(uid: string, notificationId: string) {
  if (!uid || !notificationId) return;
  await updateDoc(doc(db, "notifications", uid, "items", notificationId), {
    read: true,
  });
}

export async function createNotification(input: CreateNotificationInput) {
  if (!input.uid) return;

  await addDoc(collection(db, "notifications", input.uid, "items"), {
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data ?? {},
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function upsertChatNotification(input: {
  uid: string;
  chatId: string;
  requestId?: string | null;
  customerId?: string | null;
  partnerId?: string | null;
  title: string;
  body: string;
}) {
  if (!input.uid || !input.chatId) return;

  const q = query(
    collection(db, "notifications", input.uid, "items"),
    where("type", "==", "chat_received"),
    where("read", "==", false),
    where("data.chatId", "==", input.chatId),
    orderBy("createdAt", "desc"),
    limit(1)
  );

  try {
    const snap = await getDocs(q);
    const existing = snap.docs[0];

    if (existing) {
      const data = existing.data() as NotificationDoc;

      // createdAt이 Timestamp일 때 안전 처리
      const createdAtAny = data.createdAt as any;
      const last =
        typeof createdAtAny?.toMillis === "function" ? createdAtAny.toMillis() : 0;

      const now = Date.now();
      if (now - last < 30_000) {
        await updateDoc(existing.ref, {
          title: input.title,
          body: input.body,
          createdAt: serverTimestamp(),
        });
        return;
      }
    }
  } catch (error) {
    console.warn("[customer][notifications] chat dedupe error", error);
  }

  await createNotification({
    uid: input.uid,
    type: "chat_received",
    title: input.title,
    body: input.body,
    data: {
      chatId: input.chatId,
      requestId: input.requestId ?? null,
      customerId: input.customerId ?? null,
      partnerId: input.partnerId ?? null,
    },
  });
}
