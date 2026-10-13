import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

type FieldContextValue = {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

function useFieldContext() {
  return useContext(FieldContext);
}

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optionalLabel?: boolean;
  className?: string;
  children: ReactNode;
  /** Visually hide the label (it stays available to assistive technology). */
  hideLabel?: boolean;
  id?: string;
};

/**
 * Labelled form field. Wires id, aria-describedby and aria-invalid into the
 * nested control so every input has an accessible name, hint and error.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  optionalLabel = false,
  className,
  children,
  hideLabel = false,
  id: idProp,
}: FieldProps) {
  const generated = useId();
  const id = idProp ?? `f${generated.replace(/:/g, '')}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className={cn('text-sm font-medium text-ink-900', hideLabel && 'sr-only')}>
          {label}
          {required && (
            <span className="text-danger-700" aria-hidden="true">
              {' '}
              *
            </span>
          )}
          {optionalLabel && !required && <span className="font-normal text-ink-600"> (optional)</span>}
        </label>
        {hint && (
          <p id={hintId} className="text-sm text-ink-600">
            {hint}
          </p>
        )}
        {children}
        {error && (
          <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger-700">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0" fill="currentColor">
              <path d="M10 1.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4Zm.9 12.1H9.1v-1.8h1.8v1.8Zm0-3.4H9.1V5.6h1.8v4.9Z" />
            </svg>
            <span>{error}</span>
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

const controlBase =
  'w-full rounded-sm border border-ink-450 bg-white px-3.5 text-[0.9375rem] text-ink-900 ' +
  'placeholder:text-ink-500 transition-[border-color,box-shadow] duration-200 ' +
  'hover:border-ink-700 focus:border-forest-700 focus:outline-none focus-visible:outline-none ' +
  'focus:shadow-[0_0_0_3px_rgb(23_75_53/0.22)] ' +
  'aria-invalid:border-danger-700 aria-invalid:focus:shadow-[0_0_0_3px_rgb(180_35_24/0.2)] ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500';

function useControlProps(props: { id?: string; 'aria-describedby'?: string; required?: boolean }) {
  const field = useFieldContext();
  return {
    id: props.id ?? field?.id,
    'aria-describedby': [field?.describedBy, props['aria-describedby']].filter(Boolean).join(' ') || undefined,
    'aria-invalid': field?.invalid || undefined,
    'aria-required': (props.required ?? field?.required) || undefined,
  };
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export function Input({ className, ...props }: InputProps) {
  const a11y = useControlProps(props);
  return <input {...props} {...a11y} className={cn(controlBase, 'h-11', className)} />;
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function Textarea({ className, rows = 5, ...props }: TextareaProps) {
  const a11y = useControlProps(props);
  return <textarea rows={rows} {...props} {...a11y} className={cn(controlBase, 'py-2.5 leading-relaxed', className)} />;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

export function Select({ className, children, ...props }: SelectProps) {
  const a11y = useControlProps(props);
  return (
    <div className="relative">
      <select {...props} {...a11y} className={cn(controlBase, 'h-11 appearance-none pr-10', className)}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-600"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  description?: ReactNode;
  error?: string;
  ref?: Ref<HTMLInputElement>;
};

/** Stand-alone checkbox with its own label (used for consents and options). */
export function Checkbox({ label, description, error, className, id: idProp, ...props }: CheckboxProps) {
  const generated = useId();
  const id = idProp ?? `c${generated.replace(/:/g, '')}`;
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={id}
          aria-describedby={[descId, errId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-xs border-ink-450 accent-forest-700"
          {...props}
        />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={id} className="cursor-pointer text-[0.9375rem] leading-snug text-ink-900">
            {label}
          </label>
          {description && (
            <p id={descId} className="text-sm text-ink-600">
              {description}
            </p>
          )}
        </div>
      </div>
      {error && (
        <p id={errId} className="pl-8 text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

type ChoiceOption = { value: string; label: ReactNode; description?: ReactNode };

type ChoiceGroupProps = {
  legend: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  options: readonly ChoiceOption[];
  type: 'radio' | 'checkbox';
  name: string;
  /** For radio: string; for checkbox: string[] */
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
  columns?: 1 | 2 | 3;
  className?: string;
  id?: string;
};

/** Fieldset of radio buttons or checkboxes rendered as selectable cards. */
export function ChoiceGroup({
  legend,
  hint,
  error,
  required,
  options,
  type,
  name,
  value,
  onChange,
  columns = 2,
  className,
  id,
}: ChoiceGroupProps) {
  const generated = useId();
  const base = `g${generated.replace(/:/g, '')}`;
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);

  const toggle = (optionValue: string) => {
    if (type === 'radio') {
      onChange(optionValue);
      return;
    }
    const next = new Set(selected);
    if (next.has(optionValue)) next.delete(optionValue);
    else next.add(optionValue);
    onChange(options.map((o) => o.value).filter((v) => next.has(v)));
  };

  return (
    <fieldset
      id={id}
      className={cn('flex scroll-mt-32 flex-col gap-2', className)}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-1 text-sm font-medium text-ink-900">
        {legend}
        {required && (
          <span className="text-danger-700" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </legend>
      {hint && (
        <p id={hintId} className="-mt-1 mb-1 text-sm text-ink-600">
          {hint}
        </p>
      )}
      <div
        className={cn(
          'grid gap-2',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {options.map((option) => {
          const id = `${base}-${option.value}`;
          const checked = selected.has(option.value);
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border bg-white px-4 py-3 transition-colors duration-200',
                checked ? 'border-forest-700 bg-forest-50 shadow-[inset_0_0_0_1px_var(--color-forest-700)]' : 'border-ink-200 hover:border-ink-450',
              )}
            >
              <input
                id={id}
                type={type}
                name={name}
                value={option.value}
                checked={checked}
                required={type === 'radio' ? required : undefined}
                onChange={() => toggle(option.value)}
                className="mt-0.5 size-4.5 shrink-0 cursor-pointer accent-forest-700"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[0.9375rem] leading-snug text-ink-900">{option.label}</span>
                {option.description && <span className="text-sm text-ink-600">{option.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
