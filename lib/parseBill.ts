// Best-effort extraction of a total/amount-due figure from an uploaded bill.
// Only PDFs with a text layer can be parsed; scanned images are stored as-is
// for reference (see README "Enhancements" for OCR/AI-based extraction ideas).

const AMOUNT_PATTERNS = [
  /total\s*(?:amount)?\s*due[:\s]*\$?\s*([\d,]+\.\d{2})/i,
  /amount\s*due[:\s]*\$?\s*([\d,]+\.\d{2})/i,
  /balance\s*due[:\s]*\$?\s*([\d,]+\.\d{2})/i,
  /new\s*charges[:\s]*\$?\s*([\d,]+\.\d{2})/i,
  /total[:\s]*\$?\s*([\d,]+\.\d{2})/i,
];

export interface BillParseResult {
  amount: number | null;
  note: string;
}

export async function tryExtractTotalFromPdf(buffer: Buffer): Promise<BillParseResult> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    const text = data.text || "";

    for (const pattern of AMOUNT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ""));
        if (!Number.isNaN(amount)) {
          return { amount, note: `Auto-detected "${match[0].trim()}" from the uploaded PDF.` };
        }
      }
    }

    return { amount: null, note: "Uploaded PDF was scanned for a total, but no recognizable amount pattern was found. Enter the amount manually." };
  } catch (err) {
    return { amount: null, note: "Could not read this file as text (it may be a scanned image). Enter the amount manually." };
  }
}
