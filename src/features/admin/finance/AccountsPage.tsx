import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { errorMessage } from '@/lib/errors';
import { ACCOUNT_TYPE_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import { listAccounts, saveAccount, type Account } from '../api/finance';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';

function AccountDialog({ account, onClose, onSaved }: { account: Account | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: account?.name ?? '', account_type: account?.account_type ?? ('bank' as Enums<'account_type'>), description: account?.description ?? '', is_active: account?.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open
      onClose={onClose}
      title={account ? 'Edit account' : 'Add an account'}
      description="Where the organisation holds money. Never enter full account numbers, PINs or passwords."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={v.name.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await saveAccount(account?.id ?? null, { name: v.name.trim(), account_type: v.account_type, description: v.description.trim() || null, is_active: v.is_active });
                onSaved();
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save account
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="danger" live="assertive">{error}</Alert>}
        <Field id="acc-name" label="Account name" required hint="e.g. “Bank account (XYZ Bank, ending 4821)” or “Treasurer cash box”">
          <Input value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field id="acc-type" label="Type">
          <Select value={v.account_type} onChange={(e) => setV({ ...v, account_type: e.target.value as Enums<'account_type'> })}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field id="acc-desc" label="Notes" optionalLabel hint="Bank name and last four digits only.">
          <Input value={v.description} maxLength={300} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
        <Checkbox label="Active (available for new entries)" checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} />
      </div>
    </Dialog>
  );
}

export function AccountsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'finance', 'accounts'], queryFn: listAccounts });
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const columns: Column<Account>[] = [
    { key: 'name', header: 'Account', cell: (a) => a.name },
    { key: 'type', header: 'Type', cell: (a) => ACCOUNT_TYPE_LABELS[a.account_type] },
    { key: 'desc', header: 'Notes', cell: (a) => a.description ?? '—', hideOnMobile: true },
    { key: 'active', header: 'Status', cell: (a) => (a.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
    { key: 'edit', header: <span className="sr-only">Actions</span>, align: 'right', cell: (a) => <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>Edit</Button> },
  ];
  return (
    <>
      <PageHeader
        title="Accounts"
        description="Accounts cannot be deleted once used; mark them inactive instead. Balances are on the Finance overview."
        actions={<Button size="sm" iconLeft={<Plus aria-hidden="true" className="size-4" />} onClick={() => setEditing('new')}>Add account</Button>}
      />
      <QueryState query={query} isEmpty={(r) => r.length === 0} empty={<EmptyState title="No accounts yet" description="Add the organisation’s bank account, cash in hand or wallet." />}>
        {(rows) => <DataTable rows={rows} columns={columns} rowKey={(a) => a.id} caption="Financial accounts" />}
      </QueryState>
      {editing && (
        <AccountDialog
          key={editing === 'new' ? 'new' : editing.id}
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
            toast.success('Account saved.');
          }}
        />
      )}
    </>
  );
}
