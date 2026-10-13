import { describe, expect, it } from 'vitest';
import { amountInWordsINR, financialYearLabel, financialYearRange, formatDate, formatINR, monthRange, parseDateOnly } from './format';

describe('formatINR', () => {
  it('uses Indian digit grouping and two decimals', () => {
    expect(formatINR(125000)).toBe('₹1,25,000.00');
    expect(formatINR('2500.5')).toBe('₹2,500.50');
    expect(formatINR(10000000, { whole: true })).toBe('₹1,00,00,000');
  });
  it('shows a dash for values that are not numbers', () => {
    expect(formatINR('abc')).toBe('—');
  });
});

describe('amountInWordsINR', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [7, 'Rupees Seven Only'],
    [19, 'Rupees Nineteen Only'],
    [501, 'Rupees Five Hundred One Only'],
    [2500, 'Rupees Two Thousand Five Hundred Only'],
    [125000.5, 'Rupees One Lakh Twenty Five Thousand and Fifty Paise Only'],
    [10000000, 'Rupees One Crore Only'],
    [12345678.09, 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Nine Paise Only'],
    [12000000000, 'Rupees One Thousand Two Hundred Crore Only'],
  ])('%s → %s', (amount, words) => {
    expect(amountInWordsINR(amount)).toBe(words);
  });
  it('rounds to the nearest paisa and rejects invalid amounts', () => {
    expect(amountInWordsINR(0.005)).toBe('Rupees Zero and One Paise Only');
    expect(amountInWordsINR(-1)).toBe('');
    expect(amountInWordsINR(Number.NaN)).toBe('');
  });
});

describe('dates', () => {
  it('treats YYYY-MM-DD as a calendar date without timezone shifts', () => {
    const d = parseDateOnly('2026-04-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 3, 1]);
    expect(formatDate('2026-04-01')).toBe('1 Apr 2026');
  });
  it('labels Indian financial years from April to March', () => {
    expect(financialYearLabel(new Date(2026, 2, 31))).toBe('2025-26');
    expect(financialYearLabel(new Date(2026, 3, 1))).toBe('2026-27');
    expect(financialYearLabel(new Date(2099, 5, 1))).toBe('2099-00');
    expect(financialYearRange(2026)).toEqual({ start: '2026-04-01', end: '2027-03-31' });
  });
  it('computes month ranges including leap years', () => {
    expect(monthRange(2028, 1)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthRange(2026, 11)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
});
