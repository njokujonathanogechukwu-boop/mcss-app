/**
 * Splitting and checking typed email addresses. Kept free of any server import
 * so the compose form can count addresses as they are typed.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value: string): boolean {
  return EMAIL.test(value);
}

/** Accepts addresses separated by commas, semicolons, spaces or line breaks. */
export function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,\s;]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}
