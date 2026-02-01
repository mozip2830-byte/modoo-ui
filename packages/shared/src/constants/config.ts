// Verification code configuration
export const VERIFICATION_CODE_MIN = 100000;
export const VERIFICATION_CODE_MAX = 900000;

export function generateVerificationCode(): string {
  return String(Math.floor(VERIFICATION_CODE_MIN + Math.random() * VERIFICATION_CODE_MAX));
}

// Image compression configuration
export const IMAGE_COMPRESS = {
  DEFAULT_QUALITY: 0.7,
  THUMB_QUALITY: 0.55,
  THUMB_MAX_SIZE: 320,
  MIN_QUALITY: 0.35,
  TARGET_SIZE_BYTES: 1024 * 1024, // 1MB
  CHAT_IMAGE_MAX_SIZE: 1600,
  CHAT_IMAGE_MAX_COUNT: 10,
  CHAT_IMAGE_TARGET_BYTES: 2 * 1024 * 1024, // 2MB
} as const;

// Batch operation limits
export const BATCH_LIMITS = {
  FIRESTORE_WRITE: 400,
} as const;
