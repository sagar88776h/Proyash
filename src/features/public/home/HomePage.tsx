import { useQuery } from '@tanstack/react-query';
import { m } from 'framer-motion';
import { ArrowRight, BookOpen, HandHeart, HeartPulse, Home, Lock, Search, ShieldCheck, Users, Wheat } from 'lucide-react';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import { ProjectCard } from '@/components/cards/ProjectCard';
import { ReportSummary } from '@/components/cards/ReportSummary';
import { StatTile } from '@/components/cards/StatTile';
import { VillageCard } from '@/components/cards/VillageCard';
import { Container, Section, SectionHeading } from '@/components/layout/Container';
import { Photo } from '@/components/media/Photo';
import { Reveal } from '@/components/motion/Reveal';
import { QueryState } from '@/components/QueryState';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { VillageDawn } from '@/components/visual/VillageDawn';
import { itemsOf, textOf, type PageContent } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion';
import {
  fetchFeaturedProjects,
  fetchImpactSummary,
  fetchLatestPublicMedia,
  fetchPublicMedia,
  fetchPublishedReports,
  fetchPublishedVillages,
} from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';
import { formatNumber } from '@/lib/format';
import { publicMediaUrl } from '@/lib/supabase';

const AREA_ICONS = [BookOpen, HeartPulse, Wheat, Home, Users, HandHeart];

/** Scroll-linked parallax for the hero (GSAP, loaded on demand). */
function useHeroParallax(root: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>, visual: RefObject<HTMLElement | null>) {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced || !root.current) return;
    let revert: (() => void) | undefined;
    let cancelled = false;
    Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled || !root.current) return;
        gsap.registerPlugin(ScrollTrigger);
        const ctx = gsap.context(() => {
          const trigger = { trigger: root.current, start: 'top top', end: 'bottom top', scrub: 0.6 };
          if (content.current) gsap.to(content.current, { yPercent: -8, ease: 'none', scrollTrigger: trigger });
          if (visual.current) gsap.to(visual.current, { yPercent: 6, ease: 'none', scrollTrigger: trigger });
        }, root);
        revert = () => ctx.revert();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      revert?.();
    };
  }, [reduced, root, content, visual]);
}

function HomeHero({ content }: { content: PageContent }) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  useHeroParallax(rootRef, contentRef, visualRef);

  const mediaId = textOf(content, 'hero_media_id').trim();
  const heroMedia = useQuery({
    queryKey: ['media', mediaId],
    queryFn: () => fetchPublicMedia(mediaId),
    enabled: isBackendConfigured && /^[0-9a-f-]{36}$/i.test(mediaId),
  });
  const heroSrc = publicMediaUrl(heroMedia.data?.public_path);

  const title = textOf(content, 'hero_title');
  const lines = title.split(/(?<=\.)\s+/).filter(Boolean);
  const lineMotion = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: '0.6em' },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 1, delay: 0.1 + i * 0.12, ease: [0.16, 1, 0.3, 1] as const },
        };
  const fade = (delay: number) =>
    reduced ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <section ref={rootRef} aria-labelledby="hero-title" className="px-2 pt-24 sm:px-4 sm:pt-28">
      <div className="relative isolate overflow-hidden rounded-bento">
        <VillageDawn className="-z-10" />
        <Container
          size="wide"
          className="relative grid items-start gap-10 pt-12 pb-[clamp(150px,34vw,260px)] sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pt-16 lg:pb-32"
        >
          <div ref={contentRef} className="flex flex-col gap-6 will-change-transform">
            <m.p className="eyebrow" {...fade(0)}>
              {textOf(content, 'hero_eyebrow')}
            </m.p>
            <h1 id="hero-title" className="text-display-xl font-semibold text-ink-900">
              {lines.map((line, i) => (
                <span key={line} className="block overflow-hidden pb-[0.08em]">
                  <m.span className={i % 2 === 1 ? 'block text-leaf-700' : 'block'} {...lineMotion(i)}>
                    {line}
                  </m.span>
                </span>
              ))}
            </h1>
            <m.p className="text-lead max-w-xl text-ink-700" {...fade(0.35)}>
              {textOf(content, 'hero_body')}
            </m.p>
            <m.div className="flex flex-wrap gap-3 pt-1" {...fade(0.5)}>
              <ButtonLink to="/request-help" size="lg" iconRight={<ArrowRight aria-hidden="true" className="size-4" />}>
                Request help
              </ButtonLink>
              <ButtonLink to="/support-us" variant="secondary" size="lg" iconLeft={<HandHeart aria-hidden="true" className="size-4" />}>
                Support us
              </ButtonLink>
            </m.div>
            <m.ul className="flex flex-wrap gap-x-6 gap-y-3 pt-3 text-sm text-ink-700" {...fade(0.65)}>
              {[
                { icon: Lock, text: 'Requests kept private' },
                { icon: ShieldCheck, text: 'Every rupee verified' },
                { icon: Users, text: 'Friends & well-wishers from nearby villages' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-white text-forest-700 shadow-card">
                    <Icon aria-hidden="true" className="size-3.5" />
                  </span>
                  {text}
                </li>
              ))}
            </m.ul>
          </div>

          {heroSrc && (
            <div ref={visualRef} className="relative will-change-transform">
              <img
                src={heroSrc}
                alt={heroMedia.data?.alt_text ?? ''}
                fetchPriority="high"
                className="aspect-[4/3] w-full rounded-[1.75rem] object-cover shadow-float ring-4 ring-white/70"
              />
            </div>
          )}
        </Container>
      </div>
    </section>
  );
}

