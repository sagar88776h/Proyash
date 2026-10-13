import type { Enums } from '@/types/database';

type LabelMap<E extends string> = Record<E, string>;

export const ROLE_LABELS: LabelMap<Enums<'app_role'>> = {
  admin: 'Administrator',
  treasurer: 'Treasurer',
  assistance_reviewer: 'Assistance reviewer',
  volunteer_coordinator: 'Volunteer coordinator',
  publisher: 'Publisher',
  volunteer: 'Volunteer',
};

export const ROLE_DESCRIPTIONS: LabelMap<Enums<'app_role'>> = {
  admin: 'Manages accounts, roles and settings; can see everything, including the audit log.',
  treasurer: 'Records and verifies financial entries, reconciles accounts and prepares reports.',
  assistance_reviewer: 'Reviews requests for help, records notes and decisions.',
  volunteer_coordinator: 'Reviews volunteer registrations, assigns volunteers and drafts projects.',
  publisher: 'Edits website content and publishes projects, villages, outcomes and photos.',
  volunteer: 'Sees their own volunteer profile and assignments.',
};

export const ASSISTANCE_CATEGORY_LABELS: LabelMap<Enums<'assistance_category'>> = {
  education: 'Education',
  medical: 'Medical',
  food: 'Food',
  essential_needs: 'Essential needs',
  other: 'Other',
};

export const ASSISTANCE_CATEGORY_HINTS: LabelMap<Enums<'assistance_category'>> = {
  education: 'School or college fees, books, uniforms, exam costs',
  medical: 'Treatment, medicines, tests or travel for care',
  food: 'Rations or food support for a household',
  essential_needs: 'Clothing, bedding, household essentials, urgent repairs',
  other: 'Something else — tell us about it',
};

/** Staff-facing status names. */
export const ASSISTANCE_STATUS_LABELS: LabelMap<Enums<'assistance_status'>> = {
  pending: 'Pending',
  under_review: 'Under review',
  more_information_required: 'More information required',
  approved: 'Approved',
  declined: 'Declined',
  assistance_provided: 'Assistance provided',
};

/** Applicant-facing explanations of each status. */
export const ASSISTANCE_STATUS_EXPLANATIONS: LabelMap<Enums<'assistance_status'>> = {
  pending: 'We have received your request. A member of the team will look at it soon.',
  under_review: 'Your request is being reviewed by our team.',
  more_information_required: 'We need some more information before we can continue. Please see the message below.',
  approved: 'Your request has been approved. Our team will contact you about the next steps.',
  declined: 'We are unable to help with this request. You are welcome to contact us if your situation changes.',
  assistance_provided: 'Assistance has been provided for this request.',
};

export const URGENCY_LABELS: LabelMap<Enums<'assistance_urgency'>> = {
  standard: 'Within the next few weeks',
  urgent: 'Urgent — within days',
};

export const RELATIONSHIP_LABELS: LabelMap<Enums<'requester_relationship'>> = {
  self: 'Myself',
  family_member: 'A family member',
  neighbour: 'A neighbour',
  community_member: 'Someone in my community',
  other: 'Someone else',
};

export const CONTACT_METHOD_LABELS: LabelMap<Enums<'contact_method'>> = {
  phone_call: 'Phone call',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
};

export const ACTIVITY_CATEGORY_LABELS: LabelMap<Enums<'activity_category'>> = {
  education: 'Education',
  healthcare: 'Healthcare',
  food_security: 'Food security',
  essential_needs: 'Essential needs',
  environment: 'Environment',
  community_development: 'Community development',
  emergency_relief: 'Emergency relief',
  other: 'Other',
};

export const PROJECT_STATUS_LABELS: LabelMap<Enums<'project_status'>> = {
  planned: 'Planned',
  ongoing: 'Ongoing',
  completed: 'Completed',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
};

export const VOLUNTEER_STATUS_LABELS: LabelMap<Enums<'volunteer_status'>> = {
  pending: 'Pending review',
  approved: 'Approved',
  active: 'Active',
  inactive: 'Inactive',
  declined: 'Declined',
};

