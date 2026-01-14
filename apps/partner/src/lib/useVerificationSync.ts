import { useEffect } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/src/firebase";
import type { PartnerUserDoc } from "@/src/types/models";

export function useVerificationSync(uid?: string | null, user?: PartnerUserDoc | null) {
  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(
      doc(db, "partnerVerifications", uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as { status?: string; rejectReason?: string };
        const status = data.status as PartnerUserDoc["verificationStatus"] | undefined;
        if (!status) return;

        const nextGrade = status === "승인" ? "정회원" : "준회원";
        const currentStatus = user?.verificationStatus;
        const currentGrade = user?.grade;
        if (currentStatus === status && currentGrade === nextGrade) return;

        setDoc(
          doc(db, "partnerUsers", uid),
          {
            verificationStatus: status,
            grade: nextGrade,
            verificationUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((err) => {
          console.error("[partner][verification] sync error", err);
        });
      },
      (err) => {
        console.error("[partner][verification] subscribe error", err);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [uid, user?.verificationStatus, user?.grade]);
}
