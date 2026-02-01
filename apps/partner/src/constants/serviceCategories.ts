export const SERVICE_CATEGORIES = ["청소", "이사", "인테리어", "시공/설치"] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
