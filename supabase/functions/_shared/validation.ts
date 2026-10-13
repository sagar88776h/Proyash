/**
 * Validation shared by the browser forms and the public-api edge function.
 * The database re-validates everything again (defence in depth), so these
 * rules mirror the SQL functions in supabase/migrations.
 *
 * Runtime-neutral: imports only `zod` (resolved from node_modules by Vite and
 * through the import map by Deno).
 */
import { z } from 'zod';
import { normalizePhone, normalizeReference } from './phone.ts';

export { normalizePhone, normalizeReference };

export const ASSISTANCE_CATEGORIES = ['education', 'medical', 'food', 'essential_needs', 'other'] as const;
export const ASSISTANCE_URGENCY = ['standard', 'urgent'] as const;
export const REQUESTER_RELATIONSHIPS = ['self', 'family_member', 'neighbour', 'community_member', 'other'] as const;
export const CONTACT_METHODS = ['phone_call', 'whatsapp', 'sms', 'email'] as const;
export const VOLUNTEER_SKILLS = [
  'teaching_tutoring',
  'healthcare',
  'first_aid',
  'counselling',
  'logistics',
  'fundraising',
  'photography',
  'social_media',
  'writing_translation',
  'accounting',
  'event_management',
  'driving',
  'cooking',
  'construction_repair',
  'technology',
  'other',
] as const;
export const VOLUNTEER_AVAILABILITY = [
  'weekday_mornings',
  'weekday_evenings',
  'weekends',
  'school_holidays',
  'emergencies',
  'remote',
] as const;
export const ACTIVITY_CATEGORIES = [
  'education',
  'healthcare',
  'food_security',
  'essential_needs',
  'environment',
  'community_development',
  'emergency_relief',
  'other',
] as const;
export const DONATION_REPORT_METHODS = ['upi', 'bank_transfer'] as const;

export const UPLOAD_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const phoneField = z
  .string({ error: 'Enter a phone number.' })
  .trim()
  .min(1, 'Enter a phone number.')
  .max(30, 'Phone number is too long.')
  .refine((v) => normalizePhone(v) !== null, 'Enter a valid phone number, for example 98765 43210.');

const optionalPhoneField = z
  .string()
  .trim()
  .max(30, 'Phone number is too long.')
  .optional()
  .refine((v) => !v || normalizePhone(v) !== null, 'Enter a valid phone number, for example 98765 43210.');

const optionalEmailField = z
  .string()
  .trim()
  .max(254, 'Email address is too long.')
  .optional()
  .refine((v) => !v || EMAIL_RE.test(v), 'Enter a valid email address.');

const optionalVillageField = z
  .union([z.uuid(), z.literal('')])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

/** Anti-abuse fields sent with every public form (not shown to people). */
export const formMetaSchema = z.object({
  client_submission_id: z.uuid(),
  /** Honeypot: hidden from people; bots tend to fill it in. */
  website: z.string().max(500).optional(),
  /** When the form was first shown (ms since epoch). */
  started_at: z.number().int().nonnegative().optional(),
  captcha_token: z.string().max(4096).optional(),
});

export const assistanceRequestSchema = z
  .object({
    category: z.enum(ASSISTANCE_CATEGORIES, { error: 'Choose the type of help needed.' }),
    urgency: z.enum(ASSISTANCE_URGENCY).default('standard'),
    applicant_name: z
      .string({ error: 'Enter the name of the person who needs help.' })
      .trim()
      .min(2, 'Enter the name of the person who needs help.')
      .max(120, 'Name must be 120 characters or fewer.'),
    phone: phoneField,
    email: optionalEmailField,
    village_id: optionalVillageField,
    locality: z.string().trim().max(160, 'Locality must be 160 characters or fewer.').optional(),
    description: z
      .string({ error: 'Describe the situation and the help needed.' })
      .trim()
      .min(20, 'Please describe the situation in at least 20 characters.')
      .max(3000, 'Please keep the description under 3000 characters.'),
    relationship: z.enum(REQUESTER_RELATIONSHIPS).default('self'),
    preferred_contact: z.enum(CONTACT_METHODS).default('phone_call'),
    consent: z.literal(true, { error: 'Please confirm that PRAYASH may use these details to review the request.' }),
  })
  .refine((d) => d.village_id || (d.locality && d.locality.length >= 2), {
    path: ['locality'],
    message: 'Choose your village or type the name of your village or locality.',
  })
  .refine((d) => d.preferred_contact !== 'email' || !!d.email, {
    path: ['email'],
    message: 'Add an email address if you would like to be contacted by email.',
  });

export const statusLookupSchema = z.object({
  reference_code: z
    .string({ error: 'Enter your reference number.' })
    .trim()
    .min(1, 'Enter your reference number.')
    .max(20)
    .transform(normalizeReference)
    .refine((v) => /^PRY-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(v), 'Reference numbers look like PRY-K7Q2-M9XD.'),
  phone: phoneField,
});

export const followUpSchema = statusLookupSchema.extend({
  message: z
    .string({ error: 'Enter the information requested.' })
    .trim()
    .min(1, 'Enter the information requested.')
    .max(2000, 'Please keep your message under 2000 characters.'),
});

