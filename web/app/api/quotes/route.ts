import { NextResponse } from "next/server";

type QuoteRequest = {
  uid?: string;
  customerName?: string;
  phone?: string;
  serviceType?: string;
  address?: string;
  details?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as QuoteRequest;
    if (!payload.uid) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!payload.customerName?.trim() || !payload.phone?.trim() || !payload.serviceType?.trim()) {
      return NextResponse.json({ message: "필수 항목을 입력해 주세요." }, { status: 400 });
    }

    // TODO: 서버에서 Firestore로 견적 요청을 저장하고 검증 로직을 추가하세요.
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ message: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
