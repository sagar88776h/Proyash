import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { toAppError, type AppError } from '@/lib/errors';
import { todayISO } from '@/lib/format';
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import { entryLabel, listAccounts, recordDonation, recordExpense, recordOther, recordTransfer } from '../api/finance';
import { listProjects } from '../api/programmes';
import { Card, PageHeader } from '../components/PageHeader';
import { Tabs } from '../components/Tabs';
import { useToast } from '../components/useToast';

type Kind = 'donation' | 'expense' | 'transfer' | 'other';

function parseAmount(value: string): number | null {
  const v = value.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

function useOptions() {
  const accounts = useQuery({ queryKey: ['admin', 'finance', 'accounts'], queryFn: listAccounts });
  const projects = useQuery({ queryKey: ['admin', 'projects', 'options'], queryFn: () => listProjects({ page: 1, pageSize: 200 }) });
  return { accounts: (accounts.data ?? []).filter((a) => a.is_active), projects: projects.data?.rows ?? [] };
}

/** Runs a record call; on a possible-duplicate warning asks for explicit confirmation. */
function useRecorder() {
  const [error, setError] = useState<AppError | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function run(fn: (allowDuplicate: boolean) => Promise<string>, onDone: (id: string) => void) {
    setBusy(true);
    setError(null);
    try {
      const id = await fn(confirmed);
      setDuplicateWarning(null);
      setConfirmed(false);
      onDone(id);
    } catch (err) {
      const e = toAppError(err);
      if (e.code === 'possible_duplicate') {
        setDuplicateWarning(e.message);
        setConfirmed(false);
      } else setError(e);
    } finally {
      setBusy(false);
    }
  }
  const banner: ReactNode = (
    <>
      {error && <Alert tone="danger" live="assertive">{error.message}</Alert>}
      {duplicateWarning && (
        <Alert tone="warning" title="Possible duplicate" live="assertive">
          <p>{duplicateWarning}</p>
          <div className="mt-3">
            <Checkbox label="I have checked the ledger and this is a separate transaction" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          </div>
        </Alert>
      )}
    </>
  );
  return { run, busy, banner, blocked: Boolean(duplicateWarning) && !confirmed };
}

function CommonFields({
  date, setDate, amount, setAmount, children,
}: { date: string; setDate: (v: string) => void; amount: string; setAmount: (v: string) => void; children?: ReactNode }) {
  return (
    <>
      <Field id="e-date" label="Transaction date" required hint="The date on the bank statement, bill or receipt.">
        <Input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field id="e-amount" label="Amount (₹)" required>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </Field>
      {children}
    </>
  );
}

function DonationForm({ replaces, onDone }: { replaces: string | null; onDone: (id: string) => void }) {
  const { accounts, projects } = useOptions();
  const r = useRecorder();
  const [v, setV] = useState({
    entry_type: 'member_contribution' as 'member_contribution' | 'public_donation',
    entry_date: todayISO(), amount: '', account_id: '', payment_method: 'upi' as Enums<'payment_method'>,
    transaction_reference: '', description: '', project_id: '', donor_name: '', donor_phone: '', donor_email: '',
    is_anonymous: false, acknowledge_publicly: false,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = parseAmount(v.amount);
        if (!amount) return;
        void r.run(
          (allow) => recordDonation({ ...v, amount, project_id: v.project_id || null, description: v.description || (v.entry_type === 'member_contribution' ? 'Member contribution' : 'Donation') }, allow, replaces),
          onDone,
        );
      }}
    >
      <div className="sm:col-span-2">{r.banner}</div>
      <Field id="d-type" label="Type" required>
        <Select value={v.entry_type} onChange={(e) => set('entry_type', e.target.value as typeof v.entry_type)}>
          <option value="member_contribution">Member contribution</option>
          <option value="public_donation">Public donation</option>
        </Select>
      </Field>
      <Field id="d-account" label="Received into account" required>
        <Select value={v.account_id} onChange={(e) => set('account_id', e.target.value)}>
          <option value="">Choose…</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <CommonFields date={v.entry_date} setDate={(x) => set('entry_date', x)} amount={v.amount} setAmount={(x) => set('amount', x)} />
      <Field id="d-method" label="Payment method" required>
        <Select value={v.payment_method} onChange={(e) => set('payment_method', e.target.value as Enums<'payment_method'>)}>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field id="d-ref" label="Payment reference" hint="UTR, UPI reference or cheque number. Used to prevent duplicates." optionalLabel>
        <Input value={v.transaction_reference} maxLength={120} onChange={(e) => set('transaction_reference', e.target.value)} />
      </Field>
      {v.entry_type === 'public_donation' && (
        <div className="sm:col-span-2"><Checkbox label="Anonymous donor" checked={v.is_anonymous} onChange={(e) => set('is_anonymous', e.target.checked)} /></div>
      )}
      {!v.is_anonymous && (
        <Field id="d-name" label={v.entry_type === 'member_contribution' ? 'Member name' : 'Donor name'} required>
          <Input value={v.donor_name} maxLength={120} onChange={(e) => set('donor_name', e.target.value)} />
        </Field>
      )}
      <Field id="d-phone" label="Phone" optionalLabel><Input type="tel" value={v.donor_phone} onChange={(e) => set('donor_phone', e.target.value)} /></Field>
      <Field id="d-email" label="Email" optionalLabel><Input type="email" value={v.donor_email} onChange={(e) => set('donor_email', e.target.value)} /></Field>
      <Field id="d-project" label="Restricted to project" optionalLabel hint="Only if the donor asked for the money to go to one project.">
        <Select value={v.project_id} onChange={(e) => set('project_id', e.target.value)}>
          <option value="">General funds</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </Select>
      </Field>
      <Field id="d-desc" label="Description" optionalLabel className="sm:col-span-2">
        <Input value={v.description} maxLength={500} onChange={(e) => set('description', e.target.value)} placeholder="e.g. October contribution" />
      </Field>
      {!v.is_anonymous && (
        <div className="sm:col-span-2"><Checkbox label="The donor agreed to be thanked by name publicly" checked={v.acknowledge_publicly} onChange={(e) => set('acknowledge_publicly', e.target.checked)} /></div>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={r.busy} disabled={r.blocked || !parseAmount(v.amount) || !v.account_id}>Record as pending</Button>
      </div>
    </form>
  );
}

function ExpenseForm({ replaces, onDone }: { replaces: string | null; onDone: (id: string) => void }) {
  const { accounts, projects } = useOptions();
  const r = useRecorder();
  const [v, setV] = useState({
    entry_date: todayISO(), amount: '', account_id: '', payment_method: 'bank_transfer' as Enums<'payment_method'>,
    transaction_reference: '', description: '', expense_category: 'education_support' as Enums<'expense_category'>,
    payee_name: '', project_id: '', bill_reference: '', assistance_reference: '',
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = parseAmount(v.amount);
        if (!amount) return;
        void r.run((allow) => recordExpense({ ...v, amount, project_id: v.project_id || null }, allow, replaces), onDone);
      }}
    >
      <div className="sm:col-span-2">{r.banner}</div>
      <Field id="x-payee" label="Paid to" required><Input value={v.payee_name} maxLength={160} onChange={(e) => set('payee_name', e.target.value)} /></Field>
      <Field id="x-category" label="Category" required>
        <Select value={v.expense_category} onChange={(e) => set('expense_category', e.target.value as Enums<'expense_category'>)}>
          {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <CommonFields date={v.entry_date} setDate={(x) => set('entry_date', x)} amount={v.amount} setAmount={(x) => set('amount', x)} />
      <Field id="x-account" label="Paid from account" required>
        <Select value={v.account_id} onChange={(e) => set('account_id', e.target.value)}>
          <option value="">Choose…</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <Field id="x-method" label="Payment method" required>
        <Select value={v.payment_method} onChange={(e) => set('payment_method', e.target.value as Enums<'payment_method'>)}>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field id="x-ref" label="Payment reference" optionalLabel><Input value={v.transaction_reference} maxLength={120} onChange={(e) => set('transaction_reference', e.target.value)} /></Field>
      <Field id="x-bill" label="Bill / invoice number" optionalLabel><Input value={v.bill_reference} maxLength={120} onChange={(e) => set('bill_reference', e.target.value)} /></Field>
      <Field id="x-project" label="Project" optionalLabel>
        <Select value={v.project_id} onChange={(e) => set('project_id', e.target.value)}>
          <option value="">Not project-specific</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </Select>
      </Field>
      <Field id="x-assist" label="Assistance request reference" optionalLabel hint="Links the payment to an approved request (PRY-XXXX-XXXX) without showing its details here.">
        <Input value={v.assistance_reference} maxLength={20} onChange={(e) => set('assistance_reference', e.target.value)} />
      </Field>
      <Field id="x-desc" label="Description" required className="sm:col-span-2">
        <Textarea rows={2} maxLength={500} value={v.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <p className="text-sm text-ink-600 sm:col-span-2">After saving, attach the bill or receipt. Expenses cannot be verified without evidence.</p>
      <div className="sm:col-span-2">
        <Button type="submit" loading={r.busy} disabled={r.blocked || !parseAmount(v.amount) || !v.account_id || v.description.trim().length < 3}>Record as pending</Button>
      </div>
    </form>
  );
}

function TransferForm({ onDone }: { onDone: (id: string) => void }) {
  const { accounts } = useOptions();
  const r = useRecorder();
  const [v, setV] = useState({ entry_date: todayISO(), amount: '', from_account_id: '', to_account_id: '', payment_method: 'cash' as Enums<'payment_method'>, transaction_reference: '', description: '' });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = parseAmount(v.amount);
        if (!amount) return;
        void r.run(() => recordTransfer({ ...v, amount }), onDone);
      }}
    >
      <div className="sm:col-span-2">{r.banner}</div>
      <Field id="t-from" label="From account" required>
        <Select value={v.from_account_id} onChange={(e) => set('from_account_id', e.target.value)}>
          <option value="">Choose…</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <Field id="t-to" label="To account" required>
        <Select value={v.to_account_id} onChange={(e) => set('to_account_id', e.target.value)}>
          <option value="">Choose…</option>
          {accounts.filter((a) => a.id !== v.from_account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <CommonFields date={v.entry_date} setDate={(x) => set('entry_date', x)} amount={v.amount} setAmount={(x) => set('amount', x)} />
      <Field id="t-method" label="Method" required>
        <Select value={v.payment_method} onChange={(e) => set('payment_method', e.target.value as Enums<'payment_method'>)}>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field id="t-ref" label="Reference" optionalLabel><Input value={v.transaction_reference} maxLength={120} onChange={(e) => set('transaction_reference', e.target.value)} /></Field>
      <Field id="t-desc" label="Description" required className="sm:col-span-2">
        <Input value={v.description} maxLength={500} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Cash deposited at the bank branch" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={r.busy} disabled={!parseAmount(v.amount) || !v.from_account_id || !v.to_account_id || v.description.trim().length < 3}>Record transfer</Button>
      </div>
    </form>
  );
}

function OtherForm({ replaces, onDone }: { replaces: string | null; onDone: (id: string) => void }) {
  const { accounts, projects } = useOptions();
  const r = useRecorder();
  const [v, setV] = useState({
    entry_type: 'opening_balance' as 'opening_balance' | 'other_income' | 'refund' | 'allocation',
    entry_date: todayISO(), amount: '', description: '', account_id: '', payment_method: 'bank_transfer' as Enums<'payment_method'>,
    transaction_reference: '', project_id: '', related_entry_id: '',
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const internal = v.entry_type === 'allocation';
  const hints: Record<typeof v.entry_type, string> = {
    opening_balance: 'The balance of an account on the day you start using this ledger. Attach the bank statement or a signed cash count.',
    other_income: 'Income that is not a contribution or donation, such as bank interest.',
    refund: 'Money returned to a donor. It must reference the verified donation being refunded.',
    allocation: 'Earmarks general funds for a project. It does not move money between accounts.',
  };
  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = parseAmount(v.amount);
        if (!amount) return;
        void r.run(
          (allow) =>
            recordOther(
              {
                ...v,
                amount,
                account_id: internal ? null : v.account_id,
                payment_method: internal ? null : v.payment_method,
                project_id: v.project_id || null,
                related_entry_id: v.related_entry_id || null,
              },
              allow,
              replaces,
            ),
          onDone,
        );
      }}
    >
      <div className="sm:col-span-2">{r.banner}</div>
      <Field id="o-type" label="Entry type" required hint={hints[v.entry_type]} className="sm:col-span-2">
        <Select value={v.entry_type} onChange={(e) => set('entry_type', e.target.value as typeof v.entry_type)}>
          <option value="opening_balance">Opening balance</option>
          <option value="other_income">Other income</option>
          <option value="refund">Refund to a donor</option>
          <option value="allocation">Project allocation</option>
        </Select>
      </Field>
      <CommonFields date={v.entry_date} setDate={(x) => set('entry_date', x)} amount={v.amount} setAmount={(x) => set('amount', x)} />
      {!internal && (
        <>
          <Field id="o-account" label="Account" required>
            <Select value={v.account_id} onChange={(e) => set('account_id', e.target.value)}>
              <option value="">Choose…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field id="o-method" label="Method" required>
            <Select value={v.payment_method} onChange={(e) => set('payment_method', e.target.value as Enums<'payment_method'>)}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field id="o-ref" label="Reference" optionalLabel><Input value={v.transaction_reference} maxLength={120} onChange={(e) => set('transaction_reference', e.target.value)} /></Field>
        </>
      )}
      {(internal || v.entry_type === 'other_income') && (
        <Field id="o-project" label="Project" required={internal}>
          <Select value={v.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">{internal ? 'Choose…' : 'Not project-specific'}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </Field>
      )}
      {v.entry_type === 'refund' && (
        <Field id="o-related" label="Donation entry being refunded" required hint="Open the donation in the ledger and copy its ID from the address bar.">
          <Input value={v.related_entry_id} onChange={(e) => set('related_entry_id', e.target.value.trim())} placeholder="Entry ID" />
        </Field>
      )}
      <Field id="o-desc" label="Description" required className="sm:col-span-2">
        <Input value={v.description} maxLength={500} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={r.busy} disabled={r.blocked || !parseAmount(v.amount) || (!internal && !v.account_id) || v.description.trim().length < 3}>Record as pending</Button>
      </div>
    </form>
  );
}

export function NewEntryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const replaces = params.get('replaces');
  const replacesNo = params.get('no');
  const [kind, setKind] = useState<Kind>((params.get('kind') as Kind) || 'donation');
  const done = (id: string) => {
    toast.success('Entry recorded as pending. Attach evidence, then ask another treasurer or administrator to verify it.');
    navigate(`/admin/finance/entries/${id}`);
  };
  return (
    <>
      <PageHeader
        title="Record an entry"
        description="New entries are pending until a second person verifies them against a bank statement, bill or receipt."
        back={{ to: '/admin/finance/ledger', label: 'Ledger' }}
      />
      {replaces && (
        <Alert tone="info" className="mb-6" title="Recording a correction">
          This entry will be linked as the corrected replacement of {replacesNo ? entryLabel(Number(replacesNo)) : 'the reversed entry'}.
        </Alert>
      )}
      <Card>
        <Tabs
          label="Entry type"
          active={kind}
          onChange={(id) => setKind(id as Kind)}
          tabs={[
            { id: 'donation', label: 'Contribution or donation' },
            { id: 'expense', label: 'Expense' },
            { id: 'transfer', label: 'Transfer', hidden: Boolean(replaces) },
            { id: 'other', label: 'Other' },
          ]}
        >
          {kind === 'donation' && <DonationForm replaces={replaces} onDone={done} />}
          {kind === 'expense' && <ExpenseForm replaces={replaces} onDone={done} />}
          {kind === 'transfer' && <TransferForm onDone={done} />}
          {kind === 'other' && <OtherForm replaces={replaces} onDone={done} />}
        </Tabs>
      </Card>
    </>
  );
}