function IntroSection({ content }: { content: PageContent }) {
  const media = useQuery({ queryKey: ['latest-media'], queryFn: () => fetchLatestPublicMedia(3), enabled: isBackendConfigured });
  const photos = media.data ?? [];
  const areas = itemsOf(content, 'help_areas');
  const [lead, ...rest] = areas;
  return (
    <Section tone="white" labelledBy="intro-heading">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <Reveal className="flex flex-col gap-6">
            <p className="eyebrow">Who we are</p>
            <h2 id="intro-heading" className="text-display-lg font-semibold">
              {textOf(content, 'intro_heading')}
            </h2>
            <p className="text-lead text-ink-700">{textOf(content, 'intro_body')}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <ButtonLink to="/about" variant="secondary">
                About PRAYASH
              </ButtonLink>
              <ButtonLink to="/our-work" variant="ghost" iconRight={<ArrowRight aria-hidden="true" className="size-4" />}>
                See our work
              </ButtonLink>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="grid grid-cols-6 grid-rows-6 gap-3 sm:gap-4" y={40}>
            <Photo
              media={photos[0]}
              className="col-span-4 row-span-4 aspect-[4/3] overflow-hidden rounded-3xl shadow-card"
              placeholderLabel="Community photograph to be added"
              sizes="(min-width: 1024px) 30vw, 66vw"
            />
            <Photo
              media={photos[1]}
              className="col-span-2 col-start-5 row-span-3 row-start-2 overflow-hidden rounded-3xl"
              placeholderLabel="Photograph to be added"
              sizes="15vw"
            />
            <Photo
              media={photos[2]}
              className="col-span-3 col-start-3 row-span-2 row-start-5 aspect-[16/9] overflow-hidden rounded-3xl"
              placeholderLabel="Photograph to be added"
              sizes="25vw"
            />
          </Reveal>
        </div>

        {lead && (
          <div className="mt-20">
            <div className="mb-8 flex flex-col gap-3">
              <p className="eyebrow">How we help</p>
              <h2 className="text-display-md font-semibold">Support where it is needed most</h2>
            </div>
            <ul className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Reveal as="li" className="on-dark flex flex-col justify-between gap-10 rounded-bento bg-forest-800 p-8 text-ivory-50 sm:col-span-2 lg:row-span-2 sm:p-10">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-gold-300">
                  <BookOpen aria-hidden="true" className="size-7" strokeWidth={1.6} />
                </span>
                <div className="flex flex-col gap-3">
                  <h3 className="font-display text-2xl font-semibold sm:text-3xl">{lead.title}</h3>
                  <p className="max-w-md text-ivory-100/85">{lead.body}</p>
                </div>
              </Reveal>
              {rest.map((area, i) => {
                const Icon = AREA_ICONS[(i + 1) % AREA_ICONS.length]!;
                return (
                  <Reveal as="li" key={area.title} delay={(i + 1) * 0.06} className="flex flex-col gap-4 rounded-bento bg-mint-50 p-7 ring-1 ring-forest-700/[0.06]">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-forest-700 shadow-card">
                      <Icon aria-hidden="true" className="size-6" strokeWidth={1.6} />
                    </span>
                    <h3 className="font-display text-lg font-semibold">{area.title}</h3>
                    <p className="text-[0.9375rem] leading-relaxed text-ink-700">{area.body}</p>
                  </Reveal>
                );
              })}
              <Reveal as="li" delay={0.3} className="flex flex-col justify-between gap-6 rounded-bento bg-gold-100 p-7">
                <p className="font-display text-lg leading-snug font-semibold text-ink-900">Need support for yourself or someone you know?</p>
                <Link to="/request-help" className="inline-flex items-center gap-2 font-medium text-forest-800 underline-offset-4 hover:underline">
                  Ask for help <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Reveal>
            </ul>
          </div>
        )}
      </Container>
    </Section>
  );
}

