import { db } from "@/src/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

type SubmitQuoteInput = {
  partnerId: string;
  price: number;
  message?: string;
};

export async function submitQuote(requestId: string, input: SubmitQuoteInput) {
  if (!requestId) throw new Error("requestId가 비어있습니다.");
  if (!input?.partnerId) throw new Error("partnerId가 비어있습니다.");
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new Error("price가 올바르지 않습니다.");
  }

  const payload = {
    requestId,                 // ✅ 여기 절대 undefined면 안됨
    partnerId: input.partnerId,
    price: input.price,
    message: input.message ?? "",
    status: "submitted",
    createdAt: serverTimestamp(),
  };

  return await addDoc(collection(db, "quotes"), payload);
}
