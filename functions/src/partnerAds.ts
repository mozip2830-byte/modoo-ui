import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const MIN_BID_POINTS = 10000;

function getSeoulDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function getNextWeekRange(base: Date) {
  const day = base.getDay(); // 0 Sun - 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday start (current week)
  const start = new Date(base);
  start.setDate(base.getDate() + diff + 7); // next week Monday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function isBidClosed(now: Date) {
  return now.getDay() === 0 && now.getHours() >= 22;
}

function formatWeekKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type CreateAdBidInput = {
  partnerId: string;
  category: string;
  region: string;
  regionDetail?: string | null;
  amount: number;
};

export const createPartnerAdBid = functions.https.onCall(async (data: CreateAdBidInput, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const partnerId = String(data?.partnerId ?? "");
  if (!partnerId || partnerId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "잘못된 요청입니다.");
  }

  const category = String(data?.category ?? "").trim();
  const region = String(data?.region ?? "").trim();
  const regionDetail = data?.regionDetail ? String(data.regionDetail).trim() : null;
  const amount = Number(data?.amount ?? 0);

  if (!category || !region) {
    throw new functions.https.HttpsError("invalid-argument", "카테고리/지역이 필요합니다.");
  }
  if (!Number.isFinite(amount) || amount < MIN_BID_POINTS) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `최소 ${MIN_BID_POINTS.toLocaleString("ko-KR")}포인트 이상 필요합니다.`
    );
  }

  const now = getSeoulDate();
  if (isBidClosed(now)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "일요일 22시 이후에는 입찰할 수 없습니다."
    );
  }

  const { start, end } = getNextWeekRange(now);
  const weekKey = formatWeekKey(start);
  const regionKey = regionDetail ? `${region} ${regionDetail}` : null;

  const userRef = db.collection("partnerUsers").doc(partnerId);
  const bidRef = db.collection("partnerAdBids").doc();

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new functions.https.HttpsError("not-found", "파트너 정보를 찾을 수 없습니다.");
    }
    const userData = userSnap.data() ?? {};
    const currentPoints = Number(userData.cashPoints ?? 0);
    if (currentPoints < amount) {
      throw new functions.https.HttpsError("failed-precondition", "포인트가 부족합니다.");
    }

    tx.update(userRef, {
      cashPoints: currentPoints - amount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(bidRef, {
      partnerId,
      category,
      region: regionKey ?? region,
      amount,
      weekKey,
      regionKey,
      regionDetail: regionDetail ?? null,
      weekStart: admin.firestore.Timestamp.fromDate(start),
      weekEnd: admin.firestore.Timestamp.fromDate(end),
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { bidId: bidRef.id };
});
