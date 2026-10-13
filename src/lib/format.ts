const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWholeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-IN');

/** Formats an amount in Indian Rupees with Indian digit grouping, e.g. ₹1,25,000.00 */
export function formatINR(amount: number | string | null | undefined, opts?: { whole?: boolean }): string {
  const value = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(value)) return '—';
  return (opts?.whole ? inrWholeFormatter : inrFormatter).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return numberFormatter.format(value);
}

/** Parses a YYYY-MM-DD date as a local calendar date (no timezone shift). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? (value.length === 10 ? parseDateOnly(value) : new Date(value)) : value;
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function formatMonth(value: string | Date): string {
  const date = typeof value === 'string' ? parseDateOnly(value) : value;
  return monthFormatter.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Indian financial year (April–March) containing the date, e.g. "2026-27". */
export function financialYearLabel(date: Date): string {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Start and end dates (inclusive) of the financial year that begins in April of `startYear`. */
export function financialYearRange(startYear: number): { start: string; end: string } {
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}

export function monthRange(year: number, monthIndex: number): { start: string; end: string } {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const t = TENS[Math.floor(n / 10)] ?? '';
  const o = ONES[n % 10] ?? '';
  return o ? `${t} ${o}` : t;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

/**
 * Amount in words using the Indian numbering system (lakh, crore),
 * e.g. 125000.5 → "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only".
 */
export function amountInWordsINR(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '';
  const totalPaise = Math.round(amount * 100);
  let rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  rupees %= 10_000_000;
  const lakh = Math.floor(rupees / 100_000);
  rupees %= 100_000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;

  if (crore) parts.push(`${crore >= 100 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));

  const rupeeWords = parts.length ? parts.join(' ') : 'Zero';
  const paiseWords = paise ? ` and ${twoDigits(paise)} Paise` : '';
  return `Rupees ${rupeeWords}${paiseWords} Only`;
}