export const volunteerSchema = z
  .object({
    full_name: z.string({ error: 'Enter your full name.' }).trim().min(2, 'Enter your full name.').max(120),
    phone: phoneField,
    email: optionalEmailField,
    village_id: optionalVillageField,
    locality: z.string().trim().max(160).optional(),
    is_adult: z.boolean({ error: 'Tell us whether you are 18 or older.' }),
    guardian_name: z.string().trim().max(120).optional(),
    guardian_phone: optionalPhoneField,
    skills: z.array(z.enum(VOLUNTEER_SKILLS)).max(20).default([]),
    skills_other: z.string().trim().max(200).optional(),
    availability: z
      .array(z.enum(VOLUNTEER_AVAILABILITY))
      .min(1, 'Choose at least one time when you are available.'),
    preferred_activities: z.array(z.enum(ACTIVITY_CATEGORIES)).default([]),
    languages: z.string().trim().max(200).optional(),
    motivation: z.string().trim().max(1000, 'Please keep this under 1000 characters.').optional(),
    consent_contact: z.literal(true, { error: 'Please agree to be contacted about volunteering.' }),
    consent_public_recognition: z.boolean().default(false),
  })
  .refine((d) => d.village_id || (d.locality && d.locality.length >= 2), {
    path: ['locality'],
    message: 'Choose your village or type the name of your village or locality.',
  })
  .refine((d) => d.is_adult || (d.guardian_name && d.guardian_name.length >= 2), {
    path: ['guardian_name'],
    message: "Volunteers under 18 need a parent or guardian's name.",
  })
  .refine((d) => d.is_adult || !!d.guardian_phone, {
    path: ['guardian_phone'],
    message: "Volunteers under 18 need a parent or guardian's phone number.",
  });

export const contactSchema = z
  .object({
    name: z.string({ error: 'Enter your name.' }).trim().min(2, 'Enter your name.').max(120),
    email: optionalEmailField,
    phone: optionalPhoneField,
    subject: z.string({ error: 'Enter a subject.' }).trim().min(2, 'Enter a subject.').max(150),
    message: z
      .string({ error: 'Enter your message.' })
      .trim()
      .min(10, 'Please write at least 10 characters.')
      .max(4000, 'Please keep your message under 4000 characters.'),
  })
  .refine((d) => !!d.email || !!d.phone, { path: ['email'], message: 'Give an email address or phone number so we can reply.' });

function isoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const donationReportSchema = z
  .object({
    amount: z
      .string({ error: 'Enter the amount you paid.' })
      .trim()
      .regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter the amount in rupees, for example 500 or 500.50.')
      .refine((v) => Number(v) > 0, 'The amount must be greater than zero.'),
    paid_on: z
      .string({ error: 'Enter the date of payment.' })
      .refine((v) => {
        const d = isoDate(v);
        if (!d) return false;
        const now = Date.now() + 5.5 * 3600 * 1000; // India Standard Time
        return d.getTime() <= now && d.getTime() >= now - 366 * 86400 * 1000;
      }, 'Enter the payment date (within the last year, not in the future).'),
    payment_method: z.enum(DONATION_REPORT_METHODS, { error: 'Choose how you paid.' }),
    transaction_reference: z
      .string({ error: 'Enter the UPI reference / UTR number.' })
      .trim()
      .regex(/^[A-Za-z0-9/-]{6,40}$/, 'Enter the reference number exactly as shown in your payment app (6–40 letters or digits).'),
    is_anonymous: z.boolean().default(false),
    donor_name: z.string().trim().max(120).optional(),
    donor_phone: optionalPhoneField,
    donor_email: optionalEmailField,
    acknowledge_publicly: z.boolean().default(false),
    message: z.string().trim().max(500, 'Please keep your message under 500 characters.').optional(),
  })
  .refine((d) => d.is_anonymous || (d.donor_name && d.donor_name.length >= 2), {
    path: ['donor_name'],
    message: 'Enter your name, or choose to donate anonymously.',
  })
  .refine((d) => !!d.donor_phone || !!d.donor_email, {
    path: ['donor_phone'],
    message: 'Give a phone number or email so the treasurer can contact you if needed.',
  });

export type AssistanceRequestInput = z.input<typeof assistanceRequestSchema>;
export type AssistanceRequestData = z.output<typeof assistanceRequestSchema>;
export type VolunteerInput = z.input<typeof volunteerSchema>;
export type VolunteerData = z.output<typeof volunteerSchema>;
export type ContactInput = z.input<typeof contactSchema>;
export type ContactData = z.output<typeof contactSchema>;
export type DonationReportInput = z.input<typeof donationReportSchema>;
export type DonationReportData = z.output<typeof donationReportSchema>;
export type StatusLookupInput = z.input<typeof statusLookupSchema>;
export type FollowUpInput = z.input<typeof followUpSchema>;

/** Converts a ZodError into { field: firstMessage }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * Identifies an uploaded file by its leading bytes; the declared content type
 * is never trusted. Returns the detected MIME type or null if not allowed.
 */
export function sniffFileType(bytes: Uint8Array): (typeof UPLOAD_MIME_TYPES)[number] | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return 'application/pdf';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function extensionFor(mime: (typeof UPLOAD_MIME_TYPES)[number]): string {
  return { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
}
