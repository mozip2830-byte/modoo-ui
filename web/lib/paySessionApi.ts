"use client";

import { auth } from "@/lib/firebaseClient";

export async function createPaySession(orderId: string) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }
  const token = await user.getIdToken();
  const resp = await fetch("/api/pay/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ orderId })
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.message ?? "결제 세션 생성에 실패했습니다.");
  }
  return data as { redirectUrl: string };
}
