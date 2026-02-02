"use client";

import { auth } from "@/lib/firebaseClient";

export type PaymentOrder = {
  orderId: string;
  uid: string;
  amount: number;
  productId: string;
  status: "READY" | "PAID" | "FAILED" | "CANCELLED";
  pgProvider?: "stub" | "toss" | "inicis" | "nice" | null;
  pgTxId?: string | null;
  statusDetail?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export async function createOrder(productId: string) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }
  const token = await user.getIdToken();
  const resp = await fetch("/api/pay/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ productId })
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.message ?? "주문 생성에 실패했습니다.");
  }
  return data as { orderId: string };
}

export async function getOrder(orderId: string) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }
  const token = await user.getIdToken();
  const resp = await fetch(`/api/pay/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.message ?? "주문 조회에 실패했습니다.");
  }
  return data as PaymentOrder;
}
