import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { FormErrorSummary } from '@/components/forms/FormErrorSummary';
import { Honeypot } from '@/components/forms/Honeypot';
import { Turnstile } from '@/components/forms/Turnstile';
import { summariseErrors, useFormSubmission } from '@/components/forms/useFormSubmission';
import { VillageSelect } from '@/components/forms/VillageSelect';
import { Container, Section } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { Markdown } from '@/components/Markdown';
import { Reveal } from '@/components/motion/Reveal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Checkbox, ChoiceGroup, Field, Input, Textarea } from '@/components/ui/Field';
import { itemsOf, textOf } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { callFunction } from '@/lib/api/functions';
import { isBackendConfigured } from '@/lib/env';
import { NotConnectedNotice } from '@/components/forms/NotConnectedNotice';
import {
  ACTIVITY_CATEGORY_LABELS,
  AVAILABILITY_LABELS,
  optionsFrom,
  SKILL_LABELS,
} from '@/lib/labels';
import { useFormMeta } from '@/lib/submission';
import { volunteerSchema } from '@shared/validation.ts';

type FormInput = z.input<typeof volunteerSchema>;
type FormOutput = z.output<typeof volunteerSchema>;

function VolunteerForm() {
  const { meta, reset: resetMeta } = useFormMeta();
  const honeypot = useRef<HTMLInputElement>(null);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaReset, setCaptchaReset] = useState(0);
  const [result, setResult] = useState<'created' | 'already_registered' | 'received' | null>(null);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(volunteerSchema),
    // The error summary takes focus and lists every problem, including radio groups.
    shouldFocusError: false,
    defaultValues: {
      full_name: '',
      phone: '',
      email: '',
      village_id: '',
      locality: '',
      is_adult: undefined as unknown as boolean,
      guardian_name: '',
      guardian_phone: '',
      skills: [],
      skills_other: '',
      availability: [],
      preferred_activities: [],
      languages: '',
      motivation: '',
      consent_contact: false as unknown as true,
      consent_public_recognition: false,
    },
    mode: 'onTouched',
  });
  const { register, control, formState } = form;
  const submission = useFormSubmission(form.setError);
  const isAdult = useWatch({ control, name: 'is_adult' });
  const skills = useWatch({ control, name: 'skills' }) ?? [];

  if (result) {
    return (
      <div
        role="status"
        className="flex flex-col gap-4 rounded-bento bg-mint-50 p-8 shadow-soft sm:p-10"
      >
        <CheckCircle2 aria-hidden="true" className="size-10 text-success-700" strokeWidth={1.5} />
        <h2 className="font-display text-2xl font-semibold">
          {result === 'already_registered'
            ? 'You are already registered'
            : 'Thank you for volunteering'}
        </h2>
        <p className="text-ink-700">
          {result === 'already_registered'
            ? 'We already have a volunteer registration with this phone number. A coordinator will be in touch; you do not need to register again.'
            : 'A volunteer coordinator will review your registration and contact you. Your details are kept private.'}
        </p>
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              form.reset();
              resetMeta();
              setResult(null);
            }}
          >
            Register someone else
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="relative flex flex-col gap-10"
      onSubmit={(event) =>
        void form.handleSubmit(
          async (values) => {
            submission.clearServerError();
            try {
              const res = await callFunction<{
                result: 'created' | 'already_registered' | 'received';
              }>('public-api', '/volunteer', {
                body: {
                  ...values,
                  village_id: values.village_id ?? '',
                  ...meta,
                  website: honeypot.current?.value ?? '',
                  captcha_token: captchaToken,
                },
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
        <Alert tone="danger" live="assertive" title="Your registration was not sent">
          {submission.serverError.message}
        </Alert>
      )}

      <fieldset className="flex flex-col gap-6">
        <legend className="mb-2 font-display text-xl font-semibold">About you</legend>
        <Field
          id="f-full_name"
          label="Full name"
          required
          error={formState.errors.full_name?.message}
        >
          <Input autoComplete="name" {...register('full_name')} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="f-phone" label="Phone number" required error={formState.errors.phone?.message}>
            <Input type="tel" inputMode="tel" autoComplete="tel" {...register('phone')} />
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
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="f-village_id" label="Village" optionalLabel>
            <VillageSelect {...register('village_id')} />
          </Field>
          <Field
            id="f-locality"
            label="Village or locality"
            hint="Needed if your village is not in the list."
            error={formState.errors.locality?.message}
          >
            <Input {...register('locality')} />
          </Field>
        </div>
        <Controller
          control={control}
          name="is_adult"
          render={({ field, fieldState }) => (
            <ChoiceGroup
              id="f-is_adult"
              legend="Are you 18 or older?"
              type="radio"
              name="is_adult"
              required
              columns={2}
              options={[
                { value: 'yes', label: 'Yes, I am 18 or older' },
                { value: 'no', label: 'No, I am under 18' },
              ]}
              value={field.value === undefined ? undefined : field.value ? 'yes' : 'no'}
              onChange={(v) => field.onChange(v === 'yes')}
              error={fieldState.error?.message}
            />
          )}
        />
        {isAdult === false && (
          <div className="grid gap-6 rounded-3xl bg-mint-50 p-5 sm:grid-cols-2">
            <p className="text-sm text-ink-700 sm:col-span-2">
              Volunteers under 18 need permission from a parent or guardian. We will contact them
              too.
            </p>
            <Field
              id="f-guardian_name"
              label="Parent or guardian’s name"
              required
              error={formState.errors.guardian_name?.message}
            >
              <Input {...register('guardian_name')} />
            </Field>
            <Field
              id="f-guardian_phone"
              label="Parent or guardian’s phone"
              required
              error={formState.errors.guardian_phone?.message}
            >
              <Input type="tel" inputMode="tel" {...register('guardian_phone')} />
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-6">
        <legend className="mb-2 font-display text-xl font-semibold">How you can help</legend>
        <Controller
          control={control}
          name="skills"
          render={({ field }) => (
            <ChoiceGroup
              legend="Skills you can offer"
              hint="Choose any that apply."
              type="checkbox"
              name="skills"
              columns={3}
              options={optionsFrom(SKILL_LABELS)}
              value={field.value}
              onChange={(v) => field.onChange(v)}
            />
          )}
        />
        {skills.includes('other') && (
          <Field
            id="f-skills_other"
            label="Other skills"
            error={formState.errors.skills_other?.message}
          >
            <Input maxLength={200} {...register('skills_other')} />
          </Field>
        )}
        <Controller
          control={control}
          name="availability"
          render={({ field, fieldState }) => (
            <ChoiceGroup
              id="f-availability"
              legend="When are you available?"
              type="checkbox"
              name="availability"
              required
              columns={3}
              options={optionsFrom(AVAILABILITY_LABELS)}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="preferred_activities"
          render={({ field }) => (
            <ChoiceGroup
              legend="Activities you are most interested in"
              type="checkbox"
              name="preferred_activities"
              columns={3}
              options={optionsFrom(ACTIVITY_CATEGORY_LABELS)}
              value={field.value}
              onChange={(v) => field.onChange(v)}
            />
          )}
        />
        <Field id="f-languages" label="Languages you speak" optionalLabel>
          <Input maxLength={200} {...register('languages')} />
        </Field>
        <Field
          id="f-motivation"
          label="Anything you would like us to know?"
          optionalLabel
          error={formState.errors.motivation?.message}
        >
          <Textarea rows={4} maxLength={1000} {...register('motivation')} />
        </Field>
      </fieldset>

      <div className="flex flex-col gap-5 rounded-3xl bg-mint-50 p-6">
        <div id="f-consent_contact">
          <Checkbox
            label="I agree that PRAYASH volunteer coordinators may contact me about volunteering."
            description="Your details are seen only by coordinators and administrators."
            error={formState.errors.consent_contact?.message}
            {...register('consent_contact')}
          />
        </div>
        <Checkbox
          label="PRAYASH may mention my name publicly as a volunteer"
          description="Optional. Leave unticked and your name will never be published."
          {...register('consent_public_recognition')}
        />
        <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
        <p className="text-sm text-ink-600">
          See our{' '}
          <Link to="/privacy" className="text-forest-700 underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
        <div>
          <Button
            type="submit"
            size="lg"
            loading={formState.isSubmitting}
            loadingLabel="Sending…"
            disabled={!isBackendConfigured}
          >
            Register as a volunteer
          </Button>
        </div>
        <NotConnectedNotice title="Online volunteer registration is not available yet" />
      </div>
    </form>
  );
}

export function VolunteerPage() {
  useDocumentTitle('Become a Volunteer');
  const { content } = useContent('volunteer');
  const ways = itemsOf(content, 'ways');
  return (
    <>
      <PageHero
        eyebrow="Get involved"
        title={textOf(content, 'heading')}
        intro={textOf(content, 'intro')}
      />
      <Section tone="ivory">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <aside className="flex flex-col gap-8 lg:sticky lg:top-28 lg:self-start">
              <Reveal className="flex flex-col gap-4">
                <h2 className="font-display text-2xl font-semibold">Ways to help</h2>
                <ul className="flex flex-col gap-4">
                  {ways.map((w) => (
                    <li key={w.title} className="border-l-2 border-gold-400 pl-4">
                      <p className="font-semibold">{w.title}</p>
                      <p className="text-[0.9375rem] text-ink-600">{w.body}</p>
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal className="rounded-3xl bg-forest-50 p-6">
                <h3 className="mb-2 font-display text-lg font-semibold">What to expect</h3>
                <Markdown className="text-[0.9375rem]">
                  {textOf(content, 'what_to_expect')}
                </Markdown>
              </Reveal>
            </aside>
            <VolunteerForm />
          </div>
        </Container>
      </Section>
    </>
  );
}
