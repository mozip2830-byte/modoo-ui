import { NextResponse } from "next/server";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

async function getUid(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : null;
  if (!token) return null;
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

export async function GET(request: Request) {
  try {
    const uid = await getUid(request);
    if (!uid) {
      return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
    }

    const snap = await adminDb
      .collection("point_ledger")
      .where("uid", "==", uid)
      .get();

    let balance = 0;
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { type?: "credit" | "debit"; amount?: number };
      const amount = Number(data.amount ?? 0);
      if (data.type === "debit") balance -= amount;
      else balance += amount;
    });

    return NextResponse.json({ balance }, { status: 200 });
  } catch (err) {
    console.error("[web][points][balance] error", err);
    return NextResponse.json({ message: "잔액 조회에 실패했습니다." }, { status: 500 });
  }
}
