/**
 * Editable page content: field definitions and default text.
 *
 * Defaults only restate PRAYASH's stated identity (name, tagline, mission,
 * brand message) or describe how this website actually works. They contain no
 * invented history, statistics or achievements. Empty fields render as
 * clearly labelled placeholders until PRAYASH writes them in the admin
 * portal (Website → Content). See docs/CONTENT.md.
 */

export type ContentItem = { title: string; body: string };
export type ContentValue = string | ContentItem[];
export type PageContent = Record<string, ContentValue>;

export type FieldDef =
  | { name: string; label: string; type: 'text'; max: number; hint?: string; placeholder?: string }
  | { name: string; label: string; type: 'textarea'; max: number; hint?: string; placeholder?: string }
  | { name: string; label: string; type: 'markdown'; max: number; hint?: string; placeholder?: string }
  | { name: string; label: string; type: 'items'; maxItems: number; itemLabel: string; hint?: string };

export const CONTENT_KEYS = [
  'home',
  'about',
  'our_work',
  'villages',
  'request_help',
  'donate',
  'volunteer',
  'transparency',
  'contact',
  'privacy',
  'terms',
] as const;
export type ContentKey = (typeof CONTENT_KEYS)[number];

export type PageDefinition = {
  key: ContentKey;
  label: string;
  path: string;
  description: string;
  fields: FieldDef[];
  defaults: PageContent;
};

const heading = (max = 120): FieldDef => ({ name: 'heading', label: 'Page heading', type: 'text', max });
const intro = (max = 600): FieldDef => ({ name: 'intro', label: 'Introduction', type: 'textarea', max });

