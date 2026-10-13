import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Landmark, ShieldAlert, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { CopyButton } from '@/components/forms/CopyButton';
import { FormErrorSummary } from '@/components/forms/FormErrorSummary';
import { Honeypot } from '@/components/forms/Honeypot';
import { Turnstile } from '@/components/forms/Turnstile';
import { summariseErrors, useFormSubmission } from '@/components/forms/useFormSubmission';
import { Container, Section } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { Markdown } from '@/components/Markdown';
import { Reveal } from '@/components/motion/Reveal';
import { Placeholder } from '@/components/Placeholder';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Checkbox, ChoiceGroup, Field, Input, Textarea } from '@/components/ui/Field';
import { textOf } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePublicSettings } from '@/hooks/useSettings';
import { callFunction } from '@/lib/api/functions';
import type { DonationSettings } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';
import { NotConnectedNotice } from '@/components/forms/NotConnectedNotice';
import { todayISO } from '@/lib/format';
import { useFormMeta } from '@/lib/submission';
import { donationReportSchema, MAX_UPLOAD_BYTES } from '@shared/validation.ts';

type FormInput = z.input<typeof donationReportSchema>;
type FormOutput = z.output<typeof donationReportSchema>;

function upiUri(d: DonationSettings): string | null {
  if (!d.upi_id) return null;
  const params = new URLSearchParams({ pa: d.upi_id, cu: 'INR', tn: 'Contribution to PRAYASH' });
  if (d.payee_name) params.set('pn', d.payee_name);
  return `upi://pay?${params.toString()}`;
}

