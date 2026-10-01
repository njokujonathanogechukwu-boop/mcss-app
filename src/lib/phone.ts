/**
 * Phone numbers in the form the congregation writes them: a Nigerian mobile
 * or landline as 0 followed by ten digits, "08031234567". Numbers arrive as
 * "+234 803 123 4567", "2348031234567", "803-123-4567" and the like; all of
 * those come out the same. Anything else — a foreign number, two numbers in
 * one field — is left exactly as it was typed rather than guessed at.
 *
 * Kept free of server imports: the forms' validation and the one-off clean-up
 * both use it.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const typed = raw.trim();
  if (typed === "") return null;
  const digits = typed.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("0")) return digits;
  if (digits.length === 10 && !digits.startsWith("0")) return `0${digits}`;
  if (digits.length === 13 && digits.startsWith("234")) return `0${digits.slice(3)}`;
  // "+234 (0) 803…": the country code with the leading 0 kept as well.
  if (digits.length === 14 && digits.startsWith("2340")) return digits.slice(3);
  return typed;
}

/** Whether the number is in the local form, beginning with 0. */
export function isLocalPhone(value: string): boolean {
  return /^0\d{10}$/.test(value);
}
