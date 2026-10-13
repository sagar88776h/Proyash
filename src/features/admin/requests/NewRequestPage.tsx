import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { FormErrorSummary } from '@/components/forms/FormErrorSummary';
import { summariseErrors, useFormSubmission } from '@/components/forms/useFormSubmission';
import { VillageSelect } from '@/components/forms/VillageSelect';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Checkbox, ChoiceGroup, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { unwrap } from '@/lib/errors';
import {
  ASSISTANCE_CATEGORY_LABELS,
  CONTACT_METHOD_LABELS,
  optionsFrom,
  RELATIONSHIP_LABELS,
  URGENCY_LABELS,
} from '@/lib/labels';
import { assistanceRequestSchema } from '@shared/validation.ts';
import { db } from '../components/db';
import { Card, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';

// Same rules as the public form; consent wording differs for staff entry.
const staffSchema = assistanceRequestSchema;
type Input = z.input<typeof staffSchema>;
type Output = z.output<typeof staffSchema>;

export function NewRequestPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(staffSchema),
    // The error summary takes focus and lists every problem, including radio groups.
    shouldFocusError: false,
    defaultValues: {
      urgency: 'standard',
      relationship: 'self',
      preferred_contact: 'phone_call',
      applicant_name: '',
      phone: '',
      email: '',
      village_id: '',
      locality: '',
      description: '',
      consent: false as unknown as true,
    },
  });
  const submission = useFormSubmission(form.setError);
  const { register, control, formState } = form;

  return (
    <>
      <PageHeader
        title="Record a request"
        description="For requests received by phone or in person. The applicant must agree to their information being recorded."
        back={{ to: '/admin/requests', label: 'All requests' }}
      />
      <Card>
        <form
          noValidate
          className="flex flex-col gap-8"
          onSubmit={(event) =>
            void form.handleSubmit(
              async (v) => {
                submission.clearServerError();
                setDuplicate(null);
                try {
                  const res = unwrap(
                    await db().rpc('assistance_create_staff_entry', {
                      p_category: v.category,
                      p_urgency: v.urgency,
                      p_applicant_name: v.applicant_name,
                      p_phone: v.phone,
                      p_email: v.email || null,
                      p_village_id: v.village_id,
                      p_locality: v.locality || null,
                      p_description: v.description,
                      p_relationship: v.relationship,
                      p_preferred_contact: v.preferred_contact,
                      p_consent_confirmed: v.consent,
                    }),
                  ) as { result: string; id?: string; reference_code?: string; existing_reference?: string };
                  if (res.result === 'duplicate_open_request') {
                    setDuplicate(res.existing_reference ?? '');
                    return;
                  }
                  toast.success(`Request ${res.reference_code} recorded.`);
                  navigate(`/admin/requests/${res.id}`, { replace: true });
                } catch (err) {
                  submission.handleError(err);
                }
              },
              () => submission.markAttempt(),
            )(event)
          }
        >
          <FormErrorSummary errors={summariseErrors(formState.errors)} attempt={submission.attempt} />
          {submission.serverError && !submission.serverError.fields && <Alert tone="danger">{submission.serverError.message}</Alert>}
          {duplicate !== null && (
            <Alert tone="warning" title="An open request already exists">
              This phone number already has an open request of this type{duplicate ? ` (${duplicate})` : ''}. Update that request instead.{' '}
              <Link to="/admin/requests" className="underline">Search requests</Link>
            </Alert>
          )}
          <Controller
            control={control}
            name="category"
            render={({ field, fieldState }) => (
              <ChoiceGroup id="f-category" legend="Type of help" type="radio" name="category" required columns={3}
                options={optionsFrom(ASSISTANCE_CATEGORY_LABELS)} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="urgency"
            render={({ field }) => (
              <ChoiceGroup legend="Urgency" type="radio" name="urgency" columns={2} options={optionsFrom(URGENCY_LABELS)} value={field.value} onChange={field.onChange} />
            )}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="f-applicant_name" label="Name of the person who needs help" required error={formState.errors.applicant_name?.message}>
              <Input {...register('applicant_name')} />
            </Field>
            <Field id="f-relationship" label="Who made the request">
              <Select {...register('relationship')}>
                {optionsFrom(RELATIONSHIP_LABELS).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field id="f-phone" label="Phone number" required error={formState.errors.phone?.message}>
              <Input type="tel" {...register('phone')} />
            </Field>
            <Field id="f-email" label="Email" optionalLabel error={formState.errors.email?.message}>
              <Input type="email" {...register('email')} />
            </Field>
            <Field id="f-preferred_contact" label="Preferred contact">
              <Select {...register('preferred_contact')}>
                {optionsFrom(CONTACT_METHOD_LABELS).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field id="f-village_id" label="Village" optionalLabel>
              <VillageSelect {...register('village_id')} />
            </Field>
            <Field id="f-locality" label="Locality / landmark" error={formState.errors.locality?.message}>
              <Input {...register('locality')} />
            </Field>
          </div>
          <Field id="f-description" label="Situation and help needed" required error={formState.errors.description?.message}>
            <Textarea rows={6} maxLength={3000} {...register('description')} />
          </Field>
          <div id="f-consent">
            <Checkbox
              label="The applicant agreed to PRAYASH recording these details to review their request."
              error={formState.errors.consent?.message}
              {...register('consent')}
            />
          </div>
          <div>
            <Button type="submit" loading={formState.isSubmitting}>Record request</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