function ActionCard({
  eyebrow,
  title,
  body,
  primary,
  secondary,
  tone,
}: {
  eyebrow: string;
  title: string;
  body: string;
  primary: { to: string; label: string };
  secondary: { to: string; label: string; icon: ReactNode };
  tone: 'forest' | 'mint';
}) {
  return (
    <Reveal
      className={
        tone === 'forest'
          ? 'on-dark relative flex flex-col gap-5 overflow-hidden rounded-bento bg-forest-700 p-8 text-ivory-50 sm:p-12'
          : 'relative flex flex-col gap-5 overflow-hidden rounded-bento bg-mint-100 p-8 text-ink-900 sm:p-12'
      }
    >
      <div aria-hidden="true" className={tone === 'forest' ? 'absolute -right-16 -bottom-16 size-56 rounded-full border-[24px] border-white/5' : 'absolute -right-16 -bottom-16 size-56 rounded-full border-[24px] border-white/60'} />
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="text-display-md font-semibold">{title}</h2>
      <p className={tone === 'forest' ? 'max-w-md text-ivory-100/85' : 'max-w-md text-ink-700'}>{body}</p>
      <div className="relative mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-4">
        <ButtonLink to={primary.to} variant={tone === 'forest' ? 'gold' : 'primary'} iconRight={<ArrowRight aria-hidden="true" className="size-4" />}>
          {primary.label}
        </ButtonLink>
        <Link
          to={secondary.to}
          className={
            tone === 'forest'
              ? 'inline-flex items-center gap-2 text-[0.9375rem] font-medium text-ivory-50 underline-offset-4 hover:underline'
              : 'inline-flex items-center gap-2 text-[0.9375rem] font-medium text-forest-700 underline-offset-4 hover:underline'
          }
        >
          {secondary.icon}
          {secondary.label}
        </Link>
      </div>
    </Reveal>
  );
}

function ActionsSection() {
  return (
    <Section tone="white" padding="tight" className="pt-0 sm:pt-0">
      <Container>
        <div className="grid gap-4 lg:grid-cols-2">
          <ActionCard
            tone="forest"
            eyebrow="Need support?"
            title="Ask PRAYASH for help"
            body="For education, medical, food or other essential needs. Requests are private and every one is reviewed by our team."
            primary={{ to: '/request-help', label: 'Request help' }}
            secondary={{ to: '/request-help/status', label: 'Check an existing request', icon: <Search aria-hidden="true" className="size-4" /> }}
          />
          <ActionCard
            tone="mint"
            eyebrow="Want to help?"
            title="Support people in need"
            body="Contribute through PRAYASH's official payment method, or give your time and skills as a volunteer."
            primary={{ to: '/support-us', label: 'Support us' }}
            secondary={{ to: '/volunteer', label: 'Become a volunteer', icon: <HandHeart aria-hidden="true" className="size-4" /> }}
          />
        </div>
      </Container>
    </Section>
  );
}

