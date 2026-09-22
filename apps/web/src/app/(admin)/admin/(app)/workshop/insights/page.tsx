'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StitchingStage } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type { WorkshopOutput } from '@/types/api';
import { STAGE_LABELS } from '@/types/stitching';
import { DataTable, EmptyState, Loading, MetricStrip, PageHeader, Section } from '@/components/ui';

/**
 * WO-D.6 (10-admin-dashboard.md Track D, the last one) — workshop
 * throughput: what started and finished each day, how long a job sits in
 * each stage, who's finishing the most work, and where the pipeline is
 * actually stuck. Ships against the live "one endpoint, one screen" idiom
 * (ADR-019/020), not Track A's unbuilt report-registry catalog.
 */
export default function WorkshopInsightsPage() {
  const [output, setOutput] = useState<WorkshopOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOutput(await adminFetch<WorkshopOutput>('/admin/analytics/workshop/output', { query: { days: 30 } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load workshop insights');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <>
        <PageHeader title="Workshop insights" description="Throughput, time in each stage, and who's finishing the most work." />
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </>
    );
  }

  if (!output) {
    return (
      <>
        <PageHeader title="Workshop insights" description="Throughput, time in each stage, and who's finishing the most work." />
        <Loading />
      </>
    );
  }

  const stageLabel = (stage: string) => STAGE_LABELS[stage as StitchingStage] ?? stage;
  const totalStarted = output.series.reduce((sum, point) => sum + point.started, 0);
  const totalCompleted = output.series.reduce((sum, point) => sum + point.completed, 0);

  return (
    <>
      <PageHeader title="Workshop insights" description="Throughput, time in each stage, and who's finishing the most work — last 30 days." />

      <Section title="Throughput">
        <MetricStrip
          label="Workshop throughput"
          items={[
            { key: 'started', label: 'Jobs started', value: totalStarted },
            { key: 'completed', label: 'Jobs completed', value: totalCompleted },
            ...(output.bottleneck
              ? [{ key: 'bottleneck', label: 'Bottleneck stage', value: `${stageLabel(output.bottleneck.stage)} · ${output.bottleneck.avgHours}h` }]
              : []),
          ]}
        />
      </Section>

      <Section title="Time in each stage">
        {output.byStage.length === 0 ? (
          <EmptyState title="No stage transitions in this window" />
        ) : (
          <DataTable
            rows={output.byStage}
            rowKey={(row) => row.stage}
            columns={[
              { header: 'Stage', cell: (row) => stageLabel(row.stage) },
              { header: 'Transitions', cell: (row) => row.count, align: 'end', numeric: true, muted: true },
              { header: 'Avg. time', cell: (row) => `${row.avgHours}h`, align: 'end', numeric: true },
            ]}
          />
        )}
      </Section>

      <Section title="By tailor" description="Jobs completed and their average turnaround time.">
        {output.byTailor.length === 0 ? (
          <EmptyState title="No jobs completed in this window" />
        ) : (
          <DataTable
            rows={output.byTailor}
            rowKey={(row) => row.tailorId}
            columns={[
              { header: 'Tailor', cell: (row) => row.name },
              { header: 'Jobs completed', cell: (row) => row.jobsCompleted, align: 'end', numeric: true, muted: true },
              { header: 'Avg. turnaround', cell: (row) => `${row.avgHours}h`, align: 'end', numeric: true },
            ]}
          />
        )}
      </Section>
    </>
  );
}
