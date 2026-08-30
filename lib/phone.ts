// Pure phone-formatting helpers with zero dependencies, kept separate from
// lib/parseBill.ts (which pulls in pdf-parse) so client components can use
// them without dragging a Node-only PDF parser into the browser bundle.

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
}

export function formatPhoneDashed(phoneDigits: string): string {
  if (phoneDigits.length !== 10) return phoneDigits;
  return `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
}
