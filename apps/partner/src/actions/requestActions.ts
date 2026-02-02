import { db } from "@/src/firebase";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    startAfter,
    updateDoc,
    where,
    DocumentSnapshot,
} from "firebase/firestore";

import type { RequestDoc } from "@/src/types/models";

type SubscribeOpenInput = {
  limit?: number;
  onData: (requests: RequestDoc[]) => void;
  onError?: (error: unknown) => void;
};

type SubscribeMyQuotedInput = {
  partnerId: string;
  limit?: number; // 선택: 성능 위해 open 요청 중 상위 N개만 검사
  onData: (requests: RequestDoc[]) => void;
  onError?: (error: unknown) => void;
};

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function isExpiredRequest(createdAt: unknown) {
  const ts = createdAt as { toMillis?: () => number } | null;
  const ms = ts?.toMillis ? ts.toMillis() : null;
  if (!ms) return false;
  return Date.now() - ms >= FIVE_DAYS_MS;
}

async function closeExpiredRequest(requestId: string) {
  try {
    await updateDoc(doc(db, "requests", requestId), {
      status: "closed",
      isClosed: true,
    });
  } catch (error) {
    console.warn("[requests] auto-close failed", { requestId, error });
  }
}

// ================================
// 1) 오픈 요청 리스트 (기존 유지)
// ================================
export function subscribeOpenRequestsForPartner(input: SubscribeOpenInput) {
  const q = query(
    collection(db, "requests"),
    // ✅ FIX: 견적이 선택되어 status가 변경되더라도, 10개가 차기 전(isClosed=false)이면 노출    orderBy("createdAt", "desc"),
    ...(input.limit ? [limit(input.limit)] : [])
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<RequestDoc, "id">),
      }));

      const active: RequestDoc[] = [];
      rows.forEach((row) => {
        if (isExpiredRequest(row.createdAt)) {
          void closeExpiredRequest(row.id);
        } else {
          active.push(row);
        }
      });

      input.onData(active);
    },
    (error) => {
      input.onError?.(error);
    }
  );
}

// ============================================================
// 2) 내가 견적 넣은 요청 (collectionGroup 제거한 안전 버전)
// - open requests를 구독
// - 각 requestId에 대해 requests/{id}/quotes/{partnerId} 존재 여부만 체크
// ============================================================
export function subscribeMyQuotedRequestsForPartner(input: SubscribeMyQuotedInput) {
  if (!input.partnerId) {
    input.onData([]);
    return () => {};
  }

  // "내가 견적 넣은 요청"은 보통 open 기준으로 보고 싶어함
  // (원하면 여기 조건을 바꿔서 open이 아닌 것도 포함 가능)
  const rq = query(
    collection(db, "requests"),
    orderBy("createdAt", "desc"),
    ...(input.limit ? [limit(input.limit)] : [])
  );

  return onSnapshot(
    rq,
    async (snap) => {
      try {
        const requestDocs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RequestDoc, "id">),
        })) as RequestDoc[];

        if (requestDocs.length === 0) {
          input.onData([]);
          return;
        }

        requestDocs.forEach((row) => {
          if (isExpiredRequest(row.createdAt)) {
            void closeExpiredRequest(row.id);
          }
        });

        // quotes/{partnerId} 문서가 "존재하는 요청"만 남김
        const checks = await Promise.all(
          requestDocs.map(async (r) => {
            const qref = doc(db, "requests", r.id, "quotes", input.partnerId);
            const qsnap = await getDoc(qref);
            return qsnap.exists() ? r : null;
          })
        );

        const filtered = checks.filter((x): x is RequestDoc => Boolean(x));

        // createdAt desc 정렬(안전)
        filtered.sort((a, b) => {
          const aMs = (a.createdAt as any)?.toMillis ? (a.createdAt as any).toMillis() : 0;
          const bMs = (b.createdAt as any)?.toMillis ? (b.createdAt as any).toMillis() : 0;
          return bMs - aMs;
        });

        input.onData(filtered);
      } catch (e) {
        input.onError?.(e);
      }
    },
    (error) => {
      input.onError?.(error);
    }
  );
}

// ============================================================
// 3) Cursor Pagination: 신규 요청 페이지 조회
// ============================================================
type GetOpenRequestsPageResult = {
  docs: RequestDoc[];
  lastDoc: DocumentSnapshot | null;
};

export async function getOpenRequestsPage(
  pageSize: number = 10,
  lastDocSnapshot?: DocumentSnapshot
): Promise<GetOpenRequestsPageResult> {
  try {
    const constraints = [
      orderBy("createdAt", "desc"),
      limit(pageSize),
      ...(lastDocSnapshot ? [startAfter(lastDocSnapshot)] : []),
    ];

    const q = query(collection(db, "requests"), ...constraints);
    const snap = await getDocs(q);

    const docs = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<RequestDoc, "id">),
    })) as RequestDoc[];

    const active: RequestDoc[] = [];
    docs.forEach((row) => {
      if (isExpiredRequest(row.createdAt)) {
        void closeExpiredRequest(row.id);
      } else {
        active.push(row);
      }
    });

    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

    return { docs: active, lastDoc };
  } catch (error) {
    console.error("[requests] getOpenRequestsPage error", error);
    throw error;
  }
}

// ============================================================
// 4) Cursor Pagination: 내 견적 페이지 조회
// ============================================================
type GetMyQuotedRequestsPageResult = {
  docs: RequestDoc[];
  lastDoc: DocumentSnapshot | null;
};

export async function getMyQuotedRequestsPage(
  partnerId: string,
  pageSize: number = 10,
  lastDocSnapshot?: DocumentSnapshot
): Promise<GetMyQuotedRequestsPageResult> {
  if (!partnerId) {
    return { docs: [], lastDoc: null };
  }

  try {
    const constraints = [
      orderBy("createdAt", "desc"),
      limit(pageSize),
      ...(lastDocSnapshot ? [startAfter(lastDocSnapshot)] : []),
    ];

    const q = query(collection(db, "requests"), ...constraints);
    const snap = await getDocs(q);

    const requestDocs = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<RequestDoc, "id">),
    })) as RequestDoc[];

    if (requestDocs.length === 0) {
      return { docs: [], lastDoc: null };
    }

    requestDocs.forEach((row) => {
      if (isExpiredRequest(row.createdAt)) {
        void closeExpiredRequest(row.id);
      }
    });

    // 각 요청에 대해 내 견적이 있는지 확인
    const checks = await Promise.all(
      requestDocs.map(async (r) => {
        const qref = doc(db, "requests", r.id, "quotes", partnerId);
        const qsnap = await getDoc(qref);
        return qsnap.exists() ? r : null;
      })
    );

    const filtered = checks.filter((x): x is RequestDoc => Boolean(x));

    // createdAt desc 정렬
    filtered.sort((a, b) => {
      const aMs = (a.createdAt as any)?.toMillis ? (a.createdAt as any).toMillis() : 0;
      const bMs = (b.createdAt as any)?.toMillis ? (b.createdAt as any).toMillis() : 0;
      return bMs - aMs;
    });

    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

    return { docs: filtered, lastDoc };
  } catch (error) {
    console.error("[requests] getMyQuotedRequestsPage error", error);
    throw error;
  }
}
