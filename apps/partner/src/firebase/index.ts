import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, inMemoryPersistence, type Auth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyChiyuhcpoEP9638b37rPmGg25t7qOScOA",
  authDomain: "modoo-dev-70c6b.firebaseapp.com",
  projectId: "modoo-dev-70c6b",
  storageBucket: "modoo-dev-70c6b.firebasestorage.app",
  messagingSenderId: "61388388348",
  appId: "1:61388388348:web:2df8e11a32550ede5d6479",
  measurementId: "G-QE18FEND4K",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let _authInstance: Auth | null = null;

function getAuth$(firebaseApp: FirebaseApp): Auth {
  if (_authInstance) return _authInstance;

  if (Platform.OS === "web") {
    _authInstance = getAuth(firebaseApp);
    return _authInstance;
  }

  try {
    _authInstance = initializeAuth(firebaseApp, {
      persistence: inMemoryPersistence,
    });
    return _authInstance;
  } catch (error: unknown) {
    const errorCode = (error as { code?: string })?.code;
    if (errorCode === "auth/already-initialized") {
      _authInstance = getAuth(firebaseApp);
      return _authInstance;
    }
    console.warn("[firebase] Auth init failed, using default:", error);
    _authInstance = getAuth(firebaseApp);
    return _authInstance;
  }
}

export const auth = getAuth$(app);

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export const storage = getStorage(app);
export const functions = getFunctions(app);
