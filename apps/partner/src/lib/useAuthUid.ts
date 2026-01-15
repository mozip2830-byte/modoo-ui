import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from '@/src/firebase';

type AuthState = {
  uid: string | null;
  loading: boolean;
};

export function useAuthUid(): string | null {
  const [state, setState] = useState<AuthState>({
    uid: auth.currentUser?.uid ?? null,
    loading: !auth.currentUser,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState({
        uid: user ? user.uid : null,
        loading: false,
      });
    });
    return () => unsubscribe();
  }, []);

  return state.uid;
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({
    uid: auth.currentUser?.uid ?? null,
    loading: !auth.currentUser,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState({
        uid: user ? user.uid : null,
        loading: false,
      });
    });
    return () => unsubscribe();
  }, []);

  return state;
}
