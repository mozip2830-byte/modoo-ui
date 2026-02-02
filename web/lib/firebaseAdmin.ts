import "server-only";
import admin from "firebase-admin";

function normalizePrivateKey(key?: string) {
  if (!key) return undefined;
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

export function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  // ✅ 빌드 타임에서는 env가 없을 수 있으므로 throw 하지 말고 null 반환
  if (!projectId || !clientEmail || !privateKey) return null;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return admin.app();
}

export function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return admin.firestore();
}
