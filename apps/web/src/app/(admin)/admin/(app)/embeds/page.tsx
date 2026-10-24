'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { EmptyState, Loading, PageHeader, Section } from '@/components/ui';
import { EmbeddedWidgetFrame } from '@/components/admin/embedded-widget-frame';
import { ROUTES } from '@/constants/routes';
import type { EmbeddedWidget } from '@/types/api';

/**
 * architecture-patterns/113-micro-frontend-embedding.md (WO-113.2) — every
 * active embedded widget, each rendered in its own narrow iframe. Which
 * widgets exist is configured under Settings > Embeds
 * (`settings.embeds.manage`); this screen only ever displays what is
 * already configured and active.
 */
export default function EmbedsPage() {
  const [widgets, setWidgets] = useState<EmbeddedWidget[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<EmbeddedWidget[]>('/admin/embeds')
      .then(setWidgets)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load embedded tools'));
  }, []);

  return (
    <>
      <PageHeader title="Embedded tools" description="Third-party dashboards and tools embedded directly here, alongside the rest of the ERP." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {!widgets ? (
        <Loading />
      ) : widgets.length === 0 ? (
        <EmptyState
          title="No embedded tools yet"
          description="An administrator can add one under Settings > Embeds."
          action={
            <Link href={ROUTES.admin.settings} className="btn-secondary">
              Go to Settings
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {widgets.map((widget) => (
            <Section key={widget.id} title={widget.label}>
              <EmbeddedWidgetFrame widget={widget} />
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
