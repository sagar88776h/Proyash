import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, MessageSquareText, Paperclip } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormErrorSummary } from '@/components/forms/FormErrorSummary';
import { Honeypot } from '@/components/forms/Honeypot';
import { summariseErrors, useFormSubmission } from '@/components/forms/useFormSubmission';
import { Container, Section } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { callFunction } from '@/lib/api/functions';
import { AppError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { ASSISTANCE_CATEGORY_LABELS, ASSISTANCE_STATUS_EXPLANATIONS, ASSISTANCE_STATUS_LABELS } from '@/lib/labels';
import { useFormMeta } from '@/lib/submission';
import type { Enums } from '@/types/database';
import { MAX_UPLOAD_BYTES, statusLookupSchema } from '@shared/validation.ts';

type LookupInput = z.input<typeof statusLookupSchema>;
type LookupOutput = z.output<typeof statusLookupSchema>;

type RequestStatus = {
  found: true;
  reference_code: string;
  status: Enums<'assistance_status'>;
  category: Enums<'assistance_category'>;
  submitted_on: string;
  last_updated: string;
  applicant_message: string | null;
  can_follow_up: boolean;
};

const statusTone: Record<Enums<'assistance_status'>, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'forest'> = {
  pending: 'neutral',
  under_review: 'info',
  more_information_required: 'warning',
  approved: 'success',
  declined: 'danger',
  assistance_provided: 'forest',
};

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

function FollowUpForm({ credentials, onSent }: { credentials: LookupOutput; onSent: () => void }) {
  const { meta } = useFormMeta();
  const honeypot = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [fileError, setFileError] = useState<string>();
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  return (
    <form
      noValidate
      className="relative flex flex-col gap-5 rounded-card bg-ivory-50 p-6 shadow-soft sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(undefined);
        if (message.trim().length < 1) {
          setError('Enter the information requested.');
          return;
        }
        const file = fileRef.current?.files?.[0];
        if (file && file.size > MAX_UPLOAD_BYTES) {
          setFileError('The file is too large (maximum 5 MB).');
          return;
        }
        const fd = new FormData();
        fd.set('payload', JSON.stringify({ ...credentials, ...meta, message: message.trim(), website: honeypot.current?.value ?? '' }));
        if (file) fd.set('file', file, file.name);
        setSending(true);
        try {
          await callFunction('public-api', '/assistance/follow-up', { formData: fd, timeoutMs: 60_000 });
          onSent();
        } catch (err) {
          const appError = err instanceof AppError ? err : null;
          if (appError?.fields?.file) setFileError(appError.fields.file);
          setError(appError?.message ?? 'Your information could not be sent. Please try again.');
        } finally {
          setSending(false);
        }
      }}
    >
      <Honeypot inputRef={honeypot} />
      <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
        <MessageSquareText aria-hidden="true" className="size-5 text-forest-700" /> Send the information requested
      </h3>
      {error && (
        <Alert tone="danger" live="assertive">
          {error}
        </Alert>
      )}
      <Field id="f-message" label="Your message" required>
        <Textarea rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <Field
        id="f-file"
        label="Attach a document or photo"
        optionalLabel
        hint="PDF, JPG, PNG or WebP, up to 5 MB. Please do not send bank or card details."
        error={fileError}
      >
        <Input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          className="h-auto py-2 file:mr-4 file:rounded-full file:border-0 file:bg-forest-50 file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-forest-700"
          onChange={() => setFileError(undefined)}
        />
      </Field>
      <div>
        <Button type="submit" loading={sending} loadingLabel="Sending…" iconLeft={<Paperclip aria-hidden="true" className="size-4" />}>
          Send information
        </Button>
      </div>
    </form>
  );
}

