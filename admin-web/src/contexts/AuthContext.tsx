"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  IdTokenResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  claims: Record<string, unknown> | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  claims: null,
  isAdmin: false,
  signOut: async () => {},
  refreshToken: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);

  const fetchClaims = async (currentUser: User) => {
    try {
      const tokenResult: IdTokenResult = await currentUser.getIdTokenResult();
      setClaims(tokenResult.claims as Record<string, unknown>);
    } catch (err) {
      console.error("Failed to fetch claims:", err);
      setClaims(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchClaims(currentUser);
      } else {
        setClaims(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setClaims(null);
  };

  const refreshToken = async () => {
    if (user) {
      // Force refresh token to get updated claims
      await user.getIdToken(true);
      await fetchClaims(user);
    }
  };

  const isAdmin = Boolean(claims?.admin === true);

  return (
    <AuthContext.Provider
      value={{ user, loading, claims, isAdmin, signOut, refreshToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
