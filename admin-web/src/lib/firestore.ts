import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

/* =====================================================
   Types
   ===================================================== */

export type CustomerUser = {
  uid: string;
  email: string;
  displayName?: string;
  phoneNumber?: string;
  points?: number;
  tier?: string;
  status?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type PartnerUser = {
  uid: string;
  email: string;
  displayName?: string;
  phoneNumber?: string;
  businessName?: string;
  businessNumber?: string;
  businessVerified?: boolean;
  verificationStatus?: string;
  grade?: string;
  subscriptionStatus?: string;
  subscriptionPlan?: string;
  subscriptionEndDate?: Timestamp;
  trustScore?: number;
  regions?: string[];
  services?: string[];
  points?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type SupportTicket = {
  id: string;
  userId: string;
  userType: "customer" | "partner";
  userEmail: string;
  subject: string;
  status: "open" | "inProgress" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  resolvedAt?: Timestamp;
  assignedTo?: string;
};

export type TicketMessage = {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: "user" | "admin";
  senderEmail: string;
  content: string;
  createdAt: Timestamp;
};

export type AuditLog = {
  id: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  targetCollection: string;
  targetDocId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: Timestamp;
};

/* =====================================================
   Audit Logging
   ===================================================== */

export async function logAdminAction(params: {
  adminUid: string;
  adminEmail: string;
  action: string;
  targetCollection: string;
  targetDocId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}) {
  const { adminUid, adminEmail, action, targetCollection, targetDocId, before, after } = params;

  await addDoc(collection(db, "adminAuditLogs"), {
    adminUid,
    adminEmail,
    action,
    targetCollection,
    targetDocId,
    before: before || null,
    after: after || null,
    createdAt: serverTimestamp(),
  });
}

/* =====================================================
   Customer Users
   ===================================================== */

export async function searchCustomerUsers(searchTerm: string): Promise<CustomerUser[]> {
  const results: CustomerUser[] = [];
  const usersRef = collection(db, "customerUsers");

  // Search by UID (exact match)
  if (searchTerm.length >= 10) {
    const docRef = doc(db, "customerUsers", searchTerm);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      results.push({ uid: docSnap.id, ...docSnap.data() } as CustomerUser);
      return results;
    }
  }

  // Search by email (exact match since Firestore doesn't support LIKE)
  const emailQuery = query(usersRef, where("email", "==", searchTerm), limit(20));
  const emailSnapshot = await getDocs(emailQuery);
  emailSnapshot.forEach((doc) => {
    results.push({ uid: doc.id, ...doc.data() } as CustomerUser);
  });

  return results;
}

export async function getCustomerUser(uid: string): Promise<CustomerUser | null> {
  const docRef = doc(db, "customerUsers", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { uid: docSnap.id, ...docSnap.data() } as CustomerUser;
  }
  return null;
}

export async function updateCustomerUser(
  uid: string,
  updates: Partial<CustomerUser>,
  adminUid: string,
  adminEmail: string
): Promise<void> {
  const docRef = doc(db, "customerUsers", uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error("User not found");
  }

  const before = docSnap.data();

  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  await logAdminAction({
    adminUid,
    adminEmail,
    action: "UPDATE_CUSTOMER_USER",
    targetCollection: "customerUsers",
    targetDocId: uid,
    before,
    after: updates,
  });
}

/* =====================================================
   Partner Users
   ===================================================== */

export async function searchPartnerUsers(searchTerm: string): Promise<PartnerUser[]> {
  const results: PartnerUser[] = [];
  const usersRef = collection(db, "partnerUsers");

  // Search by UID (exact match)
  if (searchTerm.length >= 10) {
    const docRef = doc(db, "partnerUsers", searchTerm);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      results.push({ uid: docSnap.id, ...docSnap.data() } as PartnerUser);
      return results;
    }
  }

  // Search by email (exact match)
  const emailQuery = query(usersRef, where("email", "==", searchTerm), limit(20));
  const emailSnapshot = await getDocs(emailQuery);
  emailSnapshot.forEach((doc) => {
    results.push({ uid: doc.id, ...doc.data() } as PartnerUser);
  });

  return results;
}

export async function getPartnerUser(uid: string): Promise<PartnerUser | null> {
  const docRef = doc(db, "partnerUsers", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { uid: docSnap.id, ...docSnap.data() } as PartnerUser;
  }
  return null;
}

