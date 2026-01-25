export const SERVICE_CATEGORIES = ["청소", "이사", "인테리어", "전기", "설비"] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
