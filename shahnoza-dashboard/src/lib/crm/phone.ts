/** Normalize a raw Uzbek / E.164 number to +998XXXXXXXXX. */
export function normalizePhone(raw: string): string {
  let s = raw.replace(/[\s-]/g, "");
  if (s.startsWith("998")) return `+${s}`;
  if (s.startsWith("0")) return `+998${s.slice(1)}`;
  if (/^9\d{8}$/.test(s)) return `+998${s}`;
  return s;
}

/**
 * Last 4 digits visible, rest masked: +998 XX XXX 4567
 */
export function maskPhone(telefon: string): string {
  const digits = telefon.replace(/\D/g, "");
  const last4 = digits.slice(-4).padStart(4, "•");
  return `+998 XX XXX ${last4}`;
}
