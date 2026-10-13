import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { errorMessage } from '@/lib/errors';

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  reason?: { label: string; required?: boolean; minLength?: number; hint?: string };
  onConfirm: (reason: string) => Promise<void>;
  children?: ReactNode;
};

/** Confirmation dialog for consequential actions, optionally collecting a reason. */
export function ConfirmDialog({ open, onClose, title, description, confirmLabel, tone = 'primary', reason, onConfirm, children }: ConfirmDialogProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const min = reason?.minLength ?? (reason?.required ? 5 : 0);
  const close = () => {
    setText('');
    setError(undefined);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            disabled={reason?.required ? text.trim().length < min : false}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await onConfirm(text.trim());
                setText('');
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        {reason && (
          <Field id="confirm-reason" label={reason.label} required={reason.required} hint={reason.hint}>
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          </Field>
        )}
        {error && <Alert tone="danger" live="assertive">{error}</Alert>}
      </div>
    </Dialog>
  );
}
