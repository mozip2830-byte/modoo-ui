import { createOrUpdateQuoteTransaction } from "@/src/actions/quoteActions";

// 호환성 alias: 기존 코드에서 submitQuoteWithBilling으로 import하는 경우 대응
export const submitQuoteWithBilling = createOrUpdateQuoteTransaction;
