'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, PageHeader, Badge } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface CircuitSnapshot {
  key: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  options: { failureThreshold: number; cooldownMs: number };
  openedAt: string | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}

interface SloBudget {
  path: string;
  label: string;
  windowDays: number;
  totalRequests: number;
  succeededRequests: number;
  successRatePct: number | null;
  successTargetPct: number | null;
  p95LatencyMs: number | null;
  latencyTargetMs: number;
  latencyTargetLabel: string;
  remainingBudgetMinutes: number | null;
  overBudget: boolean;
}

interface DrInfo {
  rpo: { value: string; basis: string };
  rto: { value: string | null; status: string; reason: string };
  quarterlyGameDay: { cadence: string; owner: string; lastRun: string | null };
}

/**
 * The degradation matrix (38-resilience-engineering.md §1) is static,
 * fully-specified text — not live data — so it renders straight from the
 * document rather than a fetch. Keep it in sync with the doc's own table
 * by hand; a mismatch here is a documentation bug, not a data bug.
 */
const DEGRADATION_MATRIX: Array<{ dependency: string; stillWorks: string; degrades: string }> = [
  { dependency: 'Postgres (primary)', stillWorks: 'Nothing writes; /health/ready fails', degrades: 'Total — the one dependency with no degraded mode, by design' },
  { dependency: 'Redis (rate limiting)', stillWorks: 'Every route on the global limit, counted per process; signed-in sessions and token refresh', degrades: 'Sign-in and routes with their own rate limit answer 503 — never an unlimited guess' },
  { dependency: 'AiProvider', stillWorks: 'Every non-AI feature, unaffected', degrades: 'All AI features fall back to their stated non-AI path' },
  { dependency: 'VectorStore / pgvector index', stillWorks: 'Keyword search, catalogue browsing', degrades: 'Semantic/RAG retrieval only' },
  { dependency: 'PaymentProvider (Easypaisa/JazzCash)', stillWorks: 'Cash tender at POS, other configured providers', degrades: "The specific down provider's checkout option only" },
  { dependency: 'StorageDriver (S3/R2)', stillWorks: 'Everything except upload/view of a specific file', degrades: 'New uploads queue for retry; cached URLs may still resolve' },
  { dependency: 'SmsProvider / WhatsAppProvider', stillWorks: 'Every other channel; log channel always available', degrades: "That channel's sends queue, other matched channels still attempt" },
  { dependency: 'A replication parent (chain/org node)', stillWorks: "The branch's own local sale, stock, attendance", degrades: 'Facts queue for sync; policy reads fall back to last-cached value' },
  { dependency: 'OutboundConnector target', stillWorks: 'Everything internal', degrades: "That connector's deliveries queue at FAILED_RETRYING" },
  { dependency: 'The branch itself, offline', stillWorks: 'Local sale, attendance punch, condition reports', degrades: 'Anything needing a live cross-branch read' },
];

const STATE_TONE: Record<CircuitSnapshot['state'], 'success' | 'danger' | 'warning'> = {
  CLOSED: 'success',
  OPEN: 'danger',
  HALF_OPEN: 'warning',
};

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 60 * 60 * 1000) return `${(ms / (60 * 60 * 1000)).toFixed(1)}h`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/**
 * 38-resilience-engineering.md. Named "Platform Resilience" and routed at
 * /admin/platform-resilience — distinct from the unrelated "Resilience
 * Planning" screen at /admin/resilience
 * (144-supply-chain-resilience-planning-engine.md), which already held
 * the shorter name.
 */
