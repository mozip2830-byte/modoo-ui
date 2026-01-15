/**
 * Korean business registration number (사업자등록번호) validator
 * Implements the official 국세청 checksum algorithm
 */

const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

/**
 * Normalize business number to digits only (removes dashes and spaces)
 */
export function normalizeBusinessNumber(raw: string): string {
  return raw.replace(/[\s\-]/g, "");
}

/**
 * Validate Korean business registration number (10-digit checksum)
 * @param raw - Business number string (with or without dashes)
 * @returns true if valid, false otherwise
 */
export function validateBusinessNumber(raw: string): boolean {
  const digits = normalizeBusinessNumber(raw);

  // Must be exactly 10 digits
  if (!/^\d{10}$/.test(digits)) {
    return false;
  }

  const nums = digits.split("").map(Number);

  // Calculate checksum
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += nums[i] * WEIGHTS[i];
  }
  // Special handling for 9th digit (index 8)
  sum += Math.floor((nums[8] * 5) / 10);

  const checkDigit = (10 - (sum % 10)) % 10;

  return nums[9] === checkDigit;
}

/**
 * Format business number with dashes (XXX-XX-XXXXX)
 */
export function formatBusinessNumber(raw: string): string {
  const digits = normalizeBusinessNumber(raw);
  if (digits.length !== 10) return raw;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
