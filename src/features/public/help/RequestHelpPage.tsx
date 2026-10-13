import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Info, Phone, Search } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { CopyButton } from '@/components/forms/CopyButton';
import { FormErrorSummary } from '@/components/forms/FormErrorSummary';
import { Honeypot } from '@/components/forms/Honeypot';
import { Turnstile } from '@/components/forms/Turnstile';
import { summariseErrors, useFormSubmission } from '@/components/forms/useFormSubmission';
import { VillageSelect } from '@/components/forms/VillageSelect';
import { Container, Section } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { Markdown } from '@/components/Markdown';
import { Reveal } from '@/components/motion/Reveal';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Checkbox, ChoiceGroup, Field, Input, Textarea } from '@/components/ui/Field';
import { itemsOf, textOf } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { callFunction } from '@/lib/api/functions';
import { isBackendConfigured } from '@/lib/env';
import {
  ASSISTANCE_CATEGORY_HINTS,
  ASSISTANCE_CATEGORY_LABELS,
  CONTACT_METHOD_LABELS,
  optionsFrom,
  RELATIONSHIP_LABELS,
  URGENCY_LABELS,
} from '@/lib/labels';
import { useFormMeta } from '@/lib/submission';
import { assistanceRequestSchema } from '@shared/validation.ts';

type FormInput = z.input<typeof assistanceRequestSchema>;
type FormOutput = z.output<typeof assistanceRequestSchema>;

type Outcome =
  | { kind: 'created'; reference: string }
  | { kind: 'duplicate' }
  | { kind: 'received' };

function SuccessPanel({ outcome, onReset }: { outcome: Outcome; onReset: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-6 rounded-panel bg-ivory-50 p-8 shadow-soft sm:p-12"
    >
      <CheckCircle2 aria-hidden="true" className="size-12 text-success-700" strokeWidth={1.5} />
      {outcome.kind === 'created' && (
        <>
          <h2 className="text-display-md font-semibold">
            Thank you — we have received your request
          </h2>
          <div className="flex flex-col gap-3 rounded-card bg-forest-50 p-6">
            <p className="text-sm font-medium text-ink-700">Your reference number</p>
            <div className="flex flex-wrap items-center gap-4">
              <p className="font-display text-3xl font-semibold tracking-[0.06em] text-forest-800 tabular-nums">
                {outcome.reference}
              </p>
              <CopyButton value={outcome.reference} label="Copy reference" />
            </div>
            <p className="text-sm text-ink-700">
              Please write this number down. You will need it, together with the phone number you
              gave, to check the status of your request.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-ink-700">
            <p className="font-medium text-ink-900">What happens next</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                A member of our team will review your request. They may call you to understand the
                situation.
              </li>
              <li>Reviewing a request does not guarantee that assistance can be provided.</li>
              <li>PRAYASH will never ask you for money, OTPs or bank PINs.</li>
            </ul>
          </div>
        </>
      )}
      {outcome.kind === 'duplicate' && (
        <>
          <h2 className="text-display-md font-semibold">
            We already have an open request from this phone number
          </h2>
          <p className="text-ink-700">
            There is already a request of this type from this phone number that our team is
            reviewing, so we have not created a second one. If your situation has changed, please
            contact us directly, or check your existing request with its reference number.
          </p>
        </>
      )}
      {outcome.kind === 'received' && (
        <>
          <h2 className="text-display-md font-semibold">Thank you</h2>
          <p className="text-ink-700">Your submission has been received.</p>
        </>
      )}
      <div className="flex flex-wrap gap-3">
        <ButtonLink
          to="/request-help/status"
          variant="primary"
          iconLeft={<Search aria-hidden="true" className="size-4" />}
        >
          Check a request
        </ButtonLink>
        <Button variant="ghost" onClick={onReset}>
          Submit another request
        </Button>
      </div>
    </div>
  );
}

