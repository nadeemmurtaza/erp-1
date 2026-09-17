import type { ReactNode } from 'react';
import { SectionRail, type RailSection } from '@/components/ui';

/**
 * The shape the three policy pages share.
 *
 * Terms, Privacy and Returns were three files with the same 250-line
 * skeleton typed out separately — same header, same wrapper, same section
 * markup, and between them sixty-two uses of Tailwind's stock `gray` scale
 * while the rest of the product is on `neutral`. Two palettes, kept apart
 * only by which file you happened to open.
 *
 * They also carried `prose prose-gray`, which did nothing at all: the
 * typography plugin is not installed here, so the spacing was coming from a
 * `space-y-8` on the wrapper and whatever the browser does by default.
 *
 * A policy is the clearest case there is for a rail. Thirteen numbered
 * clauses is not a page anybody reads top to bottom — it is a page they
 * arrive at wanting clause six, because an order went wrong. Every clause
 * stays present and in order; what goes away is the scrolling.
 */
export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  /** The "last updated" line. A policy needs its date visible. */
  updated: ReactNode;
  sections: RailSection[];
}) {
  return (
    // A div, not a <main>: the storefront layout already renders one, and the
    // pages this replaced nested a second inside it — two landmarks, and
    // invalid HTML that no browser complains about loudly enough to notice.
    <div className="container-page py-10 lg:py-14">
      {/*
       * Rail plus a capped measure comes to about 840px. Left-aligned, every
       * pixel of slack pools on one side and reads as a page whose right-hand
       * column failed to load; centred, the same slack reads as margin. Space
       * either has a job or is balanced — never pooled.
       */}
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-2xl font-medium tracking-tight text-neutral-900 lg:text-3xl">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-neutral-900/50">{updated}</p>
        </header>

        {/*
         * `prose-legal` wraps each section's body, not the rail. On the rail's
         * root it styled the jump links as prose links — underlined and
         * accent-coloured — so the nav read as thirteen inline citations
         * rather than as a control.
         */}
        <SectionRail
          label={`${title} sections`}
          sections={sections.map((section) => ({
            ...section,
            content: (
              <div key={section.id} className="prose-legal">
                {section.content}
              </div>
            ),
          }))}
        />
      </div>
    </div>
  );
}
