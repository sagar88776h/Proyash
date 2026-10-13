import { normalizePhone } from '@shared/phone.ts';

export function whatsappLink(number: string | null | undefined): string | null {
  const e164 = normalizePhone(number);
  return e164 ? `https://wa.me/${e164.replace('+', '')}` : null;
}

export function telLink(number: string | null | undefined): string | null {
  if (!number) return null;
  return `tel:${normalizePhone(number) ?? number.replace(/[^\d+]/g, '')}`;
}
