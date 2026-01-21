import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "@/src/firebase";
import type { PartnerUserDoc } from "@/src/types/models";

type SignInInput = {
  email: string;
  password: string;
};

type SignUpInput = {
  email: string;
  password: string;
};

type ResetInput = {
  email: string;
};

const PARTNER_USERS = "partnerUsers";

/**
 * Create partner user doc ONLY if it doesn't exist.
 * Never overwrite approval-related fields for existing users.
 */
async function upsertPartnerUser(uid: string, email?: string | null) {
  const docRef = doc(db, PARTNER_USERS, uid);
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    // Document exists - only update email if needed, never touch approval fields
    const data = snap.data();
    if (!data.email && email) {
      await setDoc(docRef, { email }, { merge: true });
    }
    return;
  }

  // New user - create with defaults
  const now = serverTimestamp();
  await setDoc(
    docRef,
    {
      uid,
      email: email ?? "",
      role: "partner",
      grade: "준회원",
      verificationStatus: "승인",
      profileCompleted: false,
      businessVerified: false,
      points: 0,
      serviceTickets: 0,
      createdAt: now,
    },
    { merge: true }
  );
}

export async function signInPartner(input: SignInInput) {
  const credential = await signInWithEmailAndPassword(auth, input.email, input.password);
  await upsertPartnerUser(credential.user.uid, credential.user.email);
  const user = await ensurePartnerUser(credential.user.uid);
  return user;
}

export async function signUpPartner(input: SignUpInput) {
  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  const uid = credential.user.uid;
  const now = serverTimestamp();

  await setDoc(
    doc(db, PARTNER_USERS, uid),
    {
      uid,
      email: credential.user.email ?? input.email,
      role: "partner",
      grade: "준회원",
      verificationStatus: "승인",
      profileCompleted: false,
      businessVerified: false,
      points: 0,
      serviceTickets: 0,
      createdAt: now,
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "partners", uid),
    {
      tier: "associate",
      approvedStatus: "준회원",
      businessVerified: false,
      isActive: true,
      points: { balance: 0, updatedAt: now },
      subscription: {
        status: "none",
        plan: "trial_7d",
        autoRenew: false,
        discountRate: 0,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        nextBillingAt: null,
        provider: null,
      },
      updatedAt: now,
    },
    { merge: true }
  );

  return uid;
}

export async function signInPartnerWithGoogle(input: { idToken: string; accessToken?: string }) {
  const credential = GoogleAuthProvider.credential(input.idToken, input.accessToken);
  const result = await signInWithCredential(auth, credential);
  await upsertPartnerUser(result.user.uid, result.user.email);
  return ensurePartnerUser(result.user.uid);
}

export async function resetPartnerPassword(input: ResetInput) {
  await sendPasswordResetEmail(auth, input.email);
}

export async function signOutPartner() {
  await signOut(auth);
}

export async function ensurePartnerUser(uid: string): Promise<PartnerUserDoc> {
  const snap = await getDoc(doc(db, PARTNER_USERS, uid));
  if (!snap.exists()) {
    await upsertPartnerUser(uid, auth.currentUser?.email ?? "");
    const fresh = await getDoc(doc(db, PARTNER_USERS, uid));
    const data = fresh.data() as Omit<PartnerUserDoc, "id">;
    return { id: fresh.id, ...data };
  }
  const data = snap.data() as Omit<PartnerUserDoc, "id">;
  if (data.role !== "partner") {
    await signOut(auth);
    throw new Error("파트너 계정이 아닙니다.");
  }
  return { id: snap.id, ...data };
}

export async function updatePartnerProfileCompletion(uid: string, data: Partial<PartnerUserDoc>) {
  await setDoc(
    doc(db, PARTNER_USERS, uid),
    {
      ...data,
    },
    { merge: true }
  );
}
