"use client";

import { auth } from "@/lib/firebaseClient";

export type LedgerItem = {
  id: string;
  amount: number;
  type: "credit" | "debit";
  reason: string;
  orderId?: string | null;
  createdAt?: string;
};

export async function getBalance() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }
  const token = await user.getIdToken();
  const resp = await fetch("/api/points/balance", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.message ?? "잔액 조회에 실패했습니다.");
  }
  return data as { balance: number };
}

export async function getLedger() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }
  const token = await user.getIdToken();
  const resp = await fetch("/api/points/ledger", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.message ?? "원장 조회에 실패했습니다.");
  }
  return data as LedgerItem[];
}
