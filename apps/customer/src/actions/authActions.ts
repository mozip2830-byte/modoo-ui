import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "@/src/firebase";

type SignInInput = {
  email: string;
  password: string;
};

type SignUpInput = {
  email: string;
  password: string;
  name: string;
  phone: string;
  phoneVerified: boolean;
  nickname?: string;
  addressDong: string;
  addressRoad: string;
};

type ResetInput = {
  email: string;
};

const CUSTOMER_USERS = "customerUsers";

async function upsertCustomerUser(
  uid: string,
  email?: string | null,
      extra?: {
        name?: string;
        phone?: string;
        phoneVerified?: boolean;
        nickname?: string;
        photoUrl?: string;
        photoPath?: string;
        addressDong?: string;
        addressRoad?: string;
      }
) {
  const now = serverTimestamp();
  await setDoc(
    doc(db, CUSTOMER_USERS, uid),
    {
      uid,
      email: email ?? "",
      role: "customer",
      ...(extra ?? {}),
      createdAt: now,
    },
    { merge: true }
  );
}

export async function signInCustomer(input: SignInInput) {
  const credential = await signInWithEmailAndPassword(auth, input.email, input.password);
  await upsertCustomerUser(credential.user.uid, credential.user.email);
}

export async function signUpCustomer(input: SignUpInput) {
  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await upsertCustomerUser(credential.user.uid, credential.user.email ?? input.email, {
    name: input.name,
    phone: input.phone,
    phoneVerified: input.phoneVerified,
    nickname: input.nickname ?? input.name,
    addressDong: input.addressDong,
    addressRoad: input.addressRoad,
  });
}

export async function signInCustomerWithGoogle(input: { idToken: string; accessToken?: string }) {
  const credential = GoogleAuthProvider.credential(input.idToken, input.accessToken);
  const result = await signInWithCredential(auth, credential);
  await upsertCustomerUser(result.user.uid, result.user.email);
}

export async function signInCustomerWithCustomToken(input: {
  token: string;
  profile?: { email?: string; name?: string; nickname?: string };
}) {
  const result = await signInWithCustomToken(auth, input.token);
  await upsertCustomerUser(result.user.uid, input.profile?.email ?? result.user.email, {
    name: input.profile?.name,
    nickname: input.profile?.nickname,
  });
}

export async function resetCustomerPassword(input: ResetInput) {
  await sendPasswordResetEmail(auth, input.email);
}

export async function signOutCustomer() {
  await signOut(auth);
}

export async function ensureCustomerUser(uid: string) {
  const snap = await getDoc(doc(db, CUSTOMER_USERS, uid));
  if (!snap.exists()) {
    await upsertCustomerUser(uid, auth.currentUser?.email ?? "");
  }
}
