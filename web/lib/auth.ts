"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

import { auth } from "@/lib/firebaseClient";

const provider = new GoogleAuthProvider();

export async function signInWithGooglePopup() {
  return signInWithPopup(auth, provider);
}
