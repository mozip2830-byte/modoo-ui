import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "@/src/firebase";
import type { PartnerUserDoc } from "@/src/types/models";

export function usePartnerUser(uid?: string | null) {
  const [user, setUser] = useState<PartnerUserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "partnerUsers", uid),
      (snap) => {
        if (!snap.exists()) {
          const email = auth.currentUser?.email ?? "";
          setDoc(
            doc(db, "partnerUsers", uid),
            {
              uid,
              email,
              role: "partner",
              grade: "준회원",
              verificationStatus: "미제출",
              profileCompleted: false,
              businessVerified: false,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          ).catch((err) => {
            console.error("[partner][user] create error", err);
          });
          setUser(null);
        } else {
          setUser({ id: snap.id, ...(snap.data() as Omit<PartnerUserDoc, "id">) });
        }
        setLoading(false);
      },
      (err) => {
        console.error("[partner][user] load error", err);
        setUser(null);
        setLoading(false);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [uid]);

  return { user, loading };
}
