export type ExpiryStatus = "expired" | "expiring_soon" | "safe";

export function qatarDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function daysUntilExpiry(expiryDate: string, today = qatarDateString()): number {
  const expiry = Date.parse(`${expiryDate}T00:00:00.000Z`);
  const current = Date.parse(`${today}T00:00:00.000Z`);
  return Math.floor((expiry - current) / 86_400_000);
}

export function getExpiryStatus(expiryDate: string): ExpiryStatus {
  const days = daysUntilExpiry(expiryDate);
  if (days < 0) return "expired";
  if (days <= 7) return "expiring_soon";
  return "safe";
}
