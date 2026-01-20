import { onIdTokenChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';

import { auth } from '@/src/firebase';

type AuthResult = {
  uid: string | null;
  ready: boolean;
};

type AuthState = {
  uid: string | null;
  loading: boolean;
};

/**
 * 핵심 훅: uid + ready 반환
 * ready는 onIdTokenChanged가 최초 1회 콜백을 받으면 true가 됨
 * → 이후 Firestore 구독을 시작해야 permission-denied를 피할 수 있음
 */
export function useAuthUid(): AuthResult {
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      setUid(user ? user.uid : null);
      setReady(true);
    });
    return () => unsubscribe();
  }, []);

  return { uid, ready };
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({
    uid: auth.currentUser?.uid ?? null,
    loading: !auth.currentUser,
  });

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      setState({
        uid: user ? user.uid : null,
        loading: false,
      });
    });
    return () => unsubscribe();
  }, []);

  return state;
}