function UpiCard({ donation }: { donation: DonationSettings }) {
  const [qr, setQr] = useState<string>();
  const uri = upiUri(donation);
  useEffect(() => {
    if (!uri) return;
    QRCode.toDataURL(uri, {
      margin: 1,
      width: 480,
      color: { dark: '#174B35', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then(setQr)
      .catch(() => setQr(undefined));
  }, [uri]);
  if (!uri || !donation.upi_id) return null;
  return (
    <div className="flex flex-col gap-5 rounded-card bg-ivory-50 p-6 shadow-soft sm:p-8">
      <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
        <Smartphone aria-hidden="true" className="size-5 text-forest-700" /> Pay by UPI
      </h3>
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {qr && (
          <img
            src={qr}
            width={176}
            height={176}
            alt={`QR code for paying PRAYASH by UPI at ${donation.upi_id}`}
            className="rounded-md bg-white p-2 shadow-[inset_0_0_0_1px_var(--color-ink-100)]"
          />
        )}
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-sm text-ink-600">UPI ID</dt>
            <dd className="flex flex-wrap items-center gap-3 font-display text-lg font-semibold break-all">
              {donation.upi_id} <CopyButton value={donation.upi_id} label="Copy UPI ID" />
            </dd>
          </div>
          {donation.payee_name && (
            <div>
              <dt className="text-sm text-ink-600">Payee name shown in your app</dt>
              <dd className="font-medium">{donation.payee_name}</dd>
            </div>
          )}
          <dd>
            <a
              href={uri}
              className="inline-flex items-center gap-2 text-sm font-medium text-forest-700 underline underline-offset-4 sm:hidden"
            >
              Open in a UPI app
            </a>
          </dd>
        </dl>
      </div>
      <p className="text-sm text-ink-600">
        Check that the payee name in your payment app matches before you pay.
      </p>
    </div>
  );
}

function BankCard({ donation }: { donation: DonationSettings }) {
  const bank = donation.bank;
  if (!bank || !(bank.account_number || bank.ifsc)) return null;
  const rows = [
    ['Account name', bank.account_name],
    ['Bank', bank.bank_name],
    ['Branch', bank.branch],
    ['Account number', bank.account_number],
    ['IFSC', bank.ifsc],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  return (
    <div className="flex flex-col gap-5 rounded-card bg-ivory-50 p-6 shadow-soft sm:p-8">
      <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
        <Landmark aria-hidden="true" className="size-5 text-forest-700" /> Bank transfer
      </h3>
      <dl className="grid gap-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-ink-600">{label}</dt>
            <dd className="flex flex-wrap items-center gap-2 font-medium break-all">
              {value}
              {(label === 'Account number' || label === 'IFSC') && (
                <CopyButton value={value} label="Copy" />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReportForm() {
  const { meta, reset: resetMeta } = useFormMeta();
  const honeypot = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string>();
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaReset, setCaptchaReset] = useState(0);
  const [result, setResult] = useState<'created' | 'already_reported' | 'received' | null>(null);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(donationReportSchema),
    // The error summary takes focus and lists every problem, including radio groups.
    shouldFocusError: false,
    defaultValues: {
      amount: '',
      paid_on: todayISO(),
      payment_method: 'upi',
      transaction_reference: '',
      is_anonymous: false,
      donor_name: '',
      donor_phone: '',
      donor_email: '',
      acknowledge_publicly: false,
      message: '',
    },
    mode: 'onTouched',
  });
  const { register, control, formState } = form;
  const submission = useFormSubmission(form.setError);
  const anonymous = useWatch({ control, name: 'is_anonymous' });

  if (result) {
    return (
      <div role="status" className="flex flex-col gap-4 rounded-panel bg-ivory-50 p-8 shadow-soft">
        <CheckCircle2 aria-hidden="true" className="size-10 text-success-700" strokeWidth={1.5} />
        {result === 'already_reported' ? (
          <>
            <h3 className="font-display text-2xl font-semibold">
              This payment has already been reported
            </h3>
            <p className="text-ink-700">
              We already have a report with this payment reference. Our treasurer will verify it —
              there is nothing more you need to do.
            </p>
          </>
        ) : (
          <>
            <h3 className="font-display text-2xl font-semibold">Thank you for your support</h3>
            <p className="text-ink-700">
              We have received your report. Our treasurer will check the payment against the
              organisation’s bank statement. Your contribution is recorded once it has been
              verified.
            </p>
          </>
        )}
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              form.reset();
              resetMeta();
              setResult(null);
            }}
          >
            Report another payment
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="relative flex flex-col gap-6"
      onSubmit={(event) =>
        void form.handleSubmit(
          async (values) => {
            submission.clearServerError();
            const file = fileRef.current?.files?.[0];
            if (file && file.size > MAX_UPLOAD_BYTES) {
              setFileError('The file is too large (maximum 5 MB).');
              return;
            }
            const fd = new FormData();
            fd.set(
              'payload',
              JSON.stringify({
                ...values,
                ...meta,
                website: honeypot.current?.value ?? '',
                captcha_token: captchaToken,
              }),
            );
            if (file) fd.set('file', file, file.name);
            try {
              const res = await callFunction<{
                result: 'created' | 'already_reported' | 'received';
              }>('public-api', '/donation-report', {
                formData: fd,
                timeoutMs: 60_000,
              });
              setResult(res.result);
            } catch (err) {
              submission.handleError(err);
              setCaptchaReset((n) => n + 1);
            }
          },
          () => submission.markAttempt(),
        )(event)
      }
    >
      <Honeypot inputRef={honeypot} />
      <FormErrorSummary errors={summariseErrors(formState.errors)} attempt={submission.attempt} />
      {submission.serverError && !submission.serverError.fields && (
        <Alert tone="danger" live="assertive" title="Your report was not sent">
          {submission.serverError.message}
        </Alert>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          id="f-amount"
          label="Amount paid (₹)"
          required
          error={formState.errors.amount?.message}
        >
          <Input inputMode="decimal" autoComplete="transaction-amount" {...register('amount')} />
        </Field>
        <Field
          id="f-paid_on"
          label="Date of payment"
          required
          error={formState.errors.paid_on?.message}
        >
          <Input type="date" max={todayISO()} {...register('paid_on')} />
        </Field>
      </div>
      <Controller
        control={control}
        name="payment_method"
        render={({ field }) => (
          <ChoiceGroup
            legend="How did you pay?"
            type="radio"
            name="payment_method"
            columns={2}
            options={[
              { value: 'upi', label: 'UPI' },
              { value: 'bank_transfer', label: 'Bank transfer (NEFT / IMPS / RTGS)' },
            ]}
            value={field.value}
            onChange={(v) => field.onChange(v)}
          />
        )}
      />
      <Field
        id="f-transaction_reference"
        label="UPI reference / UTR number"
        required
        hint="Shown in your payment app or bank SMS, usually 12 digits for UPI."
        error={formState.errors.transaction_reference?.message}
      >
        <Input autoComplete="off" spellCheck={false} {...register('transaction_reference')} />
      </Field>
      <Checkbox label="I would like to donate anonymously" {...register('is_anonymous')} />
      {!anonymous && (
        <Field
          id="f-donor_name"
          label="Your name"
          required
          error={formState.errors.donor_name?.message}
        >
          <Input autoComplete="name" {...register('donor_name')} />
        </Field>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          id="f-donor_phone"
          label="Phone number"
          hint="Phone or email is needed in case the treasurer has a question."
          error={formState.errors.donor_phone?.message}
        >
          <Input type="tel" inputMode="tel" autoComplete="tel" {...register('donor_phone')} />
        </Field>
        <Field
          id="f-donor_email"
          label="Email address"
          error={formState.errors.donor_email?.message}
        >
          <Input type="email" autoComplete="email" {...register('donor_email')} />
        </Field>
      </div>
      <Field id="f-message" label="Message" optionalLabel error={formState.errors.message?.message}>
        <Textarea rows={3} maxLength={500} {...register('message')} />
      </Field>
      <Field
        id="f-file"
        label="Payment screenshot"
        optionalLabel
        hint="JPG, PNG, WebP or PDF up to 5 MB. This helps the treasurer find your payment; it does not confirm it."
        error={fileError}
      >
        <Input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          className="h-auto py-2 file:mr-4 file:rounded-full file:border-0 file:bg-forest-50 file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-forest-700"
          onChange={() => setFileError(undefined)}
        />
      </Field>
      {!anonymous && (
        <Checkbox
          label="PRAYASH may thank me by name in its updates"
          description="Optional. If you leave this unticked, your name is never published."
          {...register('acknowledge_publicly')}
        />
      )}
      <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
      <div>
        <Button
          type="submit"
          size="lg"
          loading={formState.isSubmitting}
          loadingLabel="Sending…"
          disabled={!isBackendConfigured}
        >
          Send donation report
        </Button>
      </div>
      <NotConnectedNotice title="Online donation reports are not available yet" />
    </form>
  );
}

export function DonatePage() {
  useDocumentTitle('Support Us');
  const { content } = useContent('donate');
  const { settings, isLoading } = usePublicSettings();
  const donation = settings.donation;
  const hasMethod = donation.accepting && Boolean(donation.upi_id || donation.bank?.account_number);

  return (
    <>
      <PageHero
        eyebrow="Donate"
        title={textOf(content, 'heading')}
        intro={textOf(content, 'intro')}
      >
        <ButtonLink to="/transparency" variant="light">
          See how funds are reported
        </ButtonLink>
      </PageHero>
      <Section tone="ivory">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
            <div className="flex flex-col gap-6">
              <Reveal className="flex flex-col gap-3">
                <p className="eyebrow">Official payment details</p>
                <h2 className="text-display-md font-semibold">How to give</h2>
              </Reveal>
              {isLoading ? null : hasMethod ? (
                <>
                  <UpiCard donation={donation} />
                  <BankCard donation={donation} />
                  {donation.instructions && <p className="text-ink-700">{donation.instructions}</p>}
                </>
              ) : (
                <Placeholder
                  label="PRAYASH’s authorised payment method (UPI ID and/or bank account)"
                  hint="Payment details appear here once an administrator has entered and confirmed them in Settings. Until then, please contact PRAYASH directly before giving."
                />
              )}
              <Alert tone="warning" title="Stay safe">
                Only use the payment details shown on this page. PRAYASH will never ask for your UPI
                PIN, OTP, card number or bank password.
              </Alert>
              <div className="rounded-card bg-ivory-200/60 p-6">
                <h3 className="mb-2 font-display text-lg font-semibold">
                  How contributions are used
                </h3>
                <Markdown className="text-[0.9375rem]">{textOf(content, 'uses')}</Markdown>
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <Reveal className="flex flex-col gap-3">
                <p className="eyebrow">After you pay</p>
                <h2 className="text-display-md font-semibold">Tell us about your donation</h2>
                <Markdown className="text-[0.9375rem]">{textOf(content, 'after_paying')}</Markdown>
              </Reveal>
              <div className="rounded-panel bg-ivory-50 p-6 shadow-soft sm:p-8">
                <ReportForm />
              </div>
              <p className="flex items-start gap-2 text-sm text-ink-600">
                <ShieldAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-forest-700"
                />
                Reports are checked by the treasurer against the organisation’s bank statement. A
                screenshot alone never marks a donation as received.
              </p>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
