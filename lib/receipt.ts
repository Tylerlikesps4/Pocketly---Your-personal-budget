export type ReceiptImage = {
  uri: string;
  /** Native: base64 image bytes without a data URL prefix. Web: not used. */
  image?: string;
  mimeType?: string;
  name?: string;
  /** Native document picker copied this image to its own temporary cache. */
  temporaryCopy?: boolean;
  /** Web only. Kept with the selected image so the original is never replaced. */
  blob?: Blob;
};

export type ReceiptDraft = {
  amount?: number;
  /** ISO calendar date, only when OCR supplied an unambiguous and real date. */
  date?: string;
  /** The most likely merchant line. Categories are deliberately never guessed. */
  note?: string;
  /** ISO 4217 currency when explicitly stated by the receipt. */
  currency?: string;
  confidence: number;
  /** The unmodified OCR text for the person to review. */
  text: string;
};

const MAX_AMOUNT = 999_999_999;
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function clampConfidence(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

function isoDate(year: number, month: number, day: number): string | undefined {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findDate(text: string): string | undefined {
  let match = /\b((?:19|20)\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/.exec(text);
  if (match)
    return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));

  const monthName = Object.keys(MONTHS).join("|");
  const namedFirst = new RegExp(
    `\\b(${monthName})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+((?:19|20)\\d{2})\\b`,
    "i",
  ).exec(text);
  if (namedFirst) {
    return isoDate(
      Number(namedFirst[3]),
      MONTHS[namedFirst[1].toLowerCase()],
      Number(namedFirst[2]),
    );
  }

  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthName})\\.?[,]?\\s+((?:19|20)\\d{2})\\b`,
    "i",
  ).exec(text);
  if (dayFirst) {
    return isoDate(
      Number(dayFirst[3]),
      MONTHS[dayFirst[2].toLowerCase()],
      Number(dayFirst[1]),
    );
  }

  // Numeric dates with both fields <= 12 are deliberately omitted: OCR cannot
  // reliably tell US MM/DD from European DD/MM order without a locale setting.
  match = /\b(\d{1,2})[./-](\d{1,2})[./-]((?:19|20)\d{2})\b/.exec(text);
  if (!match) return undefined;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  if (first > 12) return isoDate(year, second, first);
  if (second > 12) return isoDate(year, first, second);
  return undefined;
}

function amountFromToken(token: string): number | undefined {
  const compact = token.replace(/\s/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const separator = lastComma > lastDot ? "," : ".";
  const fractionLength = compact.length - Math.max(lastComma, lastDot) - 1;
  if (
    (lastComma < 0 && lastDot < 0) ||
    fractionLength < 1 ||
    fractionLength > 2
  ) {
    return undefined;
  }
  const normalized = compact
    .replace(separator === "," ? /\./g : /,/g, "")
    .replace(separator, ".");
  if (!/^\d+\.\d{1,2}$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT
    ? amount
    : undefined;
}

const MONEY =
  /(?<!\d)(?:[$€£]\s*)?(\d{1,3}(?:[.,]\d{3})+[.,]\d{1,2}|\d+[.,]\d{1,2})(?!\d)/g;

function amountsIn(line: string): number[] {
  const amounts: number[] = [];
  for (const match of line.matchAll(MONEY)) {
    const amount = amountFromToken(match[1]);
    if (amount !== undefined) amounts.push(amount);
  }
  return amounts;
}

function currencyIn(text: string): string | undefined {
  const code =
    /\b(USD|EUR|GBP|CAD|AUD|NZD|JPY|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BRL|MXN|INR|KRW|CNY)\b/i.exec(
      text,
    );
  if (code) return code[1].toUpperCase();
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  // A bare $ can mean many currencies, so it is intentionally not treated as USD.
  return undefined;
}

function findTotal(lines: string[]): { amount?: number; currency?: string } {
  type Candidate = {
    amount: number;
    score: number;
    line: string;
    index: number;
  };
  const candidates: Candidate[] = [];
  const hasTotal =
    /\b(?:grand\s*total|amount\s*due|total\s*due|balance\s*due|total)\b/i;
  const excluded =
    /\b(?:sub\s*total|tax|vat|change|cash|tender|discount|tip|savings)\b/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!hasTotal.test(line) || excluded.test(line)) continue;
    const score = /\bgrand\s*total\b/i.test(line)
      ? 100
      : /\b(?:amount|total|balance)\s*due\b/i.test(line)
        ? 90
        : 80;
    const amounts = amountsIn(line);
    if (amounts.length) {
      candidates.push({
        amount: amounts[amounts.length - 1],
        score,
        line,
        index,
      });
      continue;
    }
    // Many receipts put the label and amount on adjacent lines. Only join an
    // immediately following, unlabeled monetary line to avoid item-price guesses.
    const next = lines[index + 1];
    if (next && !hasTotal.test(next) && !excluded.test(next)) {
      const nextAmounts = amountsIn(next);
      if (nextAmounts.length === 1) {
        candidates.push({
          amount: nextAmounts[0],
          score: score - 1,
          line: `${line}\n${next}`,
          index,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.index - a.index);
  const best = candidates[0];
  return best ? { amount: best.amount, currency: currencyIn(best.line) } : {};
}

function merchantNote(lines: string[]): string | undefined {
  for (const rawLine of lines.slice(0, 8)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 2 || line.length > 100 || !/[A-Za-zÀ-ÿ]/.test(line))
      continue;
    if (
      /\b(?:receipt|invoice|order|date|time|cashier|subtotal|total|tax|change|amount\s+due)\b/i.test(
        line,
      )
    ) {
      continue;
    }
    const letters = (line.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    if (digits > letters || /(?:\+?\d[\d\s().-]{6,})/.test(line)) continue;
    return line;
  }
  return undefined;
}

/**
 * Produces a reviewable expense draft from OCR text. It is deliberately
 * conservative: no category, bare-dollar currency, ambiguous numeric date, or
 * ordinary item price is inferred.
 */
export function parseReceipt(text: string, confidence?: number): ReceiptDraft {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const total = findTotal(lines);
  const currency = total.currency || currencyIn(text);

  return {
    ...(total.amount !== undefined ? { amount: total.amount } : {}),
    ...(findDate(text) ? { date: findDate(text) } : {}),
    ...(merchantNote(lines) ? { note: merchantNote(lines) } : {}),
    ...(currency ? { currency } : {}),
    confidence: clampConfidence(confidence),
    text,
  };
}
