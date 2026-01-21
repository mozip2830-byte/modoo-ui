import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "@/src/firebase";
import type { PartnerUserDoc } from "@/src/types/models";

export function usePartnerUser(uid?: string | null) {
  const [user, setUser] = useState<PartnerUserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const createdRef = useRef<Set<string>>(new Set());

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
          // Only create if we haven't already tried for this uid
          if (!createdRef.current.has(uid)) {
            createdRef.current.add(uid);
            const email = auth.currentUser?.email ?? "";
            setDoc(
              doc(db, "partnerUsers", uid),
              {
                uid,
                email,
                role: "partner",
                grade: "준회원",
                verificationStatus: "승인",
                profileCompleted: false,
                businessVerified: false,
                createdAt: serverTimestamp(),
              },
              { merge: true }
            ).catch((err) => {
              console.error("[partner][user] create error", err);
            });
          }
          setUser(null);
        } else {
          // Document exists - never overwrite, just read
          const data = snap.data() as Omit<PartnerUserDoc, "id">;
          const verificationStatus =
            data.verificationStatus === "미제출" ? "승인" : data.verificationStatus;
          setUser({ id: snap.id, ...data, verificationStatus });
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
