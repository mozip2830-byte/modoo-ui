"use client";

import { auth } from "@/lib/firebaseClient";

type OnboardPayload = {
  displayName: string;
  phone?: string;
  serviceRegion?: string;
  agreeTerms: boolean;
};

export async function onboardPartner(payload: OnboardPayload) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }
  const token = await user.getIdToken();
  const resp = await fetch("/api/partner/onboard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.message ?? "요청에 실패했습니다.");
  }
  return data as { ok: boolean };
}
