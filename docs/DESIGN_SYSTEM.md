# Design system

> **Public website style: “Clean & bright”** (October 2026). White pages,
> floating pill navigation, light mint-washed page heroes in rounded panels,
> bento-style card grids, rounded dark-green bands for emphasis, and pill
> labels. The admin portal keeps its original styling.


The look is editorial and calm: generous space, warm paper tones, deep forest
green and a restrained gold accent. It aims to feel trustworthy and humane
rather than flashy. Tokens live in `src/styles/index.css` (Tailwind v4
`@theme`), so every colour, radius and shadow is a utility class.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `forest-700` | `#174B35` | Brand green: primary buttons, links, headings on light backgrounds |
| `forest-800/900/950` | darker greens | Dark sections, hero, footer |
| `ivory-50…300` | `#F7F5EE` family | Admin portal backgrounds |
| `mint-50…200` | `#F3F9F5` family | Public site tints: hero washes, light cards, active nav |
| `leaf-500` / `leaf-700` | `#2A9D68` / `#17744A` | Accent dots (decorative) / accent text such as the hero’s second line |
| `gold-400` | `#D5AE69` | **Decorative only** (rules, icons, focus ring on dark) and the gold button with dark text |
| `gold-700` | `#7A5C24` | Gold-coloured **text** on light backgrounds (meets contrast) |
| `ink-900` | `#222923` | Body text |
| `ink-600` | `#5B625C` | Secondary text (≥ 4.5:1 on ivory and white) |
| `ink-450` | `#868E88` | Form control borders (≥ 3:1 non-text contrast) |
| `success/warning/danger/info-*` | | Status messages and badges, always with text, never colour alone |

Rules: never put text in `gold-400` on light backgrounds; never dim content
with opacity (it breaks contrast — use a tinted background or a badge
instead); every status has a text label.

## Typography

- **Sora** (self-hosted variable font) for display and headings.
- **Inter** (self-hosted variable font) for body text and the interface.
- Display sizes: `text-display-2xl/xl/lg/md`; body copy at 16–17 px with
  comfortable line height; `.eyebrow` for small uppercase labels;
  `.prose-prayash` for long-form Markdown content.
- No external font requests, so pages work offline-first and pass the CSP.

## Shape, depth and texture

- Radii: `rounded-3xl` (24 px) for public cards, `rounded-bento` (32 px) for
  heroes, bento tiles, dark bands and the footer; `rounded-full` for the
  navigation bar, buttons and pill labels. (Admin: `rounded-card`/`rounded-panel`.)
- Shadows: `shadow-card` (resting), `shadow-float` (hover, floating nav, hero
  visual); `shadow-soft`/`shadow-lift` in the admin portal.
- `.bg-mesh` paints the soft mint/gold wash behind page heroes.
- `.grain` adds a very subtle paper texture on dark sections.
- Blur is limited to the scrolled header, dialog backdrops and the sticky
  save bar in the content editor; no stacked translucent layers over content.

## Components

| Component | File | Notes |
| --- | --- | --- |
| Button / ButtonLink | `src/components/ui/Button.tsx` | Variants: primary, gold, secondary, ghost, danger, light. Loading state disables the button, sets `aria-busy` and shows a spinner with a text label. |
| Field, Input, Textarea, Select, Checkbox, ChoiceGroup | `src/components/ui/Field.tsx` | Labels, hints and errors are wired with `aria-describedby` / `aria-invalid` automatically |
| Alert, Badge, EmptyState, ErrorState, Skeleton | `src/components/ui/Feedback.tsx` | |
| Dialog | `src/components/ui/Dialog.tsx` | Native `<dialog>`: focus containment, Escape, inert background |
| FormErrorSummary | `src/components/forms/FormErrorSummary.tsx` | Appears after a failed submit, takes focus, links to each field |
| Placeholder | `src/components/Placeholder.tsx` | “To be provided by PRAYASH” — used wherever real information is still missing |
| DataTable | `src/features/admin/components/DataTable.tsx` | Becomes stacked cards on phones (no sideways scrolling) |
| PageHero, Section, Container | `src/components/layout/` | Page structure for the public site |

## Motion

Motion supports reading; it never blocks it.

- **Reveal** (`framer-motion`, loaded lazily): short fade/rise as sections
  enter the viewport. Content is never hidden from print or from browsers that
  cannot run the animation.
- **Hero**: a light Three.js “constellation” (people joining together),
  loaded only on capable devices. It pauses when off-screen or when the tab is
  hidden. A static SVG is used instead when the visitor prefers reduced motion,
  on small screens, with Save-Data, or without WebGL.
- **GSAP ScrollTrigger** adds gentle parallax to the hero only, and only
  without reduced motion.
- No autoplay audio or video, no scroll-jacking, no animations longer than
  about a second.

`prefers-reduced-motion: reduce` turns all of this off; the e2e suite checks
that no content stays invisible and no canvas is created in that mode.

## Accessibility baseline

- WCAG 2.2 AA: automated axe checks run on every public page (three viewport
  sizes) and every portal page in the end-to-end tests.
- Skip link, landmarks, one `h1` per page, visible focus rings (gold on dark,
  green on light), keyboard-operable menus and dialogs.
- Touch targets at least 44 px for primary controls; layouts tested at 412 px,
  820 px and 1440 px with no horizontal scrolling.
- Forms: labels on every control, inline errors plus an error summary, no
  reliance on placeholder text.

## Imagery

Authentic PRAYASH photographs only. Until they exist, pages show labelled
striped placeholders (`.placeholder-stripes`) rather than stock photos. See
[CONTENT.md](CONTENT.md) for consent rules.
