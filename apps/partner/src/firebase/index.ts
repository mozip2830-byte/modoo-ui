import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, type Auth } from "firebase/auth";
// @ts-ignore - getReactNativePersistence exists but types may not be available
import { getReactNativePersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
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

// Singleton to track if auth has been initialized with persistence
let _authInstance: Auth | null = null;

// Use persistence for native platforms to enable auto-login
// On native, use AsyncStorage-based persistence; on web, use default browser persistence
function getAuth$(firebaseApp: FirebaseApp): Auth {
  // Return cached instance if available
  if (_authInstance) {
    return _authInstance;
  }

  if (Platform.OS === "web") {
    _authInstance = getAuth(firebaseApp);
    return _authInstance;
  }

  // For React Native, initialize auth with AsyncStorage persistence
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    _authInstance = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
    return _authInstance;
  } catch (error: unknown) {
    // Check if it's "already initialized" error - this is OK
    const errorCode = (error as { code?: string })?.code;
    if (errorCode === "auth/already-initialized") {
      // Auth was already initialized (e.g., hot reload) - get existing instance
      _authInstance = getAuth(firebaseApp);
      return _authInstance;
    }
    // For other errors (AsyncStorage not available, etc.), log and use fallback
    console.warn("[firebase] Auth persistence setup failed, using default:", error);
    _authInstance = getAuth(firebaseApp);
    return _authInstance;
  }
}

export const auth = getAuth$(app);

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export const storage = getStorage(app);