export const ASSIGNMENT_STATUS_LABELS: LabelMap<Enums<'assignment_status'>> = {
  assigned: 'Assigned',
  confirmed: 'Confirmed',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
};

export const SKILL_LABELS: Record<string, string> = {
  teaching_tutoring: 'Teaching or tutoring',
  healthcare: 'Healthcare',
  first_aid: 'First aid',
  counselling: 'Counselling or listening',
  logistics: 'Logistics and distribution',
  fundraising: 'Fundraising',
  photography: 'Photography',
  social_media: 'Social media',
  writing_translation: 'Writing or translation',
  accounting: 'Accounting',
  event_management: 'Organising events',
  driving: 'Driving',
  cooking: 'Cooking',
  construction_repair: 'Construction or repairs',
  technology: 'Computers and technology',
  other: 'Something else',
};

export const AVAILABILITY_LABELS: Record<string, string> = {
  weekday_mornings: 'Weekday mornings',
  weekday_evenings: 'Weekday evenings',
  weekends: 'Weekends',
  school_holidays: 'School holidays',
  emergencies: 'In emergencies',
  remote: 'Remotely / online',
};

export const MEDIA_STATUS_LABELS: LabelMap<Enums<'media_status'>> = {
  pending_review: 'Awaiting review',
  published: 'Published',
  rejected: 'Rejected',
  archived: 'Archived',
};

export const CONSENT_STATUS_LABELS: LabelMap<Enums<'consent_status'>> = {
  not_required: 'Not required (no identifiable people)',
  obtained: 'Informed consent obtained',
  pending: 'Consent pending',
  refused: 'Consent refused',
};

export const ENTRY_TYPE_LABELS: LabelMap<Enums<'ledger_entry_type'>> = {
  opening_balance: 'Opening balance',
  member_contribution: 'Member contribution',
  public_donation: 'Public donation',
  other_income: 'Other income',
  expense: 'Expense',
  refund: 'Refund',
  transfer: 'Transfer between accounts',
  allocation: 'Project allocation',
  reversal: 'Reversal (correction)',
};

export const LEDGER_STATUS_LABELS: LabelMap<Enums<'ledger_status'>> = {
  pending: 'Pending verification',
  verified: 'Verified',
  rejected: 'Rejected',
};

export const PAYMENT_METHOD_LABELS: LabelMap<Enums<'payment_method'>> = {
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  other: 'Other',
};

export const EXPENSE_CATEGORY_LABELS: LabelMap<Enums<'expense_category'>> = {
  education_support: 'Education support',
  medical_support: 'Medical support',
  food_support: 'Food support',
  essential_needs: 'Essential needs',
  project_materials: 'Project materials',
  transport: 'Transport',
  events: 'Events',
  administration: 'Administration',
  bank_charges: 'Bank charges',
  other: 'Other',
};

export const ACCOUNT_TYPE_LABELS: LabelMap<Enums<'account_type'>> = {
  bank: 'Bank account',
  cash: 'Cash',
  digital_wallet: 'Digital wallet',
};

export const EVIDENCE_KIND_LABELS: LabelMap<Enums<'evidence_kind'>> = {
  payment_screenshot: 'Payment screenshot (from donor)',
  receipt: 'Receipt',
  bill: 'Bill or invoice',
  bank_statement: 'Bank statement extract',
  other: 'Other document',
};

export const REPORT_PERIOD_LABELS: LabelMap<Enums<'report_period'>> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  custom: 'Custom period',
};

export const REPORT_STATUS_LABELS: LabelMap<Enums<'report_status'>> = {
  draft: 'Draft',
  published: 'Published',
  withdrawn: 'Withdrawn',
};

export const MESSAGE_STATUS_LABELS: LabelMap<Enums<'message_status'>> = {
  new: 'New',
  in_progress: 'In progress',
  closed: 'Closed',
};

export function optionsFrom<E extends string>(labels: Record<E, string>, hints?: Partial<Record<E, string>>) {
  return (Object.keys(labels) as E[]).map((value) => ({
    value,
    label: labels[value],
    description: hints?.[value],
  }));
}