function RequestForm() {
  const { meta, reset: resetMeta } = useFormMeta();
  const honeypot = useRef<HTMLInputElement>(null);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaReset, setCaptchaReset] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(assistanceRequestSchema),
    defaultValues: {
      category: undefined,
      urgency: 'standard',
      applicant_name: '',
      phone: '',
      email: '',
      village_id: '',
      locality: '',
      description: '',
      relationship: 'self',
      preferred_contact: 'phone_call',
      consent: false as unknown as true,
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, control, formState, reset } = form;
  const submission = useFormSubmission(form.setError);
  const description = useWatch({ control, name: 'description' }) ?? '';

  const onSubmit = (event: FormEvent) =>
    void handleSubmit(
      async (values) => {
        submission.clearServerError();
        try {
          const res = await callFunction<{ result: string; reference_code?: string }>(
            'public-api',
            '/assistance',
            {
              body: {
                ...values,
                village_id: values.village_id ?? '',
                ...meta,
                website: honeypot.current?.value ?? '',
                captcha_token: captchaToken,
              },
            },
          );
          if (res.result === 'created' && res.reference_code)
            setOutcome({ kind: 'created', reference: res.reference_code });
          else if (res.result === 'duplicate_open_request') setOutcome({ kind: 'duplicate' });
          else setOutcome({ kind: 'received' });
          window.scrollTo({
            top: document.getElementById('request-form')?.offsetTop ?? 0,
            behavior: 'smooth',
          });
        } catch (err) {
          submission.handleError(err);
          setCaptchaReset((n) => n + 1);
        }
      },
      () => submission.markAttempt(),
    )(event);

  if (outcome) {
    return (
      <SuccessPanel
        outcome={outcome}
        onReset={() => {
          reset();
          resetMeta();
          setOutcome(null);
        }}
      />
    );
  }

  const errorList = summariseErrors(formState.errors);

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="relative flex flex-col gap-10"
      aria-describedby="form-privacy-note"
    >
      <Honeypot inputRef={honeypot} />
      <FormErrorSummary errors={errorList} attempt={submission.attempt} />
      {submission.serverError && !submission.serverError.fields && (
        <Alert tone="danger" live="assertive" title="Your request was not sent">
          {submission.serverError.message}
        </Alert>
      )}

      <fieldset className="flex flex-col gap-6">
        <legend className="mb-2 font-display text-xl font-semibold">
          1. What kind of help is needed?
        </legend>
        <Controller
          control={control}
          name="category"
          render={({ field, fieldState }) => (
            <ChoiceGroup
              legend="Type of help"
              type="radio"
              name="category"
              required
              columns={2}
              options={optionsFrom(ASSISTANCE_CATEGORY_LABELS, ASSISTANCE_CATEGORY_HINTS)}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              error={fieldState.error?.message}
              id="f-category"
            />
          )}
        />
        <Controller
          control={control}
          name="urgency"
          render={({ field }) => (
            <ChoiceGroup
              legend="How soon is help needed?"
              type="radio"
              name="urgency"
              columns={2}
              options={optionsFrom(URGENCY_LABELS)}
              value={field.value}
              onChange={(v) => field.onChange(v)}
            />
          )}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-6">
        <legend className="mb-2 font-display text-xl font-semibold">2. Who needs help?</legend>
        <Controller
          control={control}
          name="relationship"
          render={({ field }) => (
            <ChoiceGroup
              legend="Who are you asking for?"
              type="radio"
              name="relationship"
              columns={3}
              options={optionsFrom(RELATIONSHIP_LABELS)}
              value={field.value}
              onChange={(v) => field.onChange(v)}
            />
          )}
        />
        <Field
          id="f-applicant_name"
          label="Name of the person who needs help"
          required
          error={formState.errors.applicant_name?.message}
        >
          <Input autoComplete="name" {...register('applicant_name')} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-6">
        <legend className="mb-2 font-display text-xl font-semibold">
          3. How can we reach you?
        </legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            id="f-phone"
            label="Phone number"
            required
            hint="We will call or message this number about the request."
            error={formState.errors.phone?.message}
          >
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              {...register('phone')}
            />
          </Field>
          <Field
            id="f-email"
            label="Email address"
            optionalLabel
            error={formState.errors.email?.message}
          >
            <Input type="email" autoComplete="email" {...register('email')} />
          </Field>
        </div>
        <Controller
          control={control}
          name="preferred_contact"
          render={({ field }) => (
            <ChoiceGroup
              legend="How would you prefer to be contacted?"
              type="radio"
              name="preferred_contact"
              columns={2}
              options={optionsFrom(CONTACT_METHOD_LABELS)}
              value={field.value}
              onChange={(v) => field.onChange(v)}
            />
          )}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-6">
        <legend className="mb-2 font-display text-xl font-semibold">4. Where are you?</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            id="f-village_id"
            label="Village"
            optionalLabel
            error={formState.errors.village_id?.message}
          >
            <VillageSelect {...register('village_id')} />
          </Field>
          <Field
            id="f-locality"
            label="Village or locality, with a landmark"
            hint="Needed if your village is not in the list."
            error={formState.errors.locality?.message}
          >
            <Input autoComplete="address-level3" {...register('locality')} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-6">
        <legend className="mb-2 font-display text-xl font-semibold">
          5. Tell us about the situation
        </legend>
        <Field
          id="f-description"
          label="What is happening and what help is needed?"
          required
          hint="Include anything that helps us understand the need. Please do not include bank or card details."
          error={formState.errors.description?.message}
        >
          <Textarea rows={7} maxLength={3000} {...register('description')} />
        </Field>
        <p className="-mt-4 text-right text-sm text-ink-600" aria-live="polite">
          {description.length} / 3000 characters
        </p>
      </fieldset>

      <div className="flex flex-col gap-5 rounded-card bg-ivory-200/60 p-6">
        <div id="f-consent">
          <Checkbox
            label="I agree that PRAYASH may use these details to review this request and to contact me about it."
            description="The details are visible only to the team members who review requests. They are never published."
            error={formState.errors.consent?.message}
            {...register('consent')}
          />
        </div>
        <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
        <p id="form-privacy-note" className="text-sm text-ink-600">
          Read our{' '}
          <Link to="/privacy" className="text-forest-700 underline underline-offset-2">
            privacy policy
          </Link>{' '}
          to learn how requests are handled.
        </p>
        <div>
          <Button
            type="submit"
            size="lg"
            loading={formState.isSubmitting}
            loadingLabel="Sending your request…"
            disabled={!isBackendConfigured}
          >
            Submit request
          </Button>
        </div>
        {!isBackendConfigured && (
          <Alert tone="warning" title="Online requests are not available yet">
            This website is not yet connected to its database. Please contact PRAYASH directly.
          </Alert>
        )}
      </div>
    </form>
  );
}

