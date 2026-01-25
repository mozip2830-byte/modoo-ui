import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type PartnerAdBid = {
  partnerId?: string;
  category?: string;
  region?: string | null;
  regionKey?: string | null;
  amount?: number;
  weekKey?: string | null;
  weekStart?: admin.firestore.Timestamp | null;
  weekEnd?: admin.firestore.Timestamp | null;
  status?: string;
  createdAt?: admin.firestore.Timestamp | null;
};

type PlacementPayload = {
  partnerId: string;
  category: string;
  region: string | null;
  regionKey: string | null;
  amount: number;
  rank: number;
  weekKey: string;
  weekStart: admin.firestore.Timestamp;
  weekEnd: admin.firestore.Timestamp;
  bidId: string;
  bidCreatedAt?: admin.firestore.Timestamp | null;
  placedAt: admin.firestore.FieldValue;
};

function getSeoulDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function getWeekStart(date: Date) {
  const day = date.getDay(); // 0 Sun - 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatWeekKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMillis(value?: admin.firestore.Timestamp | null) {
  if (!value) return 0;
  return value.toMillis();
}

export const finalizeWeeklyAdBids = functions.pubsub
  .schedule("0 0 * * 1")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const now = getSeoulDate();
    const weekStartDate = getWeekStart(now);
    const weekKey = formatWeekKey(weekStartDate);
    const weekStart = admin.firestore.Timestamp.fromDate(weekStartDate);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    weekEndDate.setHours(23, 59, 59, 999);
    const weekEnd = admin.firestore.Timestamp.fromDate(weekEndDate);

    const cutoff = new Date(weekStartDate);
    cutoff.setDate(weekStartDate.getDate() - 1);
    cutoff.setHours(22, 0, 0, 0);
    const cutoffMillis = cutoff.getTime();

    const bidsSnap = await db
      .collection("partnerAdBids")
      .where("weekKey", "==", weekKey)
      .where("status", "==", "pending")
      .get();

    if (bidsSnap.empty) {
      return null;
    }

    const grouped = new Map<string, Array<{ id: string; data: PartnerAdBid }>>();
    bidsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as PartnerAdBid;
      if (!data.category || !data.partnerId) return;
      const createdAtMillis = toMillis(data.createdAt);
      if (createdAtMillis > cutoffMillis) {
        grouped.set(`late__${docSnap.id}`, [{ id: docSnap.id, data }]);
        return;
      }
      const regionKey = data.regionKey ?? data.region ?? "unknown";
      const key = `${data.category}__${regionKey}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({ id: docSnap.id, data });
    });

    const batch = db.batch();
    let writes = 0;

    const flushBatch = async () => {
      if (writes === 0) return;
      await batch.commit();
      writes = 0;
    };

    for (const [groupKey, entries] of grouped.entries()) {
      if (groupKey.startsWith("late__")) {
        const entry = entries[0];
        batch.update(db.collection("partnerAdBids").doc(entry.id), {
          status: "late",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        writes += 1;
        if (writes >= 400) {
          await flushBatch();
        }
        continue;
      }

      const sorted = [...entries].sort((a, b) => {
        const amountGap = Number(b.data.amount ?? 0) - Number(a.data.amount ?? 0);
        if (amountGap !== 0) return amountGap;
        const aTime = toMillis(a.data.createdAt);
        const bTime = toMillis(b.data.createdAt);
        return aTime - bTime;
      });

      const winners = sorted.slice(0, 5);
      const losers = sorted.slice(5);

      winners.forEach((entry, index) => {
        const rank = index + 1;
        const data = entry.data;
        const placementId = `${weekKey}_${data.category}_${data.regionKey ?? data.region ?? "unknown"}_${rank}`
          .replace(/\s+/g, "_")
          .replace(/[^\w-]/g, "_");
        const placementRef = db.collection("partnerAdPlacements").doc(placementId);
        const payload: PlacementPayload = {
          partnerId: data.partnerId ?? "",
          category: data.category ?? "",
          region: data.region ?? null,
          regionKey: data.regionKey ?? null,
          amount: Number(data.amount ?? 0),
          rank,
          weekKey,
          weekStart,
          weekEnd,
          bidId: entry.id,
          bidCreatedAt: data.createdAt ?? null,
          placedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        batch.set(placementRef, payload, { merge: true });
        batch.update(db.collection("partnerAdBids").doc(entry.id), {
          status: "won",
          resultRank: rank,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        writes += 2;
      });

      losers.forEach((entry) => {
        const data = entry.data;
        const refundAmount = Number(data.amount ?? 0);
        if (data.partnerId && refundAmount > 0) {
          const userRef = db.collection("partnerUsers").doc(data.partnerId);
          const ledgerRef = db.collection(`partnerPointLedger/${data.partnerId}/items`).doc();
          batch.update(userRef, {
            cashPoints: admin.firestore.FieldValue.increment(refundAmount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          batch.set(ledgerRef, {
            partnerId: data.partnerId,
            type: "refund",
            deltaPoints: refundAmount,
            balanceAfter: null,
            amountPayKRW: refundAmount,
            reason: "ad_bid_refund",
            bidId: entry.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          writes += 2;
        }
        batch.update(db.collection("partnerAdBids").doc(entry.id), {
          status: "lost",
          resultRank: null,
          refundAmount,
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        writes += 1;
      });

      if (writes >= 400) {
        await flushBatch();
      }
    }

    await flushBatch();
    return null;
  });
