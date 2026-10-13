import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field';
import { normalizePhone } from '@shared/phone.ts';
import type { ContactSettings, DonationSettings, OrganisationSettings, SocialSettings } from '@/lib/api/public';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { getAllSettings, saveSetting, type FinanceControls, type SettingKey, type SettingMeta, type SettingsMap } from '../api/admin';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Card, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTPS = /^https:\/\/[^\s<>"]+$/;
const UPI = /^[A-Za-z0-9._-]{2,99}@[A-Za-z][A-Za-z0-9]{1,63}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^[0-9]{6,20}$/;

const orNull = (s: string) => (s.trim() ? s.trim() : null);

type Errors = Record<string, string>;

function useSaver<K extends SettingKey>(key: K) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const save = async (value: SettingsMap[K], message: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await saveSetting(key, value);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(message);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  /** Like save, but throws so a confirmation dialog can show the error. */
  const saveOrThrow = async (value: SettingsMap[K], message: string) => {
    await saveSetting(key, value);
    await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    await queryClient.invalidateQueries({ queryKey: ['settings'] });
    toast.success(message);
  };
  return { busy, error, setError, save, saveOrThrow };
}

function SectionForm({ title, description, meta, error, busy, onSubmit, children, submitLabel = 'Save' }: {
  title: string;
  description?: ReactNode;
  meta?: SettingMeta;
  error?: string;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  submitLabel?: string;
}) {
  return (
    <Card title={title}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {description && <div className="text-sm text-ink-600">{description}</div>}
        {children}
        {error && <Alert tone="danger" live="assertive">{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-ink-600">{meta ? `Last changed ${formatDateTime(meta.updated_at)}` : ''}</span>
          <Button type="submit" loading={busy}>{submitLabel}</Button>
        </div>
      </form>
    </Card>
  );
}

function ContactForm({ value, meta }: { value: ContactSettings; meta?: SettingMeta }) {
  const s = useSaver('contact');
  const [d, setD] = useState({
    phone: value.phone ?? '',
    whatsapp: value.whatsapp ?? '',
    email: value.email ?? '',
    address: value.address ?? '',
    hours: value.hours ?? '',
    map_url: value.map_url ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((p) => ({ ...p, [k]: e.target.value }));
  return (
    <SectionForm
      title="Contact details"
      description="Shown in the footer and on the Contact page. Use the organisation’s official phone number and email only — never a volunteer’s personal number without their agreement."
      meta={meta}
      error={s.error}
      busy={s.busy}
      onSubmit={async (e) => {
        e.preventDefault();
        const next: Errors = {};
        if (d.phone && !normalizePhone(d.phone)) next.phone = 'Enter a valid phone number.';
        if (d.whatsapp && !normalizePhone(d.whatsapp)) next.whatsapp = 'Enter a valid WhatsApp number.';
        if (d.email && !EMAIL.test(d.email.trim())) next.email = 'Enter a valid email address.';
        if (d.map_url && !HTTPS.test(d.map_url.trim())) next.map_url = 'Enter a full https:// link.';
        setErrors(next);
        if (Object.keys(next).length) return;
        await s.save(
          {
            phone: orNull(d.phone),
            whatsapp: orNull(d.whatsapp),
            email: d.email.trim() ? d.email.trim().toLowerCase() : null,
            address: orNull(d.address),
            hours: orNull(d.hours),
            map_url: orNull(d.map_url),
          },
          'Contact details saved and published.',
        );
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="set-phone" label="Phone number" optionalLabel error={errors.phone}>
          <Input type="tel" autoComplete="off" value={d.phone} onChange={set('phone')} maxLength={30} />
        </Field>
        <Field id="set-whatsapp" label="WhatsApp number" optionalLabel error={errors.whatsapp}>
          <Input type="tel" autoComplete="off" value={d.whatsapp} onChange={set('whatsapp')} maxLength={30} />
        </Field>
        <Field id="set-email" label="Email address" optionalLabel error={errors.email}>
          <Input type="email" autoComplete="off" value={d.email} onChange={set('email')} maxLength={254} />
        </Field>
        <Field id="set-hours" label="Hours" optionalLabel hint="For example: Every day, 9 am – 7 pm">
          <Input value={d.hours} onChange={set('hours')} maxLength={200} />
        </Field>
        <Field id="set-address" label="Postal address" optionalLabel className="sm:col-span-2">
          <Textarea rows={3} value={d.address} onChange={set('address')} maxLength={500} />
        </Field>
        <Field id="set-map" label="Map link" optionalLabel hint="A https:// link to the location on a map." error={errors.map_url} className="sm:col-span-2">
          <Input type="url" value={d.map_url} onChange={set('map_url')} maxLength={500} />
        </Field>
      </div>
    </SectionForm>
  );
}

const SOCIAL: Array<{ key: keyof SocialSettings; label: string }> = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'x', label: 'X (Twitter)' },
  { key: 'linkedin', label: 'LinkedIn' },
];

function SocialForm({ value, meta }: { value: SocialSettings; meta?: SettingMeta }) {
  const s = useSaver('social');
  const [d, setD] = useState<Record<string, string>>(Object.fromEntries(SOCIAL.map(({ key }) => [key, value[key] ?? ''])));
  const [errors, setErrors] = useState<Errors>({});
  return (
    <SectionForm
      title="Social media"
      description="Only add official PRAYASH accounts. Empty links are hidden."
      meta={meta}
      error={s.error}
      busy={s.busy}
      onSubmit={async (e) => {
        e.preventDefault();
        const next: Errors = {};
        for (const { key } of SOCIAL) if (d[key] && !HTTPS.test(d[key].trim())) next[key] = 'Enter a full https:// address.';
        setErrors(next);
        if (Object.keys(next).length) return;
        await s.save(Object.fromEntries(SOCIAL.map(({ key }) => [key, orNull(d[key] ?? '')])) as SocialSettings, 'Social links saved.');
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {SOCIAL.map(({ key, label }) => (
          <Field key={key} id={`set-social-${key}`} label={label} optionalLabel error={errors[key]}>
            <Input type="url" placeholder="https://" value={d[key] ?? ''} onChange={(e) => setD((p) => ({ ...p, [key]: e.target.value }))} maxLength={500} />
          </Field>
        ))}
      </div>
    </SectionForm>
  );
}

function DonationForm({ value, meta }: { value: DonationSettings; meta?: SettingMeta }) {
  const s = useSaver('donation');
  const [d, setD] = useState({
    accepting: value.accepting,
    upi_id: value.upi_id ?? '',
    payee_name: value.payee_name ?? '',
    instructions: value.instructions ?? '',
    account_name: value.bank?.account_name ?? '',
    bank_name: value.bank?.bank_name ?? '',
    account_number: value.bank?.account_number ?? '',
    ifsc: value.bank?.ifsc ?? '',
    branch: value.bank?.branch ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState<DonationSettings | null>(null);
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((p) => ({ ...p, [k]: e.target.value }));

  const build = (): DonationSettings | null => {
    const next: Errors = {};
    const upi = d.upi_id.trim();
    const ifsc = d.ifsc.trim().toUpperCase();
    const acct = d.account_number.replace(/\s/g, '');
    if (upi && !UPI.test(upi)) next.upi_id = 'Enter a valid UPI ID, for example name@bank.';
    if (acct && !ACCOUNT.test(acct)) next.account_number = 'Account numbers have 6–20 digits.';
    if (ifsc && !IFSC.test(ifsc)) next.ifsc = 'IFSC codes have 11 characters, for example SBIN0001234.';
    if (upi && !d.payee_name.trim()) next.payee_name = 'Enter the name the UPI ID is registered to.';
    if (acct && (!ifsc || !d.account_name.trim())) next.account_number = 'Enter the account name and IFSC code with the account number.';
    if (d.accepting && !upi && !acct) next.accepting = 'Add a UPI ID or bank account before switching donations on.';
    setErrors(next);
    if (Object.keys(next).length) return null;
    const hasBank = Boolean(acct || d.bank_name.trim() || d.account_name.trim());
    return {
      accepting: d.accepting,
      upi_id: upi || null,
      payee_name: orNull(d.payee_name),
      instructions: orNull(d.instructions),
      bank: hasBank
        ? { account_name: orNull(d.account_name), bank_name: orNull(d.bank_name), account_number: acct || null, ifsc: ifsc || null, branch: orNull(d.branch) }
        : null,
    };
  };

  const changedPaymentDetails = (next: DonationSettings) =>
    next.upi_id !== (value.upi_id ?? null) ||
    (next.bank?.account_number ?? null) !== (value.bank?.account_number ?? null) ||
    (next.bank?.ifsc ?? null) !== (value.bank?.ifsc ?? null) ||
    (next.accepting && !value.accepting);

  return (
    <>
      <SectionForm
        title="Donation payment details"
        description={
          <>
            Shown on the Support Us page. Only enter an account that belongs to PRAYASH and that the organisation has authorised for donations.
            Changes are recorded in the audit history with the old and new values.
          </>
        }
        meta={meta}
        error={s.error}
        busy={s.busy}
        submitLabel="Review and save"
        onSubmit={(e) => {
          e.preventDefault();
          const next = build();
          if (!next) return;
          if (changedPaymentDetails(next)) setPending(next);
          else void s.save(next, 'Donation settings saved.');
        }}
      >
        <Alert tone="warning">
          Payment details are a common target for fraud. If anyone asks you to change them, confirm in person with another office-holder before saving. This website never collects card numbers, UPI PINs or banking passwords.
        </Alert>
        <Checkbox
          label="Accept donations on the website"
          description="When off, the Support Us page explains that online donations are not yet open."
          checked={d.accepting}
          error={errors.accepting}
          onChange={(e) => setD((p) => ({ ...p, accepting: e.target.checked }))}
        />
        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="mb-3 font-medium">UPI</legend>
          <Field id="set-upi" label="UPI ID" optionalLabel error={errors.upi_id}>
            <Input autoComplete="off" spellCheck={false} value={d.upi_id} onChange={set('upi_id')} maxLength={100} />
          </Field>
          <Field id="set-payee" label="Registered payee name" optionalLabel error={errors.payee_name} hint="Shown so donors can check the name in their UPI app.">
            <Input value={d.payee_name} onChange={set('payee_name')} maxLength={100} />
          </Field>
        </fieldset>
        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="mb-3 font-medium">Bank transfer</legend>
          <Field id="set-acct-name" label="Account name" optionalLabel>
            <Input value={d.account_name} onChange={set('account_name')} maxLength={120} />
          </Field>
          <Field id="set-bank" label="Bank" optionalLabel>
            <Input value={d.bank_name} onChange={set('bank_name')} maxLength={120} />
          </Field>
          <Field id="set-acct" label="Account number" optionalLabel error={errors.account_number}>
            <Input inputMode="numeric" autoComplete="off" value={d.account_number} onChange={set('account_number')} maxLength={24} />
          </Field>
          <Field id="set-ifsc" label="IFSC code" optionalLabel error={errors.ifsc}>
            <Input autoComplete="off" spellCheck={false} value={d.ifsc} onChange={(e) => setD((p) => ({ ...p, ifsc: e.target.value.toUpperCase() }))} maxLength={11} />
          </Field>
          <Field id="set-branch" label="Branch" optionalLabel>
            <Input value={d.branch} onChange={set('branch')} maxLength={120} />
          </Field>
        </fieldset>
        <Field id="set-instructions" label="Additional instructions" optionalLabel hint="For example, how to give cash in person and get a receipt.">
          <Textarea rows={3} value={d.instructions} onChange={set('instructions')} maxLength={2000} />
        </Field>
      </SectionForm>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Confirm the payment details"
        description="Donors will send money to these details. Check every character against the bank’s official documents, and confirm the change with another office-holder. The old and new values are recorded in the audit history."
        confirmLabel="These details are correct — publish"
        onConfirm={async () => {
          if (!pending) return;
          await s.saveOrThrow(pending, 'Payment details published.');
        }}
      >
        {pending && (
          <dl className="grid gap-2 rounded-md bg-ivory-50 p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ink-600">Donations</dt><dd className="font-medium">{pending.accepting ? 'On' : 'Off'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-600">UPI ID</dt><dd className="font-mono font-medium break-all">{pending.upi_id ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-600">Payee</dt><dd className="font-medium">{pending.payee_name ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-600">Account number</dt><dd className="font-mono font-medium">{pending.bank?.account_number ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-600">IFSC</dt><dd className="font-mono font-medium">{pending.bank?.ifsc ?? '—'}</dd></div>
          </dl>
        )}
      </ConfirmDialog>
    </>
  );
}

function OrganisationForm({ value, meta }: { value: OrganisationSettings; meta?: SettingMeta }) {
  const s = useSaver('organisation');
  const [d, setD] = useState({
    legal_name: value.legal_name ?? '',
    registration_details: value.registration_details ?? '',
    established_year: value.established_year ? String(value.established_year) : '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const thisYear = new Date().getFullYear();
  return (
    <SectionForm
      title="Organisation details"
      description="Shown in the footer and on the About page when filled in. Leave a field empty unless it is officially confirmed — the website never shows registration or tax-exemption claims that are not entered here."
      meta={meta}
      error={s.error}
      busy={s.busy}
      onSubmit={async (e) => {
        e.preventDefault();
        const year = d.established_year.trim();
        const next: Errors = {};
        if (year && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > thisYear)) next.established_year = `Enter a year between 1900 and ${thisYear}.`;
        setErrors(next);
        if (Object.keys(next).length) return;
        await s.save(
          { legal_name: orNull(d.legal_name), registration_details: orNull(d.registration_details), established_year: year ? Number(year) : null },
          'Organisation details saved.',
        );
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="set-legal" label="Registered name" optionalLabel>
          <Input value={d.legal_name} onChange={(e) => setD((p) => ({ ...p, legal_name: e.target.value }))} maxLength={160} />
        </Field>
        <Field id="set-year" label="Year established" optionalLabel error={errors.established_year}>
          <Input inputMode="numeric" value={d.established_year} onChange={(e) => setD((p) => ({ ...p, established_year: e.target.value }))} maxLength={4} />
        </Field>
        <Field id="set-reg" label="Registration details" optionalLabel hint="For example the registration authority and number, exactly as on the certificate." className="sm:col-span-2">
          <Textarea rows={3} value={d.registration_details} onChange={(e) => setD((p) => ({ ...p, registration_details: e.target.value }))} maxLength={500} />
        </Field>
      </div>
    </SectionForm>
  );
}

function FinanceControlsForm({ value, meta }: { value: FinanceControls; meta?: SettingMeta }) {
  const s = useSaver('finance.controls');
  const [d, setD] = useState(value);
  const weakened = (!d.require_independent_verification && value.require_independent_verification) || (!d.require_independent_report_approval && value.require_independent_report_approval);
  return (
    <SectionForm
      title="Finance controls"
      description="Independent checks mean the person who records an entry or prepares a report cannot also verify or publish it."
      meta={meta}
      error={s.error}
      busy={s.busy}
      onSubmit={async (e) => {
        e.preventDefault();
        await s.save(d, 'Finance controls saved.');
      }}
    >
      <Checkbox
        label="Require a second person to verify ledger entries"
        checked={d.require_independent_verification}
        onChange={(e) => setD((p) => ({ ...p, require_independent_verification: e.target.checked }))}
      />
      <Checkbox
        label="Require a second person to publish financial reports"
        checked={d.require_independent_report_approval}
        onChange={(e) => setD((p) => ({ ...p, require_independent_report_approval: e.target.checked }))}
      />
      {weakened && (
        <Alert tone="warning">Turning off independent checks lets one person record and approve their own entries. Only do this temporarily while PRAYASH has a single finance volunteer.</Alert>
      )}
    </SectionForm>
  );
}

export function SettingsPage() {
  const query = useQuery({ queryKey: ['admin', 'settings'], queryFn: getAllSettings });
  return (
    <>
      <PageHeader title="Settings" description="Organisation-wide details used across the website. Only administrators can change these." />
      <QueryState query={query}>
        {({ values, meta }) => (
          <div className="flex flex-col gap-6">
            {values.contact && <ContactForm key={`contact-${meta.contact?.updated_at}`} value={values.contact} meta={meta.contact} />}
            {values.donation && <DonationForm key={`donation-${meta.donation?.updated_at}`} value={values.donation} meta={meta.donation} />}
            {values.organisation && <OrganisationForm key={`organisation-${meta.organisation?.updated_at}`} value={values.organisation} meta={meta.organisation} />}
            {values.social && <SocialForm key={`social-${meta.social?.updated_at}`} value={values.social} meta={meta.social} />}
            {values['finance.controls'] && <FinanceControlsForm key={`finance-${meta['finance.controls']?.updated_at}`} value={values['finance.controls']} meta={meta['finance.controls']} />}
          </div>
        )}
      </QueryState>
    </>
  );
}
