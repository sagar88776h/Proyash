/** URL-safe slug from a title; falls back to a random suffix for non-Latin titles. */
export function slugify(text: string, fallbackPrefix = 'item'): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || `${fallbackPrefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
