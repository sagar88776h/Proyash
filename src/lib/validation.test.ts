import { describe, expect, it } from 'vitest';
import { assistanceRequestSchema, donationReportSchema, fieldErrors, sniffFileType, statusLookupSchema } from '@shared/validation.ts';

const validRequest = {
  category: 'education',
  applicant_name: 'Test Person',
  phone: '98765 43210',
  locality: 'Near the school',
  description: 'Needs help paying school fees for the coming term.',
  consent: true,
};

describe('assistanceRequestSchema (shared by the form and the Edge Function)', () => {
  it('accepts a complete request', () => {
    expect(assistanceRequestSchema.safeParse(validRequest).success).toBe(true);
  });
  it('rejects invalid phone numbers', () => {
    const r = assistanceRequestSchema.safeParse({ ...validRequest, phone: '12345' });
    expect(fieldErrors(r.error!)).toHaveProperty('phone');
  });
  it('reports every problem at once, including cross-field checks', () => {
    const r = assistanceRequestSchema.safeParse({ ...validRequest, consent: false, locality: '', description: 'help' });
    expect(r.success).toBe(false);
    expect(Object.keys(fieldErrors(r.error!)).sort()).toEqual(['consent', 'description', 'locality']);
  });
  it('requires an email address when email is the preferred contact', () => {
    const r = assistanceRequestSchema.safeParse({ ...validRequest, preferred_contact: 'email' });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!)).toHaveProperty('email');
  });
  it('rejects unknown categories', () => {
    expect(assistanceRequestSchema.safeParse({ ...validRequest, category: 'cash' }).success).toBe(false);
  });
});

describe('statusLookupSchema', () => {
  it('normalises references typed loosely', () => {
    const r = statusLookupSchema.safeParse({ reference_code: 'pry k7q2 m9xd', phone: '9876543210' });
    expect(r.data?.reference_code).toBe('PRY-K7Q2-M9XD');
  });
  it('rejects references in the wrong format', () => {
    expect(statusLookupSchema.safeParse({ reference_code: 'PRY-0000-1111', phone: '9876543210' }).success).toBe(false);
  });
});

describe('donationReportSchema', () => {
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const valid = { amount: '500.50', paid_on: today, payment_method: 'upi', transaction_reference: 'UTR123456789', donor_name: 'Donor', donor_phone: '9876543210' };
  it('accepts a valid report', () => {
    expect(donationReportSchema.safeParse(valid).success).toBe(true);
  });
  it.each([
    ['amount', '0'],
    ['amount', '12.345'],
    ['paid_on', '2999-01-01'],
    ['transaction_reference', 'abc'],
    ['payment_method', 'card'],
  ])('rejects invalid %s %j', (field, value) => {
    const r = donationReportSchema.safeParse({ ...valid, [field]: value });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!)).toHaveProperty(field);
  });
  it('needs a name unless anonymous, and a way to contact the donor', () => {
    expect(donationReportSchema.safeParse({ ...valid, donor_name: '' }).success).toBe(false);
    expect(donationReportSchema.safeParse({ ...valid, donor_name: '', is_anonymous: true }).success).toBe(true);
    expect(donationReportSchema.safeParse({ ...valid, donor_phone: '' }).success).toBe(false);
  });
});

describe('sniffFileType', () => {
  it('identifies files by their content, not their name', () => {
    expect(sniffFileType(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffFileType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffFileType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffFileType(new TextEncoder().encode('MZ executable'))).toBeNull();
  });
});