export async function updatePartnerUser(
  uid: string,
  updates: Partial<PartnerUser>,
  adminUid: string,
  adminEmail: string
): Promise<void> {
  const docRef = doc(db, "partnerUsers", uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error("User not found");
  }

  const before = docSnap.data();

  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  await logAdminAction({
    adminUid,
    adminEmail,
    action: "UPDATE_PARTNER_USER",
    targetCollection: "partnerUsers",
    targetDocId: uid,
    before,
    after: updates,
  });
}

export async function updatePartnerPoints(
  uid: string,
  newPoints: number,
  adminUid: string,
  adminEmail: string
): Promise<void> {
  const docRef = doc(db, "partnerUsers", uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error("User not found");
  }

  const before = docSnap.data();
  const oldPoints = before.points ?? 0;

  await updateDoc(docRef, {
    points: newPoints,
    updatedAt: serverTimestamp(),
  });

  await logAdminAction({
    adminUid,
    adminEmail,
    action: "partner_points_update",
    targetCollection: "partnerUsers",
    targetDocId: uid,
    before: { points: oldPoints },
    after: { points: newPoints },
  });
}

/* =====================================================
   Support Tickets
   ===================================================== */

export async function getSupportTickets(statusFilter?: string): Promise<SupportTicket[]> {
  const ticketsRef = collection(db, "supportTickets");
  let q;

  if (statusFilter && statusFilter !== "all") {
    q = query(
      ticketsRef,
      where("status", "==", statusFilter),
      orderBy("createdAt", "desc"),
      limit(50)
    );
  } else {
    q = query(ticketsRef, orderBy("createdAt", "desc"), limit(50));
  }

  const snapshot = await getDocs(q);
  const tickets: SupportTicket[] = [];
  snapshot.forEach((doc) => {
    tickets.push({ id: doc.id, ...doc.data() } as SupportTicket);
  });

  return tickets;
}

export async function getSupportTicket(ticketId: string): Promise<SupportTicket | null> {
  const docRef = doc(db, "supportTickets", ticketId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as SupportTicket;
  }
  return null;
}

export async function getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const messagesRef = collection(db, "supportTickets", ticketId, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);
  const messages: TicketMessage[] = [];
  snapshot.forEach((doc) => {
    messages.push({ id: doc.id, ticketId, ...doc.data() } as TicketMessage);
  });
  return messages;
}

export async function addTicketMessage(
  ticketId: string,
  message: {
    senderId: string;
    senderType: "user" | "admin";
    senderEmail: string;
    content: string;
  }
): Promise<string> {
  const messagesRef = collection(db, "supportTickets", ticketId, "messages");
  const docRef = await addDoc(messagesRef, {
    ...message,
    createdAt: serverTimestamp(),
  });

  // Update ticket's updatedAt
  const ticketRef = doc(db, "supportTickets", ticketId);
  await updateDoc(ticketRef, {
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function updateTicketStatus(
  ticketId: string,
  newStatus: SupportTicket["status"],
  adminUid: string,
  adminEmail: string
): Promise<void> {
  const ticketRef = doc(db, "supportTickets", ticketId);
  const ticketSnap = await getDoc(ticketRef);

  if (!ticketSnap.exists()) {
    throw new Error("Ticket not found");
  }

  const before = ticketSnap.data();
  const updates: Record<string, unknown> = {
    status: newStatus,
    updatedAt: serverTimestamp(),
  };

  if (newStatus === "resolved" || newStatus === "closed") {
    updates.resolvedAt = serverTimestamp();
  }

  await updateDoc(ticketRef, updates);

  await logAdminAction({
    adminUid,
    adminEmail,
    action: "UPDATE_TICKET_STATUS",
    targetCollection: "supportTickets",
    targetDocId: ticketId,
    before,
    after: { status: newStatus },
  });
}

/* =====================================================
   Create Test Ticket (for development)
   ===================================================== */

export async function createTestTicket(params: {
  userId: string;
  userType: "customer" | "partner";
  userEmail: string;
  subject: string;
  content: string;
}): Promise<string> {
  const { userId, userType, userEmail, subject, content } = params;

  const ticketRef = await addDoc(collection(db, "supportTickets"), {
    userId,
    userType,
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
