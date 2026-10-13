export function villageLocation(v: { block: string | null; district: string | null; state: string | null }): string {
  return [v.block, v.district, v.state].filter(Boolean).join(', ');
}
