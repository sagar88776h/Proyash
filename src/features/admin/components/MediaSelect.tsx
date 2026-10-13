import { useQuery } from '@tanstack/react-query';
import { Field, Select } from '@/components/ui/Field';
import { publicMediaUrl } from '@/lib/supabase';
import { listPublishedMediaOptions } from '../api/programmes';

/** Chooses a published photo (only published photos can appear publicly). */
export function MediaSelect({ id, label, value, onChange, hint }: { id: string; label: string; value: string | null; onChange: (v: string | null) => void; hint?: string }) {
  const options = useQuery({ queryKey: ['admin', 'media-options'], queryFn: listPublishedMediaOptions });
  const selected = options.data?.find((o) => o.id === value);
  const src = publicMediaUrl(selected?.public_path);
  return (
    <div className="flex items-end gap-3">
      <Field id={id} label={label} hint={hint ?? 'Only published photos are listed.'} className="flex-1">
        <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">No photo</option>
          {(options.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>{o.alt_text.slice(0, 70) || o.id}</option>
          ))}
        </Select>
      </Field>
      {src && <img src={src} alt="" className="mb-0.5 size-11 rounded-sm object-cover" />}
    </div>
  );
}