export const PAGE_DEFINITIONS: Record<ContentKey, PageDefinition> = {
  home: {
    key: 'home',
    label: 'Home',
    path: '/',
    description: 'Hero, introduction and section headings on the homepage.',
    fields: [
      { name: 'hero_eyebrow', label: 'Hero eyebrow', type: 'text', max: 80 },
      { name: 'hero_title', label: 'Hero headline', type: 'text', max: 120 },
      { name: 'hero_body', label: 'Hero text', type: 'textarea', max: 300 },
      { name: 'hero_media_id', label: 'Hero photograph (media ID)', type: 'text', max: 36, hint: 'Optional. Copy the ID of a published photo from the Media library.' },
      { name: 'intro_heading', label: 'Introduction heading', type: 'text', max: 120 },
      { name: 'intro_body', label: 'Introduction text', type: 'textarea', max: 800 },
      { name: 'help_areas', label: 'Areas of help', type: 'items', maxItems: 6, itemLabel: 'area' },
      { name: 'volunteer_heading', label: 'Volunteer invitation heading', type: 'text', max: 120 },
      { name: 'volunteer_body', label: 'Volunteer invitation text', type: 'textarea', max: 500 },
      { name: 'transparency_heading', label: 'Transparency heading', type: 'text', max: 120 },
      { name: 'transparency_body', label: 'Transparency text', type: 'textarea', max: 500 },
    ],
    defaults: {
      hero_eyebrow: 'A Group of Friends & Well-Wishers',
      hero_title: 'Together for Humanity. Together for a Better Tomorrow.',
      hero_body:
        'PRAYASH unites compassionate people across nearby villages to support people in need and strengthen the community.',
      hero_media_id: '',
      intro_heading: 'Neighbours helping neighbours',
      intro_body:
        'PRAYASH is a group of friends and well-wishers. We come together to support people in our nearby villages with education, healthcare, food and other essential needs — and to account openly for every contribution we receive.',
      help_areas: [
        { title: 'Education', body: 'Support with school and college costs, books and learning materials.' },
        { title: 'Healthcare', body: 'Help with treatment, medicines and reaching the care people need.' },
        { title: 'Food & essential needs', body: 'Rations and everyday essentials for households facing hardship.' },
        { title: 'Community', body: 'Village-level activities that bring people together and strengthen the community.' },
      ],
      volunteer_heading: 'Give your time and skills',
      volunteer_body:
        'Teaching, health, logistics, organising, writing, driving, cooking — every skill helps. Register as a volunteer and a coordinator will get in touch.',
      transparency_heading: 'Open about every rupee',
      transparency_body:
        'Every contribution and expense is recorded as an individual transaction, checked against bank statements, bills or receipts, and published here only in reviewed reports.',
    },
  },
  about: {
    key: 'about',
    label: 'About PRAYASH',
    path: '/about',
    description: 'Who PRAYASH is, its mission, story and commitments.',
    fields: [
      heading(),
      intro(),
      { name: 'mission', label: 'Mission statement', type: 'textarea', max: 400 },
      { name: 'story', label: 'Our story', type: 'markdown', max: 8000, hint: 'How PRAYASH began and who is involved. Only include facts PRAYASH has confirmed.' },
      { name: 'commitments', label: 'Commitments', type: 'items', maxItems: 6, itemLabel: 'commitment' },
      { name: 'how_we_work', label: 'How we work', type: 'markdown', max: 6000 },
    ],
    defaults: {
      heading: 'About PRAYASH',
      intro:
        'PRAYASH — A Group of Friends & Well-Wishers — brings together compassionate people from nearby villages to support those in need and strengthen our community.',
      mission: 'To unite compassionate people across nearby villages to support people in need and strengthen the community.',
      story: '',
      commitments: [
        {
          title: 'Dignity and privacy',
          body: 'Requests for help are private. Only the people reviewing them can see personal details, and no one’s story or photograph is published without their informed consent.',
        },
        {
          title: 'Careful with every contribution',
          body: 'Money received and spent is recorded as individual transactions and checked by a second person before it is counted.',
        },
        {
          title: 'Open reporting',
          body: 'Financial summaries are published only after they have been reviewed and approved.',
        },
        {
          title: 'Neighbours first',
          body: 'PRAYASH is made up of friends and well-wishers from nearby villages, working together for the community.',
        },
      ],
      how_we_work: [
        '**Requests for help** are reviewed individually by our assistance team, who may contact the person to understand their situation before a decision is made.',
        '',
        '**Volunteers** register online or in person. A coordinator reviews each registration and matches volunteers to activities.',
        '',
        '**Projects** are published on this website only after review, and their outcomes are shown only once they have been verified.',
        '',
        '**Finances** are recorded in a transaction ledger. Every entry is verified against supporting evidence, and reports are published only after approval.',
      ].join('\n'),
    },
  },
  our_work: {
    key: 'our_work',
    label: 'Our Work',
    path: '/our-work',
    description: 'Introduction to the projects list.',
    fields: [heading(), intro()],
    defaults: {
      heading: 'Our Work',
      intro:
        'Projects and activities carried out by PRAYASH members and volunteers across nearby villages. Each project is published after review, and outcomes appear only once they are verified.',
    },
  },
  villages: {
    key: 'villages',
    label: 'Villages We Serve',
    path: '/villages',
    description: 'Introduction to the village directory.',
    fields: [heading(), intro()],
    defaults: {
      heading: 'Villages We Serve',
      intro: 'The villages and localities where PRAYASH is active. Each village page lists the published projects carried out there.',
    },
  },
  request_help: {
    key: 'request_help',
    label: 'Request Help',
    path: '/request-help',
    description: 'Guidance shown above the assistance request form.',
    fields: [
      heading(),
      intro(),
      { name: 'steps', label: 'What happens next', type: 'items', maxItems: 5, itemLabel: 'step' },
      { name: 'important', label: 'Important information', type: 'markdown', max: 3000 },
    ],
    defaults: {
      heading: 'Request Help',
      intro:
        'If you or someone you know needs support with education, medical care, food or other essential needs, you can ask PRAYASH for help here. Your request is private.',
      steps: [
        { title: 'Tell us what is needed', body: 'Fill in the form — it takes about five minutes. You will receive a reference number.' },
        { title: 'We review your request', body: 'A member of our team reviews it and may call you to understand the situation.' },
        { title: 'We keep you informed', body: 'Check the status at any time with your reference number and phone number.' },
      ],
      important: [
        '- Submitting a request does **not** guarantee that assistance can be provided. Every request is reviewed individually, and support depends on need and the resources available.',
        '- PRAYASH will **never** ask you for money, OTPs, UPI PINs or bank passwords to process a request.',
        '- **In an emergency, call 112** (national emergency number) or **108** for an ambulance. PRAYASH cannot respond to emergencies.',
      ].join('\n'),
    },
  },
  donate: {
    key: 'donate',
    label: 'Support Us',
    path: '/support-us',
    description: 'Text on the donations page. Payment details are set in Settings.',
    fields: [
      heading(),
      intro(),
      { name: 'uses', label: 'How contributions are used', type: 'markdown', max: 3000 },
      { name: 'after_paying', label: 'After you pay', type: 'markdown', max: 3000 },
    ],
    defaults: {
      heading: 'Support Us',
      intro:
        'Your contribution helps PRAYASH support people in need across our villages. Please use only the official payment details shown on this page.',
      uses:
        'Contributions are used for education, healthcare, food and essential-needs support and for community activities. How the money is used is shown in our published financial reports.',
      after_paying: [
        '1. **Tell us about your payment** using the form on this page, including the UPI reference or UTR number.',
        '2. **Our treasurer checks it** against the organisation’s bank statement. A screenshot alone does not confirm a donation.',
        '3. **You receive an acknowledgement** once the payment has been verified.',
      ].join('\n'),
    },
  },
  volunteer: {
    key: 'volunteer',
    label: 'Become a Volunteer',
    path: '/volunteer',
    description: 'Text above the volunteer registration form.',
    fields: [
      heading(),
      intro(),
      { name: 'ways', label: 'Ways to help', type: 'items', maxItems: 6, itemLabel: 'way to help' },
      { name: 'what_to_expect', label: 'What to expect', type: 'markdown', max: 3000 },
    ],
    defaults: {
      heading: 'Become a Volunteer',
      intro: 'Join friends and well-wishers who give their time and skills to support people across our villages.',
      ways: [
        { title: 'Teaching and mentoring', body: 'Help students with lessons, homework or exam preparation.' },
        { title: 'Health and care', body: 'Support health-related activities if you have medical or first-aid skills.' },
        { title: 'Distribution and logistics', body: 'Help organise and deliver food, kits and supplies.' },
        { title: 'Organising and outreach', body: 'Help plan activities, spread the word and keep records.' },
      ],
      what_to_expect:
        'A volunteer coordinator reviews every registration and will contact you. Your contact details are kept private and are seen only by coordinators. We will never publish your name without your permission.',
    },
  },
  transparency: {
    key: 'transparency',
    label: 'Transparency',
    path: '/transparency',
    description: 'Explanation of financial controls shown above the reports.',
    fields: [heading(), intro(), { name: 'approach', label: 'How we keep accounts', type: 'markdown', max: 5000 }],
    defaults: {
      heading: 'Transparency & Financial Reports',
      intro:
        'PRAYASH records every contribution and expense as an individual transaction. Reports are published here only after review and approval.',
      approach: [
        '- **Every transaction is recorded individually** — contributions, donations, expenses, refunds and transfers. Totals are always calculated from these records, never typed in by hand.',
        '- **A second person verifies each entry** against a bank statement, bill or receipt before it counts towards any balance.',
        '- **Mistakes are corrected openly.** A recorded transaction is never edited or deleted; it is reversed with a new, linked entry, so the history stays complete.',
        '- **Accounts are reconciled** against bank statements, and reconciled periods are locked.',
        '- **Reports show totals only.** The names and contact details of donors and of the people we help are never published.',
      ].join('\n'),
    },
  },
  contact: {
    key: 'contact',
    label: 'Contact Us',
    path: '/contact',
    description: 'Text on the contact page. Contact details are set in Settings.',
    fields: [heading(), intro()],
    defaults: {
      heading: 'Contact Us',
      intro: 'Questions, suggestions or ideas for working together — we would be glad to hear from you.',
    },
  },
  privacy: {
    key: 'privacy',
    label: 'Privacy Policy',
    path: '/privacy',
    description: 'The privacy policy. The default text is a draft that must be reviewed before launch.',
    fields: [
      heading(),
      { name: 'last_updated', label: 'Last updated (e.g. 1 November 2026)', type: 'text', max: 40 },
      { name: 'body', label: 'Policy text', type: 'markdown', max: 30000 },
    ],
    defaults: {
      heading: 'Privacy Policy',
      last_updated: '',
      body: [
        '## Who we are',
        'This website is run by PRAYASH, a group of friends and well-wishers. You can reach us using the details on the [Contact page](/contact).',
        '',
        '## What we collect and why',
        '- **Requests for help:** the name of the person who needs help, a phone number, an optional email address, village or locality, a description of the situation and how you prefer to be contacted. We use this only to review and respond to the request.',
        '- **Volunteer registrations:** your name, contact details, village, skills, availability and interests, and for volunteers under 18 the name and phone number of a parent or guardian. We use this only to coordinate volunteering.',
        '- **Donation reports:** the amount, date and payment reference, your name (unless you choose to be anonymous), contact details and an optional payment screenshot. We use this to match your payment against our bank records.',
        '- **Contact messages:** your name, contact details and message.',
        '- **Team accounts:** the name and email address of PRAYASH team members.',
        '',
        'We do **not** collect card numbers, UPI PINs, OTPs or banking passwords, and we will never ask for them.',
        '',
        '## Who can see your information',
        'Access is limited by role. Requests for help are visible only to assistance reviewers and administrators; volunteer details only to volunteer coordinators and administrators; donation records only to the treasurer and administrators. Changes are recorded in an audit log.',
        '',
        'We do not sell personal information or share it for marketing. The public website does not use advertising or analytics trackers.',
        '',
        '## Photographs and stories',
        'We publish photographs in which people can be identified, or stories about people we have helped, only with their informed consent.',
        '',
        '## How long we keep information',
        'We keep personal information only for as long as it is needed for the purpose it was collected for, and to keep proper financial records. Personal details in closed requests for help can be removed while keeping anonymous statistics.',
        '',
        '## Your choices',
        'You can ask us to see, correct or delete the information we hold about you by contacting us.',
        '',
        '## Security',
        'Information is stored with a hosting provider that encrypts data in transit. Team members sign in with individual accounts, and permissions are enforced by the database itself.',
        '',
        '## Third-party services',
        'If a security check is shown on our forms, it is provided by Cloudflare Turnstile to protect against automated spam.',
      ].join('\n'),
    },
  },
  terms: {
    key: 'terms',
    label: 'Terms of Use',
    path: '/terms',
    description: 'Terms of use. The default text is a draft that must be reviewed before launch.',
    fields: [
      heading(),
      { name: 'last_updated', label: 'Last updated (e.g. 1 November 2026)', type: 'text', max: 40 },
      { name: 'body', label: 'Terms text', type: 'markdown', max: 30000 },
    ],
    defaults: {
      heading: 'Terms of Use',
      last_updated: '',
      body: [
        '## Using this website',
        'This website provides information about PRAYASH and lets you request help, register as a volunteer, report a donation and contact us. Please provide accurate information.',
        '',
        '## Requests for help',
        'Submitting a request does not guarantee that assistance will be provided. Every request is reviewed individually and decisions depend on need and available resources.',
        '',
        '## Donations',
        'Donations are voluntary. Please use only the payment details published on the Support Us page. A donation is recorded only after our treasurer has verified it against the organisation’s bank records.',
        '',
        '## Content',
        'Photographs and text on this website belong to PRAYASH or are used with permission. Please ask before reusing them.',
        '',
        '## Changes',
        'We may update these terms. The date at the top shows when they were last changed.',
      ].join('\n'),
    },
  },
};

