import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

/**
 * Firebase configuration for modoo-dev project.
 * This is the same config used by customer/partner apps.
 */
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
export const auth = getAuth(app);
