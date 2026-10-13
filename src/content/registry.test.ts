import { describe, expect, it } from 'vitest';
import { CONTENT_KEYS, mergeContent, PAGE_DEFINITIONS } from './registry';

describe('page content defaults', () => {
  it('defines every editable page with defaults for each field', () => {
    for (const key of CONTENT_KEYS) {
      const def = PAGE_DEFINITIONS[key];
      for (const field of def.fields) expect(def.defaults, `${key}.${field.name}`).toHaveProperty(field.name);
    }
  });
  it('does not invent history, statistics or registration claims', () => {
    const text = JSON.stringify(PAGE_DEFINITIONS);
    expect(text).not.toMatch(/\b(founded|established|registered) in \d{4}/i);
    expect(text).not.toMatch(/\b\d[\d,]*\+?\s+(families|beneficiaries|volunteers|villages|members|people)\b/i);
    expect(text).not.toMatch(/80G|12A|tax[- ]exempt/i);
    expect(PAGE_DEFINITIONS.about.defaults.story).toBe('');
  });
});

describe('mergeContent', () => {
  it('overlays published values on defaults', () => {
    const merged = mergeContent('about', { heading: 'Who we are' });
    expect(merged.heading).toBe('Who we are');
    expect(merged.mission).toBe(PAGE_DEFINITIONS.about.defaults.mission);
  });
  it('ignores unknown fields, wrong types and malformed items, and enforces limits', () => {
    const merged = mergeContent('home', {
      hero_title: 42,
      injected: '<script>',
      help_areas: [{ title: 'Ok', body: 'Fine' }, { title: 5 }, null, ...Array.from({ length: 10 }, () => ({ title: 'x', body: 'y' }))],
      hero_body: 'x'.repeat(5000),
    });
    expect(merged.hero_title).toBe(PAGE_DEFINITIONS.home.defaults.hero_title);
    expect(merged).not.toHaveProperty('injected');
    expect(merged.help_areas).toHaveLength(6);
    expect((merged.hero_body as string).length).toBe(300);
  });
  it('falls back to defaults for missing or invalid content', () => {
    expect(mergeContent('terms', null)).toEqual(PAGE_DEFINITIONS.terms.defaults);
    expect(mergeContent('terms', ['not', 'an', 'object'])).toEqual(PAGE_DEFINITIONS.terms.defaults);
  });
});
