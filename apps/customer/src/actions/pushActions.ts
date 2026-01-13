import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import { db } from "@/src/firebase";

type RegisterInput = {
  uid: string;
  role: "partner" | "customer";
  displayName?: string | null;
};

type UnregisterInput = {
  uid: string;
  token: string;
};

export async function registerFcmToken(input: RegisterInput) {
  if (!Device.isDevice) {
    console.log("[push] Device required for push tokens");
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== "granted") {
    console.log("[push] Permission not granted");
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
}

export async function unregisterFcmToken(input: UnregisterInput) {
  const ref = doc(db, "users", input.uid);
  await updateDoc(ref, {
    [`fcmTokens.${input.token}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
}
