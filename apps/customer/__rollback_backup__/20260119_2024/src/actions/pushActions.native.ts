import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import { db } from "@/src/firebase";

declare const require: (id: string) => any;

type RegisterInput = {
  uid: string;
  role: "partner" | "customer";
  displayName?: string | null;
};

type UnregisterInput = {
  uid: string;
  token: string;
};

function loadNotifications() {
  try {
    return require("expo-notifications");
  } catch (err) {
    console.warn("[push] expo-notifications unavailable", err);
    return null;
  }
}

function loadDevice() {
  try {
    return require("expo-device");
  } catch (err) {
    console.warn("[push] expo-device unavailable", err);
    return null;
  }
}

export async function registerFcmToken(input: RegisterInput) {
  const Notifications = loadNotifications();
  const Device = loadDevice();
  if (!Notifications || !Device) return null;

  if (!Device.isDevice) {
    console.warn("[push] Device required for push tokens");
    return null;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== "granted") {
      console.warn("[push] Permission not granted");
      return null;
    }

    const token = (await Notifications.getDevicePushTokenAsync()).data;
    const ref = doc(db, "users", input.uid);

    await setDoc(
      ref,
      {
        role: input.role,
        displayName: input.displayName ?? null,
        fcmTokens: { [token]: true },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return token;
  } catch (err) {
    console.warn("[push] register failed", err);
    return null;
  }
}

export async function unregisterFcmToken(input: UnregisterInput) {
  try {
    const ref = doc(db, "users", input.uid);
    await updateDoc(ref, {
      [`fcmTokens.${input.token}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[push] unregister failed", err);
  }

  return null;
}