function FeaturedProjects() {
  const query = useQuery({ queryKey: ['projects', 'featured'], queryFn: () => fetchFeaturedProjects(3), enabled: isBackendConfigured });
  return (
    <Section tone="white" labelledBy="featured-heading">
      <Container>
        <div className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Our work" title="Featured projects" id="featured-heading">
            Projects published after review by our team.
          </SectionHeading>
          <ButtonLink to="/our-work" variant="secondary" iconRight={<ArrowRight aria-hidden="true" className="size-4" />}>
            All projects
          </ButtonLink>
        </div>
        <QueryState
          query={query}
          enabled={isBackendConfigured}
          isEmpty={(rows) => rows.length === 0}
          loading={
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-96 rounded-3xl" />
              ))}
            </div>
          }
          empty={<EmptyState title="Projects will appear here soon" description="Projects are published here once they have been reviewed and approved by our team." />}
        >
          {(rows) => (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((p, i) => (
                <Reveal key={p.id} delay={i * 0.08}>
                  <ProjectCard project={p} className="h-full" />
                </Reveal>
              ))}
            </div>
          )}
        </QueryState>
      </Container>
    </Section>
  );
}

function ImpactSection() {
  const query = useQuery({ queryKey: ['impact'], queryFn: fetchImpactSummary, enabled: isBackendConfigured });
  return (
    <Section tone="forest" labelledBy="impact-heading" padding="loose">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.4fr] lg:gap-20">
          <Reveal className="flex flex-col gap-5">
            <p className="eyebrow">Verified impact</p>
            <h2 id="impact-heading" className="text-display-lg font-semibold">
              Counted only once it is verified
            </h2>
            <p className="text-lead text-ivory-100/80">
              Every figure on this page is calculated from published projects and outcomes that a publisher has verified. Nothing is entered as a free-standing number.
            </p>
            <span className="inline-flex items-center gap-2 text-sm text-gold-300">
              <ShieldCheck aria-hidden="true" className="size-4" /> Calculated live from verified records
            </span>
          </Reveal>
          <QueryState
            query={query}
            enabled={isBackendConfigured}
            loading={<Skeleton className="h-64 rounded-3xl bg-white/10" />}
            isEmpty={(d) =>
              d.projects_completed + d.projects_ongoing + d.villages_reached + d.active_volunteers === 0 && d.featured_outcomes.length === 0
            }
            empty={
              <div className="rounded-3xl border border-white/15 p-8 text-ivory-100/85">
                <p className="font-display text-xl font-semibold text-ivory-50">Impact figures will appear here</p>
                <p className="mt-2">As projects are published and their outcomes verified, the totals on this page update automatically.</p>
              </div>
            }
          >
            {(d) => (
              <div className="flex flex-col gap-12">
                <div className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
                  <StatTile value={d.projects_completed} label="Projects completed" />
                  <StatTile value={d.projects_ongoing} label="Projects ongoing" />
                  <StatTile value={d.villages_reached} label="Villages reached" />
                  <StatTile value={d.active_volunteers} label="Registered volunteers" note="Approved or active" />
                </div>
                {d.featured_outcomes.length > 0 && (
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {d.featured_outcomes.map((o) => (
                      <li key={o.id} className="flex flex-col gap-1 rounded-3xl bg-white/5 p-6 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
                        {o.quantity !== null && (
                          <p className="font-display text-3xl font-semibold text-gold-300 tabular-nums">
                            {formatNumber(Number(o.quantity))}
                            {o.unit && <span className="ml-2 text-lg font-medium text-ivory-100/85">{o.unit}</span>}
                          </p>
                        )}
                        <p className="font-medium">{o.label}</p>
                        <Link to={`/our-work/${o.project_slug}`} className="text-sm text-ivory-100/75 underline-offset-4 hover:text-gold-300 hover:underline">
                          {o.project_title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </QueryState>
        </div>
      </Container>
    </Section>
  );
}

function VillagesSection() {
  const query = useQuery({ queryKey: ['villages', 'public'], queryFn: fetchPublishedVillages, enabled: isBackendConfigured });
  return (
    <Section tone="white" labelledBy="villages-heading">
      <Container>
        <div className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Villages we serve" title="Village-level activities" id="villages-heading">
            Where PRAYASH members and volunteers are active.
          </SectionHeading>
          <ButtonLink to="/villages" variant="secondary" iconRight={<ArrowRight aria-hidden="true" className="size-4" />}>
            All villages
          </ButtonLink>
        </div>
        <QueryState
          query={query}
          enabled={isBackendConfigured}
          isEmpty={(rows) => rows.length === 0}
          loading={<Skeleton className="h-72 rounded-3xl" />}
          empty={<EmptyState title="Villages will be listed here" description="The village directory is published by PRAYASH once each village page has been reviewed." />}
        >
          {(rows) => (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rows.slice(0, 6).map((v, i) => (
                <Reveal key={v.id} delay={i * 0.06}>
                  <VillageCard village={v} className="h-full" />
                </Reveal>
              ))}
            </div>
          )}
        </QueryState>
      </Container>
    </Section>
  );
}

function VolunteerSection({ content }: { content: PageContent }) {
  return (
    <Section tone="sand" labelledBy="volunteer-heading" padding="loose" className="mx-2 rounded-bento sm:mx-4">
      <Container>
        <Reveal className="relative overflow-hidden rounded-bento bg-white px-6 py-14 shadow-card ring-1 ring-forest-700/[0.06] sm:px-14 sm:py-20">
          <div aria-hidden="true" className="absolute -top-24 -right-24 size-80 rounded-full bg-[radial-gradient(circle,var(--color-gold-200),transparent_70%)] opacity-70" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-5">
              <p className="eyebrow">Volunteer with us</p>
              <h2 id="volunteer-heading" className="text-display-lg font-semibold">
                {textOf(content, 'volunteer_heading')}
              </h2>
              <p className="text-lead max-w-xl text-ink-700">{textOf(content, 'volunteer_body')}</p>
            </div>
            <div className="flex flex-col items-start gap-4 lg:items-end">
              <ButtonLink to="/volunteer" size="lg" iconRight={<ArrowRight aria-hidden="true" className="size-4" />}>
                Become a volunteer
              </ButtonLink>
              <p className="text-sm text-ink-600">A coordinator reviews every registration.</p>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

function TransparencySection({ content }: { content: PageContent }) {
  const query = useQuery({ queryKey: ['reports', 'public'], queryFn: fetchPublishedReports, enabled: isBackendConfigured });
  return (
    <Section tone="charcoal" labelledBy="transparency-heading" padding="loose">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[1fr_1.5fr] lg:gap-20">
          <Reveal className="flex flex-col gap-5">
            <p className="eyebrow">Financial transparency</p>
            <h2 id="transparency-heading" className="text-display-lg font-semibold">
              {textOf(content, 'transparency_heading')}
            </h2>
            <p className="text-lead text-ivory-100/80">{textOf(content, 'transparency_body')}</p>
            <div className="pt-2">
              <ButtonLink to="/transparency" variant="light" iconRight={<ArrowRight aria-hidden="true" className="size-4" />}>
                Financial reports
              </ButtonLink>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="rounded-bento bg-white/[0.04] p-7 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] sm:p-10">
            <QueryState
              query={query}
              enabled={isBackendConfigured}
              isEmpty={(rows) => rows.length === 0}
              loading={<Skeleton className="h-48 rounded-3xl bg-white/10" />}
              empty={
                <div className="text-ivory-100/85">
                  <p className="font-display text-xl font-semibold text-ivory-50">No reports published yet</p>
                  <p className="mt-2">
                    Financial summaries are published here after the treasurer prepares them and a second person approves them.
                  </p>
                </div>
              }
            >
              {(rows) => (
                <div className="flex flex-col gap-4">
                  <p className="text-sm font-medium tracking-wide text-gold-300 uppercase">Latest approved report</p>
                  <ReportSummary report={rows[0]!} />
                </div>
              )}
            </QueryState>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

export function HomePage() {
  useDocumentTitle(undefined);
  const { content } = useContent('home');
  return (
    <>
      <HomeHero content={content} />
      <IntroSection content={content} />
      <ActionsSection />
      <FeaturedProjects />
      <ImpactSection />
      <VillagesSection />
      <VolunteerSection content={content} />
      <div className="h-4" aria-hidden="true" />
      <TransparencySection content={content} />
    </>
  );
}
