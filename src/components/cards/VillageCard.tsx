import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Photo } from '@/components/media/Photo';
import type { PublicVillage } from '@/lib/api/public';
import { cn } from '@/lib/cn';
import { villageLocation } from '@/lib/places';

export function VillageCard({ village, className }: { village: PublicVillage; className?: string }) {
  const count = village.projects?.length ?? 0;
  return (
    <article className={cn('group relative flex flex-col overflow-hidden rounded-3xl bg-white p-2 shadow-card ring-1 ring-ink-900/[0.06] transition-[box-shadow,transform] duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-float', className)}>
      <Photo media={village.cover} className="aspect-[16/10] overflow-hidden rounded-2xl" placeholderLabel="Village photograph to be added" sizes="(min-width: 1024px) 33vw, 100vw" />
      <div className="flex flex-1 flex-col gap-2 px-4 pt-5 pb-4">
        <h3 className="font-display text-xl font-semibold">
          <Link to={`/villages/${village.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {village.name}
          </Link>
          {village.local_name && <span className="ml-2 text-base font-normal text-ink-600">{village.local_name}</span>}
        </h3>
        {villageLocation(village) && <p className="text-sm text-ink-600">{villageLocation(village)}</p>}
        {village.summary && <p className="line-clamp-3 text-[0.9375rem] text-ink-700">{village.summary}</p>}
        <p className="mt-auto flex items-center justify-between pt-3 text-sm font-medium text-forest-700">
          <span>
            {count === 0 ? 'No published projects yet' : `${count} published ${count === 1 ? 'project' : 'projects'}`}
          </span>
          <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
        </p>
      </div>
    </article>
  );
}