export function isItems(value: ContentValue | undefined): value is ContentItem[] {
  return Array.isArray(value);
}

/** Merges published content over defaults, ignoring malformed or unknown fields. */
export function mergeContent(key: ContentKey, published: unknown): PageContent {
  const def = PAGE_DEFINITIONS[key];
  const out: PageContent = { ...def.defaults };
  if (!published || typeof published !== 'object' || Array.isArray(published)) return out;
  const source = published as Record<string, unknown>;
  for (const field of def.fields) {
    const value = source[field.name];
    if (field.type === 'items') {
      if (Array.isArray(value)) {
        out[field.name] = value
          .filter((v): v is ContentItem => !!v && typeof v === 'object' && typeof v.title === 'string' && typeof v.body === 'string')
          .slice(0, field.maxItems)
          .map((v) => ({ title: v.title.slice(0, 120), body: v.body.slice(0, 600) }));
      }
    } else if (typeof value === 'string') {
      out[field.name] = value.slice(0, field.max);
    }
  }
  return out;
}

export function textOf(content: PageContent, name: string): string {
  const v = content[name];
  return typeof v === 'string' ? v : '';
}

export function itemsOf(content: PageContent, name: string): ContentItem[] {
  const v = content[name];
  return Array.isArray(v) ? v : [];
}
