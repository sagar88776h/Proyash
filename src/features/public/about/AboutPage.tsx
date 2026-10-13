import { ArrowRight, Quote } from 'lucide-react';
import { Container, Section, SectionHeading } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { Markdown } from '@/components/Markdown';
import { Reveal } from '@/components/motion/Reveal';
import { Placeholder } from '@/components/Placeholder';
import { ButtonLink } from '@/components/ui/Button';
import { itemsOf, textOf } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePublicSettings } from '@/hooks/useSettings';

export function AboutPage() {
  useDocumentTitle('About PRAYASH');
  const { content } = useContent('about');
  const { settings } = usePublicSettings();
  const org = settings.organisation;
  const story = textOf(content, 'story').trim();
  return (
    <>
      <PageHero eyebrow="About us" title={textOf(content, 'heading')} intro={textOf(content, 'intro')} />

      <Section tone="ivory" labelledBy="mission-heading" padding="loose">
        <Container>
          <Reveal className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
            <Quote aria-hidden="true" className="size-10 text-gold-500" strokeWidth={1.2} />
            <h2 id="mission-heading" className="eyebrow">Our mission</h2>
            <p className="font-display text-display-md leading-snug font-medium text-ink-900">{textOf(content, 'mission')}</p>
            <p className="font-display text-lg text-gold-700">Together for Humanity. Together for a Better Tomorrow.</p>
          </Reveal>
        </Container>
      </Section>

      <Section tone="white" labelledBy="story-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
            <SectionHeading eyebrow="Our story" title="How PRAYASH came together" id="story-heading" />
            <div className="flex flex-col gap-6">
              {story ? (
                <Markdown>{story}</Markdown>
              ) : (
                <Placeholder
                  label="Our story: how PRAYASH began, who is involved and what it has done so far"
                  hint="Write this in the admin portal (Website → Content → About). Include only facts PRAYASH has confirmed."
                />
              )}
              <dl className="grid gap-6 border-t border-ink-100 pt-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-ink-600">Registration</dt>
                  <dd className="mt-1">
                    {org.registration_details ? (
                      <span className="font-medium">{org.registration_details}</span>
                    ) : (
                      <Placeholder compact label="Registration details, if any" hint="Leave empty unless officially confirmed." />
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-600">Established</dt>
                  <dd className="mt-1">
                    {org.established_year ? (
                      <span className="font-medium">{org.established_year}</span>
                    ) : (
                      <Placeholder compact label="Year established" />
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="ivory" labelledBy="commitments-heading">
        <Container>
          <SectionHeading eyebrow="What we stand for" title="Our commitments" id="commitments-heading" className="mb-12" />
          <ul className="grid gap-5 sm:grid-cols-2">
            {itemsOf(content, 'commitments').map((item, i) => (
              <Reveal as="li" key={item.title} delay={i * 0.06} className="flex flex-col gap-3 rounded-card bg-ivory-50 p-8 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.07)]">
                <span className="font-display text-sm font-semibold text-gold-700">0{i + 1}</span>
                <h3 className="font-display text-xl font-semibold">{item.title}</h3>
                <p className="text-ink-600">{item.body}</p>
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="forest" labelledBy="how-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
            <SectionHeading eyebrow="How we work" title="Careful, accountable, together" id="how-heading" />
            <div className="flex flex-col gap-8">
              <Markdown className="text-ivory-100/90 [&_strong]:text-ivory-50">{textOf(content, 'how_we_work')}</Markdown>
              <div className="flex flex-wrap gap-3">
                <ButtonLink to="/our-work" variant="gold" iconRight={<ArrowRight aria-hidden="true" className="size-4" />}>
                  See our work
                </ButtonLink>
                <ButtonLink to="/transparency" variant="light">
                  Financial reports
                </ButtonLink>
              </div>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
