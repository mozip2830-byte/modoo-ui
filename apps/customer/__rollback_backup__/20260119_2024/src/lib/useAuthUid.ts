// src/lib/useAuthUid.ts
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

export type AuthUidStatus = "authLoading" | "ready" | "noUid";

export function useAuthUid(): { uid: string | null; status: AuthUidStatus } {
  const [uid, setUid] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthUidStatus>("authLoading");

  useEffect(() => {
    const auth = getAuth();
    // 초기값(동기)도 안전하게
    const initialUid = auth.currentUser?.uid ?? null;
    setUid(initialUid);
    setStatus(initialUid ? "ready" : "authLoading");

    const unsub = onAuthStateChanged(auth, (user) => {
      const nextUid = user?.uid ?? null;
      setUid(nextUid);
      setStatus(nextUid ? "ready" : "noUid");
    });

    return () => unsub();
  }, []);

  return { uid, status };
}
