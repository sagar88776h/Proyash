import { ArrowUpRight, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { Photo } from '@/components/media/Photo';
import { Badge } from '@/components/ui/Feedback';
import type { PublicProject } from '@/lib/api/public';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { ACTIVITY_CATEGORY_LABELS, PROJECT_STATUS_LABELS } from '@/lib/labels';

const statusTone = { planned: 'info', ongoing: 'forest', completed: 'success', on_hold: 'warning', cancelled: 'neutral' } as const;

export function ProjectCard({ project, className, headingLevel = 'h3' }: { project: PublicProject; className?: string; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel;
  const place = project.village?.name ?? project.locality;
  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-card bg-ivory-50 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.07)] transition-[box-shadow,transform] duration-500 ease-out-expo',
        'hover:-translate-y-1 hover:shadow-lift focus-within:shadow-lift',
        className,
      )}
    >
      <Photo
        media={project.cover}
        className="aspect-[4/3] bg-ivory-200"
        imgClassName="transition-transform duration-[1200ms] ease-out-expo group-hover:scale-[1.04]"
        placeholderLabel="Project photograph to be added"
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      />
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold">{ACTIVITY_CATEGORY_LABELS[project.category]}</Badge>
          <Badge tone={statusTone[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
        </div>
        <Heading className="font-display text-xl leading-snug font-semibold text-ink-900">
          <Link to={`/our-work/${project.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {project.title}
          </Link>
        </Heading>
        <p className="line-clamp-3 text-[0.9375rem] leading-relaxed text-ink-600">{project.summary}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-sm text-ink-600">
          <span className="flex items-center gap-1.5">
            {place && (
              <>
                <MapPin aria-hidden="true" className="size-4 text-forest-600" />
                {place}
              </>
            )}
          </span>
          <span className="flex items-center gap-1 font-medium text-forest-700">
            {project.start_date ? formatDate(project.start_date) : 'View'}
            <ArrowUpRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
}
