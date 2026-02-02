"use client";

import { doc, getDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";

import { db } from "@/lib/firebaseClient";
import { Role, USERS_COLLECTION } from "@/lib/roles";

type RoleState = {
  role: Role | null;
  loading: boolean;
  error: string | null;
};

const roleCache = new Map<string, Role | null>();

export function clearRoleCache(uid?: string) {
  if (!uid) {
    roleCache.clear();
    return;
  }
  roleCache.delete(uid);
}

export function useUserRole(uid?: string | null): RoleState {
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setRole(null);
      setLoading(false);
      return;
    }

    if (roleCache.has(uid)) {
      setRole(roleCache.get(uid) ?? null);
      setLoading(false);
      return;
    }

    if (inflightRef.current === uid) return;
    inflightRef.current = uid;
    setLoading(true);
    setError(null);

    getDoc(doc(db, USERS_COLLECTION, uid))
      .then((snap) => {
        if (!snap.exists()) {
          roleCache.set(uid, "customer");
          setRole("customer");
          return;
        }
        const data = snap.data() as { role?: Role };
        const nextRole = data.role ?? "customer";
        roleCache.set(uid, nextRole);
        setRole(nextRole);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "role load error");
        setRole("customer");
      })
      .finally(() => {
        setLoading(false);
        inflightRef.current = null;
      });
  }, [uid]);

  return { role, loading, error };
}
