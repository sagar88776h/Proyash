import { useQuery } from '@tanstack/react-query';
import type { Ref } from 'react';
import { Select } from '@/components/ui/Field';
import { fetchPublishedVillages } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';

type VillageSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

/** Published villages plus a "not listed" option (the locality field is then used). */
export function VillageSelect(props: VillageSelectProps) {
  const villages = useQuery({ queryKey: ['villages', 'public'], queryFn: fetchPublishedVillages, enabled: isBackendConfigured });
  return (
    <Select {...props}>
      <option value="">{villages.isLoading ? 'Loading villages…' : 'My village is not listed / choose later'}</option>
      {(villages.data ?? []).map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
          {v.district ? ` — ${v.district}` : ''}
        </option>
      ))}
    </Select>
  );
}
