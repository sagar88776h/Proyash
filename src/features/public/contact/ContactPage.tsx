import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormErrorSummary } from '@/components/forms/FormErrorSummary';
import { Honeypot } from '@/components/forms/Honeypot';
import { Turnstile } from '@/components/forms/Turnstile';
import { summariseErrors, useFormSubmission } from '@/components/forms/useFormSubmission';
import { Container, Section } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { Placeholder } from '@/components/Placeholder';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { textOf } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePublicSettings } from '@/hooks/useSettings';
import { callFunction } from '@/lib/api/functions';
import { telLink, whatsappLink } from '@/lib/contact';
import { isBackendConfigured } from '@/lib/env';
import { NotConnectedNotice } from '@/components/forms/NotConnectedNotice';
import { useFormMeta } from '@/lib/submission';
import { contactSchema } from '@shared/validation.ts';

type FormInput = z.input<typeof contactSchema>;
type FormOutput = z.output<typeof contactSchema>;

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-700">
        {icon}
      </span>
      <div>
        <p className="text-sm text-ink-600">{label}</p>
        <div className="font-medium text-ink-900">{children}</div>
      </div>
    </div>
  );
}

function ContactForm() {
  const { meta, reset: resetMeta } = useFormMeta();
  const honeypot = useRef<HTMLInputElement>(null);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaReset, setCaptchaReset] = useState(0);
  const [sent, setSent] = useState(false);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(contactSchema),
    // The error summary takes focus and lists every problem, including radio groups.
    shouldFocusError: false,
    defaultValues: { name: '', email: '', phone: '', subject: '', message: '' },
    mode: 'onTouched',
  });
  const submission = useFormSubmission(form.setError);
  const { register, formState } = form;

  if (sent) {
    return (
      <div role="status" className="flex flex-col gap-4 rounded-panel bg-ivory-50 p-8 shadow-soft">
        <CheckCircle2 aria-hidden="true" className="size-10 text-success-700" strokeWidth={1.5} />
        <h2 className="font-display text-2xl font-semibold">Thank you for your message</h2>
        <p className="text-ink-700">A member of the PRAYASH team will reply as soon as possible.</p>
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              form.reset();
              resetMeta();
              setSent(false);
            }}
          >
            Send another message
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="relative flex flex-col gap-6 rounded-panel bg-ivory-50 p-6 shadow-soft sm:p-10"
      onSubmit={(event) =>
        void form.handleSubmit(
          async (values) => {
            submission.clearServerError();
            try {
              await callFunction('public-api', '/contact', {
                body: {
                  ...values,
                  ...meta,
                  website: honeypot.current?.value ?? '',
                  captcha_token: captchaToken,
                },
              });
              setSent(true);
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
      <h2 className="font-display text-2xl font-semibold">Send us a message</h2>
      <FormErrorSummary errors={summariseErrors(formState.errors)} attempt={submission.attempt} />
      {submission.serverError && !submission.serverError.fields && (
        <Alert tone="danger" live="assertive">
          {submission.serverError.message}
        </Alert>
      )}
      <Field id="f-name" label="Your name" required error={formState.errors.name?.message}>
        <Input autoComplete="name" {...register('name')} />
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          id="f-email"
          label="Email address"
          hint="Email or phone, so we can reply."
          error={formState.errors.email?.message}
        >
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field id="f-phone" label="Phone number" error={formState.errors.phone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="tel" {...register('phone')} />
        </Field>
      </div>
      <Field id="f-subject" label="Subject" required error={formState.errors.subject?.message}>
        <Input maxLength={150} {...register('subject')} />
      </Field>
      <Field
        id="f-message"
        label="Message"
        required
        hint="To ask for assistance, please use the Request Help form instead."
        error={formState.errors.message?.message}
      >
        <Textarea rows={6} maxLength={4000} {...register('message')} />
      </Field>
      <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
      <div>
        <Button
          type="submit"
          size="lg"
          loading={formState.isSubmitting}
          loadingLabel="Sending…"
          disabled={!isBackendConfigured}
        >
          Send message
        </Button>
      </div>
      <NotConnectedNotice title="Online messages are not available yet" />
    </form>
  );
}

export function ContactPage() {
  useDocumentTitle('Contact Us');
  const { content } = useContent('contact');
  const { settings } = usePublicSettings();
  const c = settings.contact;
  const wa = whatsappLink(c.whatsapp);
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={textOf(content, 'heading')}
        intro={textOf(content, 'intro')}
        size="compact"
      />
      <Section tone="ivory">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
            <div className="flex flex-col gap-7">
              <h2 className="font-display text-2xl font-semibold">Official contact details</h2>
              {c.phone ? (
                <DetailRow icon={<Phone aria-hidden="true" className="size-5" />} label="Phone">
                  <a
                    href={telLink(c.phone) ?? undefined}
                    className="hover:text-forest-700 hover:underline"
                  >
                    {c.phone}
                  </a>
                </DetailRow>
              ) : (
                <Placeholder label="Official phone number" compact />
              )}
              {wa && (
                <DetailRow
                  icon={<MessageCircle aria-hidden="true" className="size-5" />}
                  label="WhatsApp"
                >
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-forest-700 hover:underline"
                  >
                    {c.whatsapp}
                  </a>
                </DetailRow>
              )}
              {c.email ? (
                <DetailRow icon={<Mail aria-hidden="true" className="size-5" />} label="Email">
                  <a
                    href={`mailto:${c.email}`}
                    className="break-all hover:text-forest-700 hover:underline"
                  >
                    {c.email}
                  </a>
                </DetailRow>
              ) : (
                <Placeholder label="Official email address" compact />
              )}
              {c.address ? (
                <DetailRow icon={<MapPin aria-hidden="true" className="size-5" />} label="Address">
                  <span className="whitespace-pre-line">{c.address}</span>
                  {c.map_url && (
                    <a
                      href={c.map_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block text-sm text-forest-700 underline underline-offset-2"
                    >
                      Open in maps
                    </a>
                  )}
                </DetailRow>
              ) : (
                <Placeholder label="Postal address" compact />
              )}
              {c.hours && (
                <DetailRow
                  icon={<Clock aria-hidden="true" className="size-5" />}
                  label="When to reach us"
                >
                  {c.hours}
                </DetailRow>
              )}
              <Alert tone="info" title="Need assistance?">
                Requests for help are handled privately through the Request Help form, so they reach
                the right reviewers.
              </Alert>
            </div>
            <ContactForm />
          </div>
        </Container>
      </Section>
    </>
  );
}