export default function PlatformResiliencePage() {
  const { can } = useAdminSession();
  const canTune = can('platform.resilience.tune');

  const [circuits, setCircuits] = useState<CircuitSnapshot[] | null>(null);
  const [budgets, setBudgets] = useState<SloBudget[] | null>(null);
  const [dr, setDr] = useState<DrInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminFetch<{ data: CircuitSnapshot[] }>('/admin/resilience/circuits'),
      adminFetch<{ data: SloBudget[] }>('/admin/resilience/slo'),
      adminFetch<DrInfo>('/admin/resilience/dr'),
    ])
      .then(([c, s, d]) => {
        setCircuits(c.data);
        setBudgets(s.data);
        setDr(d);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the resilience dashboard'));
  }, []);

  return (
    <>
      <PageHeader
        title="Platform Resilience"
        description="What happens when a dependency is down, right now — not a document to search through at 3am."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900/70">Degradation matrix</h2>
        <DataTable
          rows={DEGRADATION_MATRIX}
          rowKey={(r) => r.dependency}
          emptyLabel="—"
          columns={[
            { header: 'Dependency down', cell: (r) => r.dependency },
            { header: 'What still works', cell: (r) => r.stillWorks, muted: true },
            { header: 'What degrades', cell: (r) => r.degrades, muted: true },
          ]}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900/70">Circuit breakers</h2>
        <DataTable
          rows={circuits ?? []}
          loading={!circuits}
          emptyLabel="No circuit has taken a call yet — nothing has tripped, and nothing is inert either; every wrapped dependency (AiProvider, PaymentProvider, VectorStore) just hasn't been called since this process started."
          rowKey={(r) => r.key}
          columns={[
            { header: 'Key', cell: (r) => r.key },
            { header: 'State', cell: (r) => <Badge tone={STATE_TONE[r.state]}>{r.state}</Badge> },
            { header: 'Failures', cell: (r) => r.failureCount, align: 'end', numeric: true },
            { header: 'Threshold', cell: (r) => r.options.failureThreshold, align: 'end', numeric: true },
            { header: 'Cooldown', cell: (r) => formatMs(r.options.cooldownMs), align: 'end' },
            { header: 'Last success', cell: (r) => (r.lastSuccessAt ? new Date(r.lastSuccessAt).toLocaleString() : '—'), muted: true },
            { header: 'Last failure', cell: (r) => (r.lastFailureAt ? new Date(r.lastFailureAt).toLocaleString() : '—'), muted: true },
          ]}
        />
        {!canTune ? null : (
          <p className="mt-2 text-xs text-neutral-900/60">
            Tuning a threshold or cooldown, and the dry-run simulator, are reached from the API today
            (<code className="break-all">POST /admin/resilience/circuits/:key/configure</code> and <code>/simulate</code>) — no
            historical AiProvider/PaymentProvider/VectorStore call log exists yet to run a simulation against.
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900/70">SLOs &amp; error budgets — trailing 30 days</h2>
        <DataTable
          rows={budgets ?? []}
          loading={!budgets}
          emptyLabel="—"
          rowKey={(r) => r.path}
          columns={[
            { header: 'Path', cell: (r) => r.label },
            {
              header: 'Success rate',
              cell: (r) =>
                r.successRatePct === null
                  ? 'No requests yet'
                  : `${r.successRatePct.toFixed(2)}%${r.successTargetPct !== null ? ` (target ${r.successTargetPct}%)` : ''}`,
            },
            { header: 'Latency', cell: (r) => `${formatMs(r.p95LatencyMs)} (target: ${r.latencyTargetLabel})`, muted: true },
            {
              header: 'Error budget',
              cell: (r) =>
                r.remainingBudgetMinutes === null ? (
                  <span className="text-neutral-900/60">n/a — bound, not a percentage SLO</span>
                ) : (
                  <Badge tone={r.overBudget ? 'danger' : 'success'}>
                    {r.overBudget ? 'Over budget' : `${r.remainingBudgetMinutes.toFixed(0)} min remaining`}
                  </Badge>
                ),
            },
            { header: 'Requests', cell: (r) => `${r.succeededRequests}/${r.totalRequests}`, align: 'end', numeric: true, muted: true },
          ]}
        />
        {budgets?.some((b) => b.overBudget) ? (
          <p role="alert" className="notice notice-error mt-2">
            At least one critical path is over its error budget — doc 38 §3: non-essential deploys to that path
            should pause until root cause is fixed. This is a computed flag, not a CI/CD gate — no pipeline in
            this repository reads it automatically today.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900/70">Disaster recovery</h2>
        {dr ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card rounded p-4">
              <dt className="text-xs text-neutral-900/60">RPO</dt>
              <dd className="text-lg font-medium">{dr.rpo.value}</dd>
              <dd className="mt-1 text-xs text-neutral-900/60">{dr.rpo.basis}</dd>
            </div>
            <div className="card rounded p-4">
              <dt className="text-xs text-neutral-900/60">RTO</dt>
              <dd className="text-lg font-medium">{dr.rto.value ?? dr.rto.status}</dd>
              <dd className="mt-1 text-xs text-neutral-900/60">{dr.rto.reason}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </>
  );
}
