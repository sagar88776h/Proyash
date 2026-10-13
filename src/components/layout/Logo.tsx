import { Link } from 'react-router';
import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className={cn('size-9 shrink-0', className)}>
      <rect width="40" height="40" rx="11" fill="currentColor" className="text-forest-700 dark-section:text-white/10" />
      <path
        d="M20 8.5c-4.2 4.7-8.4 8.7-8.4 13.7 0 4.7 3.8 8.3 8.4 8.3s8.4-3.6 8.4-8.3c0-5-4.2-9-8.4-13.7z"
        fill="none"
        stroke="#D5AE69"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path d="M20 16.5v14" stroke="#D5AE69" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M20 23.2l3.4-3.2M20 26.8l-3.2-3" stroke="#D5AE69" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, showTagline = true }: { className?: string; showTagline?: boolean }) {
  return (
    <Link to="/" className={cn('group inline-flex items-center gap-3 rounded-md', className)} aria-label="PRAYASH — home">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.15rem] font-semibold tracking-[0.2em]">PRAYASH</span>
        {showTagline && (
          <span className="mt-1 hidden text-[0.6875rem] tracking-wide opacity-75 sm:block">Friends &amp; Well-Wishers</span>
        )}
      </span>
    </Link>
  );
}
