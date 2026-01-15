import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
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

// Use persistence for native platforms to enable auto-login
// On native, use AsyncStorage-based persistence; on web, use default browser persistence
function getAuth$() {
  if (Platform.OS === "web") {
    return getAuth(app);
  }
  // Dynamically require AsyncStorage only on native platforms
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Fallback to default auth if AsyncStorage is not available
    return getAuth(app);
  }
}

export const auth = getAuth$();

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export const storage = getStorage(app);
