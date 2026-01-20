import { getAuth, onIdTokenChanged, type User } from "firebase/auth";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AuthContextValue = {
  authReady: boolean; // ✅ "토큰까지 준비 완료" 시점
  user: User | null;
  uid: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const auth = getAuth();

    const unsub = onIdTokenChanged(
      auth,
      async (nextUser) => {
        setUser(nextUser);

        // ✅ 토큰 확보까지 기다렸다가 ready=true
        if (nextUser) {
          try {
            await nextUser.getIdToken();
          } catch (e) {
            console.warn("[auth] getIdToken failed:", e);
          }
        }

        setAuthReady(true);
      },
      (err) => {
        console.warn("[auth] onIdTokenChanged error:", err);
        setUser(null);
        setAuthReady(true);
      }
    );

    return () => unsub();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      authReady,
      user,
      uid: user?.uid ?? null,
    };
  }, [authReady, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider />");
  return ctx;
}
