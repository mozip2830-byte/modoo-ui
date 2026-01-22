import { db } from "@/src/firebase";
import {
    collection,
    doc,
    getDoc,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
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

// ================================
// 1) 오픈 요청 리스트 (기존 유지)
// ================================
export function subscribeOpenRequestsForPartner(input: SubscribeOpenInput) {
  const q = query(
    collection(db, "requests"),
    // ✅ FIX: 견적이 선택되어 status가 변경되더라도, 10개가 차기 전(isClosed=false)이면 노출
    where("isClosed", "==", false),
    orderBy("createdAt", "desc"),
    ...(input.limit ? [limit(input.limit)] : [])
  );

  return onSnapshot(
    q,
    (snap) => {
      input.onData(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<RequestDoc, "id">),
        }))
      );
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
    // ✅ FIX: 내가 견적 넣은 요청도 마감 전이면 계속 보여줌
    where("isClosed", "==", false),
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
