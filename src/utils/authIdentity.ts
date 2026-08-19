export function normalizeEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

export function normalizePhone(phone?: string | null) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    return `0${digits.slice(3)}`;
  }
  return digits;
}

export function isValidNigerianPhone(phone?: string | null) {
  const digits = normalizePhone(phone);
  return digits.length === 11 && digits.startsWith("0");
}

export function emailMatch(email?: string | null) {
  const normalized = normalizeEmail(email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { email: new RegExp(`^${normalized}$`, "i") };
}
