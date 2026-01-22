import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";

import { db } from "@/src/firebase";

export type QuoteTemplateDoc = {
  id: string;
  partnerId: string;
  title: string;
  memo: string;
  photoUrls: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

type CreateQuoteTemplateInput = {
  partnerId: string;
  title: string;
  memo: string;
  photoUrls: string[];
};

export async function createQuoteTemplate(input: CreateQuoteTemplateInput) {
  const ref = await addDoc(collection(db, "partnerQuoteTemplates"), {
    partnerId: input.partnerId,
    title: input.title,
    memo: input.memo,
    photoUrls: input.photoUrls,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteQuoteTemplate(templateId: string) {
  if (!templateId) return;
  await deleteDoc(doc(db, "partnerQuoteTemplates", templateId));
}

export function subscribeQuoteTemplates(partnerId: string, onData: (items: QuoteTemplateDoc[]) => void) {
  if (!partnerId) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, "partnerQuoteTemplates"), where("partnerId", "==", partnerId));

  return onSnapshot(q, (snap) => {
    onData(
      snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<QuoteTemplateDoc, "id">),
      }))
    );
  });
}
