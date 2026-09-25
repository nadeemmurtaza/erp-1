'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, Loading, MetricStrip, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';

type RecipientStatus = 'PENDING' | 'SENT' | 'SKIPPED_OPT_OUT' | 'SKIPPED_NO_CONTACT' | 'FAILED' | 'OPENED' | 'CLICKED';

interface Recipient {
  id: string;
  status: RecipientStatus;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  failureReason: string | null;
  contact: { name: string };
}

interface CampaignDetail {
  id: string;
  name: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED';
  scheduledAt: string | null;
  sentAt: string | null;
  segment: { id: string; name: string };
  recipients: Recipient[];
}

/** WO-8 verification — the drill-down `/admin/campaigns/:id` (routes.ts) always pointed at, never built. */
export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCampaign(await adminFetch<CampaignDetail>(`/admin/campaigns/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the campaign');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div>
        <p role="alert" className="notice notice-error">
          {error}
        </p>
        <Link href={ROUTES.admin.campaigns} className="btn-secondary mt-4 inline-flex">
          Back to campaigns
        </Link>
      </div>
    );
  }

  if (!campaign) return <Loading label="Loading campaign" />;

  const counts = campaign.recipients.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const opened = campaign.recipients.filter((r) => r.openedAt).length;
  const clicked = campaign.recipients.filter((r) => r.clickedAt).length;
  const skipped = (counts.SKIPPED_OPT_OUT ?? 0) + (counts.SKIPPED_NO_CONTACT ?? 0);

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={`${campaign.channel} to "${campaign.segment.name}" — ${campaign.recipients.length} recipient(s).`}
        action={
          <Link href={ROUTES.admin.campaigns} className="btn-secondary">
            Back to campaigns
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <StatusBadge status={campaign.status} />
        {campaign.scheduledAt && <span className="text-sm text-neutral-500">Scheduled {formatDateTime(campaign.scheduledAt)}</span>}
        {campaign.sentAt && <span className="text-sm text-neutral-500">Sent {formatDateTime(campaign.sentAt)}</span>}
      </div>

      <MetricStrip
        label="Delivery"
        items={[
          { key: 'total', label: 'Recipients', value: campaign.recipients.length },
          { key: 'sent', label: 'Sent', value: counts.SENT ?? 0 },
          { key: 'opened', label: 'Opened', value: opened },
          { key: 'clicked', label: 'Clicked', value: clicked },
          { key: 'skipped', label: 'Skipped (opted out)', value: skipped },
          { key: 'failed', label: 'Failed', value: counts.FAILED ?? 0 },
        ]}
      />

      <div className="mt-6">
        <DataTable
          rows={campaign.recipients}
          rowKey={(r) => r.id}
          emptyLabel="No recipients yet — the send has not started"
          columns={[
            { header: 'Contact', cell: (r) => r.contact.name },
            { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            { header: 'Sent', cell: (r) => (r.sentAt ? formatDateTime(r.sentAt) : '—'), muted: true },
            { header: 'Opened', cell: (r) => (r.openedAt ? formatDateTime(r.openedAt) : '—'), muted: true },
            { header: 'Clicked', cell: (r) => (r.clickedAt ? formatDateTime(r.clickedAt) : '—'), muted: true },
            { header: 'Detail', cell: (r) => r.failureReason ?? '—', muted: true },
          ]}
        />
      </div>
    </div>
  );
}
