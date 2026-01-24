import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/src/firebase";

type CreateSupportTicketParams = {
  userId: string;
  userEmail: string;
  subject: string;
  content: string;
};

export type SupportTicket = {
  id: string;
  subject: string;
  status: "open" | "inProgress" | "resolved" | "closed";
  priority?: "low" | "medium" | "high";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type SupportMessage = {
  id: string;
  senderType: "user" | "admin";
  senderEmail?: string;
  content: string;
  createdAt?: Timestamp;
};

export async function createSupportTicket(params: CreateSupportTicketParams): Promise<string> {
  const { userId, userEmail, subject, content } = params;

  const ticketRef = await addDoc(collection(db, "supportTickets"), {
    userId,
    userType: "customer",
    userEmail,
    subject,
    status: "open",
    priority: "medium",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, "supportTickets", ticketRef.id, "messages"), {
    senderId: userId,
    senderType: "user",
    senderEmail: userEmail,
    content,
    createdAt: serverTimestamp(),
  });

  return ticketRef.id;
}

export async function getSupportTicketsByUser(userId: string): Promise<SupportTicket[]> {
  const ticketsRef = collection(db, "supportTickets");
  const q = query(ticketsRef, where("userId", "==", userId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  const tickets: SupportTicket[] = [];
  snapshot.forEach((docSnap) => {
    tickets.push({ id: docSnap.id, ...(docSnap.data() as SupportTicket) });
  });
  return tickets;
}

export async function getSupportTicketById(ticketId: string): Promise<SupportTicket | null> {
  const ref = doc(db, "supportTickets", ticketId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as SupportTicket) };
}

export async function getSupportMessages(ticketId: string): Promise<SupportMessage[]> {
  const messagesRef = collection(db, "supportTickets", ticketId, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);
  const messages: SupportMessage[] = [];
  snapshot.forEach((docSnap) => {
    messages.push({ id: docSnap.id, ...(docSnap.data() as SupportMessage) });
  });
  return messages;
}
