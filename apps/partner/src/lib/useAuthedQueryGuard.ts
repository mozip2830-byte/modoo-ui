import { useAuth } from "@/src/auth/AuthProvider";
import { useMemo } from "react";

export function useAuthedQueryGuard() {
  const { authReady, uid } = useAuth();

  return useMemo(() => {
    const enabled = Boolean(authReady && uid);

    const status =
      !authReady ? "authLoading" : !uid ? "noUid" : "ready";

    return { enabled, uid: uid ?? null, status };
  }, [authReady, uid]);
}
