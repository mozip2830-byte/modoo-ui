"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyNewMessage = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const INVALID_TOKEN_ERRORS = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
]);
exports.notifyNewMessage = functions.firestore
    .document("chats/{chatId}/messages/{messageId}")
    .onCreate(async (snap, context) => {
    const message = snap.data();
    const chatId = context.params.chatId;
    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists) {
        console.error("[notify] chat not found", chatId);
        return;
    }
    const chat = chatSnap.data();
    const senderRole = message.senderRole;
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
    const user = userSnap.data();
    const tokens = Object.keys(user.fcmTokens ?? {});
    if (!tokens.length)
        return;
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
    const invalidTokens = [];
    response.responses.forEach((res, idx) => {
        if (!res.success && res.error && INVALID_TOKEN_ERRORS.has(res.error.code)) {
            invalidTokens.push(tokens[idx]);
        }
    });
    if (invalidTokens.length) {
        const updates = {};
        invalidTokens.forEach((token) => {
            updates[`fcmTokens.${token}`] = admin.firestore.FieldValue.delete();
        });
        await db.doc(`users/${targetUid}`).update(updates);
    }
});
