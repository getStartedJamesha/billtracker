// Best-effort extraction of charges from an uploaded bill.
// Only PDFs with a text layer can be parsed; scanned images are stored as-is
// for reference (see README "Enhancements" for OCR/AI-based extraction ideas).

const TOTAL_PATTERNS = [
  /total\s*(?:amount)?\s*due[:\s]*\$?\s*([\d,]+\.\d{2})/i,
  /amount\s*due[:\s]*\$?\s*([\d,]+\.\d{2})/i,
  /balance\s*due[:\s]*\$?\s*([\d,]+\.\d{2})/i,
  /new\s*charges[:\s]*\$?\s*([\d,]+\.\d{2})/i,
  /total[:\s]*\$?\s*([\d,]+\.\d{2})/i,
];

// Matches a per-line subtotal anchor common on carrier bills that itemize
// charges by phone line, e.g. "Total for 515.661.0304$32.00" (AT&T-style).
const LINE_TOTAL_PATTERN = /total\s+for\s+(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\s*\$?\s*([\d,]+\.\d{2})/gi;

// Matches a friendly name printed near a phone line's detail section, e.g.
// "Phone, 515.661.0304\nIMRAN SHAH AMAN SHAH" or "Wearable, 651.324.0528\n...".
function findLineName(text: string, phoneDigits: string): string | null {
  const escaped = phoneDigits.split("").join("[-.\\s]?");
  const pattern = new RegExp(`(?:phone|wearable|line),?\\s*${escaped}\\s*\\r?\\n([A-Za-z][A-Za-z .'-]{1,40})`, "i");
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
}

export function formatPhoneDashed(phoneDigits: string): string {
  if (phoneDigits.length !== 10) return phoneDigits;
  return `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
}

export interface BillParseResult {
  amount: number | null;
  note: string;
}

export interface BillLineItem {
  phoneDigits: string;
  phoneFormatted: string;
  amount: number;
  name: string | null;
}

export interface LineItemParseResult {
  items: BillLineItem[];
  totalFromLines: number;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text || "";
}

export async function tryExtractTotalFromPdf(buffer: Buffer): Promise<BillParseResult> {
  try {
    const text = await extractPdfText(buffer);

    for (const pattern of TOTAL_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ""));
        if (!Number.isNaN(amount)) {
          return { amount, note: `Auto-detected "${match[0].trim().replace(/\s+/g, " ")}" from the uploaded PDF.` };
        }
      }
    }

    return { amount: null, note: "Uploaded PDF was scanned for a total, but no recognizable amount pattern was found. Enter the amount manually." };
  } catch (err) {
    return { amount: null, note: "Could not read this file as text (it may be a scanned image). Enter the amount manually." };
  }
}

// Best-effort per-line-item extraction for carrier bills that break charges
// down by phone number (family/shared mobile plans). Returns one entry per
// distinct phone line found via the "Total for <phone>" anchor. Falls back
// to nothing (empty items) for bills that don't use this convention -
// callers should fall back to tryExtractTotalFromPdf in that case.
export async function tryExtractLineItemsFromPdf(buffer: Buffer): Promise<LineItemParseResult> {
  const text = await extractPdfText(buffer);

  const seen = new Map<string, BillLineItem>();
  let match: RegExpExecArray | null;
  LINE_TOTAL_PATTERN.lastIndex = 0;
  while ((match = LINE_TOTAL_PATTERN.exec(text)) !== null) {
    const phoneDigits = normalizePhoneDigits(match[1]);
    const amount = parseFloat(match[2].replace(/,/g, ""));
    if (phoneDigits.length !== 10 || Number.isNaN(amount)) continue;
    // A phone number's line total can appear twice (summary table + detail
    // section); keep the first occurrence, they should agree.
    if (!seen.has(phoneDigits)) {
      seen.set(phoneDigits, {
        phoneDigits,
        phoneFormatted: formatPhoneDashed(phoneDigits),
        amount,
        name: findLineName(text, phoneDigits),
      });
    }
  }

  const items = Array.from(seen.values());

  // If every line shares the same name (or none has one), it's almost
  // certainly just the account holder's name repeated, not a per-person
  // label - drop it so callers fall back to sequential naming instead.
  const distinctNames = new Set(items.map((i) => i.name).filter(Boolean));
  if (distinctNames.size <= 1) {
    for (const item of items) item.name = null;
  }

  const totalFromLines = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
  return { items, totalFromLines };
}
