import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/firebase";

type CreateSupportTicketParams = {
  userId: string;
  userEmail: string;
  subject: string;
  content: string;
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
