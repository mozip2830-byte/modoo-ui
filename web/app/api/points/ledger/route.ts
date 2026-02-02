export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import admin from "firebase-admin";

import { getAdminApp, getAdminDb } from "../../../../lib/firebaseAdmin";

async function getUid(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : null;
  if (!token) return null;
  const app = getAdminApp();
  const adminDb = getAdminDb();
  if (!app || !adminDb) return null;
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}

export async function GET(request: Request) {
  try {
    const uid = await getUid(request);
    if (!uid) {
      return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ message: "서버 인증이 준비되지 않았습니다." }, { status: 500 });
    }

    const snap = await adminDb
      .collection("point_ledger")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();

    const items = snap.docs.map((docSnap) => {
      const data = docSnap.data() as {
        amount?: number;
        type?: "credit" | "debit";
        reason?: string;
        orderId?: string;
        createdAt?: { toDate?: () => Date } | string;
      };
      let createdAt = "";
      if (typeof data.createdAt === "string") {
        createdAt = data.createdAt;
      } else if (data.createdAt?.toDate) {
        createdAt = data.createdAt.toDate().toISOString();
      }
      return {
        id: docSnap.id,
        amount: data.amount ?? 0,
        type: data.type ?? "credit",
        reason: data.reason ?? "POINT_CHARGE",
        orderId: data.orderId ?? null,
        createdAt
      };
    });

    return NextResponse.json(items, { status: 200 });
  } catch (err) {
    console.error("[web][points][ledger] error", err);
    return NextResponse.json({ message: "원장 조회에 실패했습니다." }, { status: 500 });
  }
}
