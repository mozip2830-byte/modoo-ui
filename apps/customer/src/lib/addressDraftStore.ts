// src/lib/addressDraftStore.ts
export type AddressDraft = {
  roadAddress: string;      // 도로명(메인)
  jibunAddress?: string;    // 지번(참고)
  zonecode?: string;        // 우편번호
  bname?: string;           // 법정동명(동)
  buildingName?: string;    // 건물명
};

let current: AddressDraft | null = null;
const listeners = new Set<(v: AddressDraft | null) => void>();

export function setAddressDraft(next: AddressDraft | null) {
  current = next;
  listeners.forEach((fn) => fn(current));
}

export function getAddressDraft() {
  return current;
}

export function subscribeAddressDraft(fn: (v: AddressDraft | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
