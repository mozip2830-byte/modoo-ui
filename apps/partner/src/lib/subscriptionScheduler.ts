import { doc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

import { db } from "@/src/firebase";
import type { SubscriptionInfo } from "@/src/types/models";

export async function refreshSubscriptionStatus(partnerId: string, subscription?: SubscriptionInfo | null) {
  if (!partnerId || !subscription) return;
  if (subscription.status !== "active") return;

  const end =
    subscription.currentPeriodEnd && "toDate" in (subscription.currentPeriodEnd as any)
      ? (subscription.currentPeriodEnd as any).toDate()
      : subscription.currentPeriodEnd instanceof Date
      ? subscription.currentPeriodEnd
      : null;

  if (!end) return;
  const now = new Date();
  if (end.getTime() > now.getTime()) return;

  if (subscription.autoRenew) {
    const nextStart = now;
    const nextEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await setDoc(
      doc(db, "partners", partnerId),
      {
        subscription: {
          status: "active",
          currentPeriodStart: Timestamp.fromDate(nextStart),
          currentPeriodEnd: Timestamp.fromDate(nextEnd),
          nextBillingAt: Timestamp.fromDate(nextEnd),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  await setDoc(
    doc(db, "partners", partnerId),
    {
      subscription: {
        status: "expired",
        nextBillingAt: null,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
