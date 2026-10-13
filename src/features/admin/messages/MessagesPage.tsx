import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/useAuth';
import { telLink } from '@/lib/contact';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { MESSAGE_STATUS_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import { listMessages, teamNames, updateMessage, type MessageRow } from '../api/admin';
import { DataTable, type Column } from '../components/DataTable';
import { KeyValue, PageHeader } from '../components/PageHeader';
import { MessageStatusBadge } from '../components/StatusBadges';
import { useToast } from '../components/useToast';

const PAGE_SIZE = 25;

function MessageDialog({ message, handler, onClose, onChanged }: { message: MessageRow; handler: string | undefined; onClose: () => void; onChanged: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const change = async (status: Enums<'message_status'>) => {
    setBusy(true);
    try {
      await updateMessage(message.id, { status, handled_by: status === 'new' ? null : (message.handled_by ?? auth.userId) });
      toast.success(status === 'closed' ? 'Message closed.' : status === 'new' ? 'Message reopened.' : 'Message marked as in progress.');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const tel = message.phone ? telLink(message.phone) : null;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={message.subject}
      description={`From ${message.name} · ${formatDateTime(message.created_at)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {message.status !== 'in_progress' && message.status !== 'closed' && (
            <Button variant="secondary" loading={busy} onClick={() => change('in_progress')}>I’m handling this</Button>
          )}
          {message.status !== 'closed' ? (
            <Button loading={busy} onClick={() => change('closed')}>Mark as closed</Button>
          ) : (
            <Button variant="secondary" loading={busy} onClick={() => change('new')}>Reopen</Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <p className="rounded-md bg-ivory-50 p-4 whitespace-pre-wrap">{message.message}</p>
        <KeyValue
          items={[
            { label: 'Status', value: <MessageStatusBadge status={message.status} /> },
            { label: 'Handled by', value: handler ?? '—' },
            {
              label: 'Email',
              value: message.email ? (
                <a href={`mailto:${message.email}`} className="inline-flex items-center gap-1.5 text-forest-700 underline underline-offset-2">
                  <Mail aria-hidden="true" className="size-4" /> {message.email}
                </a>
              ) : null,
            },
            {
              label: 'Phone',
              value:
                message.phone && tel ? (
                  <a href={tel} className="inline-flex items-center gap-1.5 text-forest-700 underline underline-offset-2">
                    <Phone aria-hidden="true" className="size-4" /> {message.phone}
                  </a>
                ) : (
                  message.phone
                ),
            },
          ]}
        />
        <p className="text-sm text-ink-600">Reply from the organisation’s official email or phone. Do not forward this message outside the team.</p>
      </div>
    </Dialog>
  );
}

export function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const status = (params.get('status') ?? 'new') as Enums<'message_status'> | 'all';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [open, setOpen] = useState<MessageRow | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'messages', { status, page }],
    queryFn: () => listMessages({ status: status === 'all' ? '' : status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const names = useQuery({ queryKey: ['admin', 'team-names'], queryFn: teamNames, staleTime: 5 * 60_000 });
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const columns: Column<MessageRow>[] = [
    {
      key: 'subject',
      header: 'Subject',
      cell: (m) => (
        <button type="button" className="text-left font-medium text-forest-700 underline-offset-2 hover:underline" onClick={() => setOpen(m)}>
          {m.subject}
        </button>
      ),
    },
    { key: 'from', header: 'From', cell: (m) => m.name },
    { key: 'received', header: 'Received', cell: (m) => formatDateTime(m.created_at) },
    { key: 'status', header: 'Status', cell: (m) => <MessageStatusBadge status={m.status} /> },
  ];
  return (
    <>
      <PageHeader title="Messages" description="Messages sent through the Contact page. Only administrators can see them." />
      <div className="mb-6 max-w-xs">
        <Field id="msg-status" label="Show">
          <Select value={status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(MESSAGE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="all">All messages</option>
          </Select>
        </Field>
      </div>
      <QueryState query={query} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No messages" description="Nothing matches this filter." />}>
        {({ rows, count }) => (
          <>
            <DataTable rows={rows} columns={columns} rowKey={(m) => m.id} caption="Contact messages" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={count} onPageChange={(p) => set('page', String(p))} className="mt-6" />
          </>
        )}
      </QueryState>
      {open && (
        <MessageDialog
          key={open.id}
          message={open}
          handler={open.handled_by ? names.data?.get(open.handled_by) : undefined}
          onClose={() => setOpen(null)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ['admin', 'messages'] })}
        />
      )}
    </>
  );
}