export function RequestStatusPage() {
  useDocumentTitle('Check a request');
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [credentials, setCredentials] = useState<LookupOutput | null>(null);
  const [followUpSent, setFollowUpSent] = useState(false);
  const form = useForm<LookupInput, unknown, LookupOutput>({
    resolver: zodResolver(statusLookupSchema),
    defaultValues: { reference_code: '', phone: '' },
  });
  const submission = useFormSubmission(form.setError);

  async function lookup(values: LookupOutput) {
    submission.clearServerError();
    try {
      const res = await callFunction<{ status: RequestStatus }>('public-api', '/assistance/status', { body: values });
      setStatus(res.status);
      setCredentials(values);
    } catch (err) {
      setStatus(null);
      submission.handleError(err);
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Assistance"
        title="Check a request"
        intro="Enter the reference number you received and the phone number you used on the form."
        size="compact"
      />
      <Section tone="ivory">
        <Container size="narrow" className="flex flex-col gap-10">
          <form
            noValidate
            onSubmit={form.handleSubmit(lookup, () => submission.markAttempt())}
            className="flex flex-col gap-6 rounded-panel bg-ivory-50 p-6 shadow-soft sm:p-10"
          >
            <FormErrorSummary errors={summariseErrors(form.formState.errors)} attempt={submission.attempt} />
            {submission.serverError && !submission.serverError.fields && (
              <Alert tone={submission.serverError.kind === 'not_found' ? 'warning' : 'danger'} live="assertive">
                {submission.serverError.message}
              </Alert>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="f-reference_code" label="Reference number" required hint="For example PRY-K7Q2-M9XD" error={form.formState.errors.reference_code?.message}>
                <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} {...form.register('reference_code')} />
              </Field>
              <Field id="f-phone" label="Phone number" required error={form.formState.errors.phone?.message}>
                <Input type="tel" inputMode="tel" autoComplete="tel" {...form.register('phone')} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" loading={form.formState.isSubmitting} loadingLabel="Checking…">
                Check status
              </Button>
              <ButtonLink to="/request-help" variant="ghost">
                Make a new request
              </ButtonLink>
            </div>
          </form>

          {status && (
            <section aria-live="polite" aria-labelledby="status-heading" className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 rounded-panel bg-ivory-50 p-6 shadow-soft sm:p-10">
                <p className="text-sm text-ink-600">
                  Request <span className="font-semibold text-ink-900">{status.reference_code}</span> ·{' '}
                  {ASSISTANCE_CATEGORY_LABELS[status.category]}
                </p>
                <h2 id="status-heading" className="flex flex-wrap items-center gap-3 font-display text-2xl font-semibold">
                  Status: <Badge tone={statusTone[status.status]} className="text-sm">{ASSISTANCE_STATUS_LABELS[status.status]}</Badge>
                </h2>
                <p className="text-ink-700">{ASSISTANCE_STATUS_EXPLANATIONS[status.status]}</p>
                <dl className="grid gap-4 border-t border-ink-100 pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-600">Submitted</dt>
                    <dd className="font-medium">{formatDate(status.submitted_on)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-600">Last updated</dt>
                    <dd className="font-medium">{formatDate(status.last_updated)}</dd>
                  </div>
                </dl>
                {status.applicant_message && (
                  <div className="rounded-card bg-gold-100/70 p-5">
                    <p className="text-sm font-semibold text-gold-800">Message from the PRAYASH team</p>
                    <p className="mt-1 whitespace-pre-line text-ink-800">{status.applicant_message}</p>
                  </div>
                )}
              </div>
              {status.can_follow_up && credentials && !followUpSent && (
                <FollowUpForm
                  credentials={credentials}
                  onSent={() => {
                    setFollowUpSent(true);
                    void lookup(credentials);
                  }}
                />
              )}
              {followUpSent && (
                <Alert tone="success" title="Thank you — we have received your information">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 aria-hidden="true" className="size-4" /> Your request is back with our team for review.
                  </span>
                </Alert>
              )}
            </section>
          )}
        </Container>
      </Section>
    </>
  );
}
