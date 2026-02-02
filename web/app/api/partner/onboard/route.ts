import { NextResponse } from "next/server";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { Role, USERS_COLLECTION } from "@/lib/roles";

type OnboardRequest = {
  displayName?: string;
  phone?: string;
  serviceRegion?: string;
  agreeTerms?: boolean;
};

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;
    if (!token) {
      return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const payload = (await request.json()) as OnboardRequest;

    if (!payload.agreeTerms) {
      return NextResponse.json({ message: "약관 동의가 필요합니다." }, { status: 400 });
    }
    if (!payload.displayName?.trim()) {
      return NextResponse.json({ message: "업체명/닉네임을 입력해 주세요." }, { status: 400 });
    }

    const userRef = adminDb.collection(USERS_COLLECTION).doc(uid);
    const partnerRef = adminDb.collection("partners").doc(uid);
    const onboardingRef = adminDb.collection("partnerOnboarding").doc(uid);

    await adminDb.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const role: Role = userSnap.exists && userSnap.data()?.role === "partner" ? "partner" : "partner";

      tx.set(
        userRef,
        {
          role,
          displayName: payload.displayName?.trim()
        },
        { merge: true }
      );

      tx.set(
        partnerRef,
        {
          displayName: payload.displayName?.trim(),
          phone: payload.phone?.trim() || null,
          serviceRegion: payload.serviceRegion?.trim() || null,
          createdAt: new Date().toISOString()
        },
        { merge: true }
      );

      tx.set(
        onboardingRef,
        {
          agreeTerms: Boolean(payload.agreeTerms),
          phone: payload.phone?.trim() || null,
          serviceRegion: payload.serviceRegion?.trim() || null,
          completedAt: new Date().toISOString()
        },
        { merge: true }
      );
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[web][partner][onboard] error", err);
    return NextResponse.json({ message: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
