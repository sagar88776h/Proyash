import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { LogoMark } from '@/components/layout/Logo';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchPublicSettings } from '@/lib/api/public';
import { errorMessage } from '@/lib/errors';
import { amountInWordsINR, formatDate, formatINR } from '@/lib/format';
import { ENTRY_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/labels';
import { entryLabel, getEntry } from '../api/finance';

/** Printable acknowledgement for a verified contribution. Makes no tax-exemption claim. */
export function ReceiptPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['admin', 'finance', 'entry', id], queryFn: () => getEntry(id) });
  const settings = useQuery({ queryKey: ['public-settings'], queryFn: fetchPublicSettings });
  useDocumentTitle('Receipt');
  if (query.isLoading) return <LoadingBlock />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} />;
  const data = query.data;
  if (!data || !data.donation?.receipt_number || data.entry.status !== 'verified') {
    return <EmptyState title="No receipt available" description="Receipts are issued when a contribution is verified." />;
  }
  const { entry, donation } = data;
  const org = settings.data?.organisation;
  const contact = settings.data?.contact;
  const reversed = data.reversals.some((r) => r.status === 'verified');
  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-6 flex justify-end">
        <Button onClick={() => window.print()} iconLeft={<Printer aria-hidden="true" className="size-4" />}>Print or save as PDF</Button>
      </div>
      <article className="rounded-card bg-white p-10 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.12)] print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-ink-200 pb-6">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <p className="font-display text-xl font-semibold tracking-[0.18em]">PRAYASH</p>
              <p className="text-sm text-ink-600">{org?.legal_name ?? 'A Group of Friends & Well-Wishers'}</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">Receipt {donation.receipt_number}</p>
            <p className="text-ink-600">Issued {formatDate(donation.receipt_issued_at)}</p>
          </div>
        </header>
        {reversed && <p className="mt-6 rounded-md bg-danger-50 p-3 text-sm font-semibold text-danger-700">This entry has since been reversed. This receipt is no longer valid.</p>}
        <dl className="mt-8 grid grid-cols-[10rem_1fr] gap-y-3 text-[0.9375rem]">
          <dt className="text-ink-600">Received from</dt>
          <dd className="font-medium">{donation.is_anonymous ? 'Anonymous donor' : donation.donor_name}</dd>
          <dt className="text-ink-600">Amount</dt>
          <dd className="font-medium">{formatINR(entry.amount)}</dd>
          <dt className="text-ink-600">In words</dt>
          <dd>{amountInWordsINR(Number(entry.amount))}</dd>
          <dt className="text-ink-600">Date received</dt>
          <dd>{formatDate(entry.entry_date)}</dd>
          <dt className="text-ink-600">Type</dt>
          <dd>{ENTRY_TYPE_LABELS[entry.entry_type]}</dd>
          <dt className="text-ink-600">Payment</dt>
          <dd>{entry.payment_method ? PAYMENT_METHOD_LABELS[entry.payment_method] : '—'}{entry.transaction_reference ? ` · ref. ${entry.transaction_reference}` : ''}</dd>
          <dt className="text-ink-600">Ledger entry</dt>
          <dd className="font-mono text-sm">{entryLabel(entry.entry_no)}</dd>
        </dl>
        <p className="mt-10 text-sm text-ink-700">
          Thank you for supporting PRAYASH. This acknowledges that the contribution above was received and verified against the organisation’s records.
          {org?.registration_details ? ` ${org.registration_details}` : ''}
        </p>
        <footer className="mt-10 border-t border-ink-200 pt-4 text-xs text-ink-600">
          {[contact?.address, contact?.phone, contact?.email].filter(Boolean).join(' · ') || 'PRAYASH'}
        </footer>
      </article>
    </div>
  );
}