export function RequestHelpPage() {
  useDocumentTitle('Request Help');
  const { content } = useContent('request_help');
  const steps = itemsOf(content, 'steps');
  return (
    <>
      <PageHero
        eyebrow="Assistance"
        title={textOf(content, 'heading')}
        intro={textOf(content, 'intro')}
      >
        <ButtonLink
          to="/request-help/status"
          variant="light"
          iconLeft={<Search aria-hidden="true" className="size-4" />}
        >
          Check an existing request
        </ButtonLink>
      </PageHero>
      <Section tone="ivory">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <aside className="flex flex-col gap-8 lg:sticky lg:top-28 lg:self-start">
              <Reveal className="flex flex-col gap-5">
                <h2 className="font-display text-2xl font-semibold">How it works</h2>
                <ol className="flex flex-col gap-5">
                  {steps.map((step, i) => (
                    <li key={step.title} className="flex gap-4">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-forest-700 font-display font-semibold text-ivory-50">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-semibold">{step.title}</p>
                        <p className="text-[0.9375rem] text-ink-600">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Reveal>
              <Reveal className="rounded-card border border-gold-500/40 bg-gold-100/60 p-6">
                <p className="mb-3 flex items-center gap-2 font-semibold text-gold-800">
                  <Info aria-hidden="true" className="size-5" /> Important
                </p>
                <Markdown className="text-[0.9375rem] [&_li]:text-ink-800">
                  {textOf(content, 'important')}
                </Markdown>
              </Reveal>
              <a
                href="tel:112"
                className="inline-flex items-center gap-3 self-start rounded-full bg-danger-700 px-5 py-3 font-medium text-white shadow-soft hover:bg-[#931c13]"
              >
                <Phone aria-hidden="true" className="size-4" /> Emergency? Call 112
              </a>
            </aside>
            <div id="request-form" className="scroll-mt-28">
              <RequestForm />
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
