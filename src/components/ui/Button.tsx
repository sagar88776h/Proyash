import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger' | 'light';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none ' +
  'rounded-full transition-[background-color,color,box-shadow,transform] duration-300 ease-out-expo ' +
  'disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 ' +
  'active:translate-y-px';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-forest-700 text-ivory-50 hover:bg-forest-800 shadow-soft',
  gold: 'bg-gold-400 text-ink-900 hover:bg-gold-300 shadow-soft',
  secondary:
    'bg-transparent text-forest-700 shadow-[inset_0_0_0_1.5px_var(--color-forest-700)] hover:bg-forest-700 hover:text-ivory-50',
  ghost: 'bg-transparent text-ink-800 hover:bg-ink-900/5',
  danger: 'bg-danger-700 text-white hover:bg-[#931c13] shadow-soft',
  light:
    'bg-transparent text-ivory-50 shadow-[inset_0_0_0_1.5px_rgb(247_245_238/0.6)] hover:bg-ivory-50 hover:text-forest-800',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-[0.9375rem]',
  lg: 'h-13 px-8 text-base',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  iconLeft,
  iconRight,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" label={loadingLabel ?? 'Working'} /> : iconLeft}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
      {!loading && iconRight}
    </button>
  );
}

type ButtonLinkProps = LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
};

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, typeof className === 'string' ? className : undefined)} {...rest}>
      {iconLeft}
      <span>{children as ReactNode}</span>
      {iconRight}
    </Link>
  );
}
