import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export const notifyNewMessage = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const chatId = context.params.chatId as string;

    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists) {
      console.error("[notify] chat not found", chatId);
      return;
    }

    const chat = chatSnap.data() as {
      requestId?: string;
      partnerId?: string;
      customerId?: string;
      unreadPartner?: number;
      unreadCustomer?: number;
    };

    const senderRole = message.senderRole as "partner" | "customer" | undefined;
    const targetRole = senderRole === "partner" ? "customer" : "partner";
    const targetUid = senderRole === "partner" ? chat.customerId : chat.partnerId;

    if (!targetUid) {
      console.error("[notify] target uid missing", chatId, senderRole);
      return;
    }

    const unreadTarget = senderRole === "partner" ? chat.unreadCustomer : chat.unreadPartner;
    if (typeof unreadTarget === "number" && unreadTarget <= 0) {
      return;
    }

    const userSnap = await db.doc(`users/${targetUid}`).get();
    if (!userSnap.exists) {
      console.error("[notify] target user doc missing", targetUid);
      return;
    }

    const user = userSnap.data() as { fcmTokens?: Record<string, boolean> };
    const tokens = Object.keys(user.fcmTokens ?? {});
    if (!tokens.length) return;

    const title = "New message";
    const body = message.type === "image" ? "Sent a photo" : message.text ?? "New message";

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        chatId,
        requestId: chat.requestId ?? "",
        role: targetRole,
      },
    });

    const invalidTokens: string[] = [];
    response.responses.forEach((res, idx) => {
      if (!res.success && res.error && INVALID_TOKEN_ERRORS.has(res.error.code)) {
        invalidTokens.push(tokens[idx]);
      }
    });

    if (invalidTokens.length) {
      const updates: Record<string, admin.firestore.FieldValue> = {};
      invalidTokens.forEach((token) => {
        updates[`fcmTokens.${token}`] = admin.firestore.FieldValue.delete();
      });
      await db.doc(`users/${targetUid}`).update(updates);
    }
  });
