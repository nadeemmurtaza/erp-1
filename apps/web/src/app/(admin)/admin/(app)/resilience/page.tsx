'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney, formatDate } from '@newax/shared';
import { PageHeader, Tabs, DataTable, EmptyState, MetricStrip } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

type ShockKind = 'SupplierDown' | 'LeadTimeShift' | 'LocationDown' | 'DemandShock' | 'CashShock' | 'SkuRecall';

const SHOCK_KINDS: { value: ShockKind; label: string }[] = [
  { value: 'SupplierDown', label: 'Supplier down' },
  { value: 'LeadTimeShift', label: 'Lead-time shift' },
  { value: 'LocationDown', label: 'Location down' },
  { value: 'DemandShock', label: 'Demand shock' },
  { value: 'CashShock', label: 'Cash shock' },
  { value: 'SkuRecall', label: 'SKU recall' },
];

interface RiskRow {
  variantId: string;
  locationId: string;
  projectedOnHand: number;
  daysOfCoverRemaining: number | null;
  stockoutInDays: number | null;
  unmetDemandUnitsPerDay: number;
}

interface RankedAction {
  kind: string;
  description: string;
  cashPreservedMinor: number;
  rupeesSpentMinor: number;
  score: number;
  feasible: boolean;
}

interface PropagationResponse {
  propagation: { perSkuLocation: RiskRow[] };
  rankedActions: RankedAction[];
  narration: { text: string } | null;
}

interface LiquidityForecast {
  currentCashMinor: number;
  scheduledInflows: { date: string; amountMinor: number; source: string }[];
  scheduledOutflows: { date: string; amountMinor: number; source: string }[];
  cashConversionCycleDays: number | null;
}

interface SupplierScorecard {
  otifPct: number;
  priceVariancePct: number;
  defectRatePct: number | null;
}

interface LeadTimeDistribution {
  meanDays: number;
  stdDevDays: number;
  observationCount: number;
}

/**
 * resilience-scalability/144-supply-chain-resilience-planning-engine.md
 * WO-144.8 — a shock scenario runner, a liquidity forecast, and a supplier
 * scorecard lookup, each a read/recommendation over rows this deployment
 * already writes for its own reasons — this engine never acts on its own,
 * every recommended action still executes through its own existing,
 * already-permissioned service call.
 */
export default function ResiliencePage() {
  const { can } = useAdminSession();
  const canView = can('planning.propagation.view');

  const [kind, setKind] = useState<ShockKind>('DemandShock');
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [pctChange, setPctChange] = useState('20');
  const [amountMinor, setAmountMinor] = useState('');
  const [includeNarration, setIncludeNarration] = useState(false);
  const [result, setResult] = useState<PropagationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [liquidity, setLiquidity] = useState<LiquidityForecast | null>(null);
  const [liquidityLoaded, setLiquidityLoaded] = useState(false);

  const [scorecardSupplierId, setScorecardSupplierId] = useState('');
  const [scorecard, setScorecard] = useState<SupplierScorecard | null>(null);
  const [leadTime, setLeadTime] = useState<LeadTimeDistribution | null>(null);

  const runPropagation = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { kind, includeNarration };
      if (supplierId) body.supplierId = supplierId;
      if (locationId) body.locationId = locationId;
      if (variantId) body.variantId = variantId;
      if (pctChange) body.pctChange = Number(pctChange);
      if (amountMinor) body.amountMinor = Number(amountMinor);

      const res = await adminFetch<PropagationResponse>('/admin/planning/propagate', { method: 'POST', body });
      setResult(res);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run this scenario');
    } finally {
      setBusy(false);
    }
  };

  const loadLiquidity = () => {
    setLiquidityLoaded(true);
    adminFetch<LiquidityForecast>('/admin/planning/liquidity-forecast', { query: { horizonDays: 30 } })
      .then(setLiquidity)
      .catch(() => setLiquidity(null));
  };

  const loadScorecard = async () => {
    if (!scorecardSupplierId.trim()) return;
    const [sc, lt] = await Promise.all([
      adminFetch<SupplierScorecard>(`/admin/planning/suppliers/${scorecardSupplierId}/scorecard`),
      adminFetch<LeadTimeDistribution>(`/admin/planning/suppliers/${scorecardSupplierId}/lead-time-distribution`),
    ]);
    setScorecard(sc);
    setLeadTime(lt);
  };

  if (!canView) {
    return (
      <EmptyState
        title="No access"
        description="Viewing resilience planning needs the planning.propagation.view permission."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Resilience Planning"
        description="Run a shock scenario over the supply-chain dependency graph, see ranked recovery actions, the liquidity forecast, and supplier scorecards."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <Tabs
        label="Resilience planning sections"
        items={[
          {
            key: 'scenario',
            label: 'Shock scenario',
            content: (
              <div>
                <div className="card p-6 mb-6 max-w-xl space-y-3">
                  <label className="block">
                    <span className="field-label">Shock kind</span>
                    <select className="field-input w-full" value={kind} onChange={(e) => setKind(e.target.value as ShockKind)}>
                      {SHOCK_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {kind === 'SupplierDown' || kind === 'LeadTimeShift' ? (
                    <label className="block">
                      <span className="field-label">Supplier id</span>
                      <input className="field-input w-full" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} />
                    </label>
                  ) : null}
                  {kind === 'LocationDown' ? (
                    <label className="block">
                      <span className="field-label">Location id</span>
                      <input className="field-input w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)} />
                    </label>
                  ) : null}
                  {kind === 'DemandShock' || kind === 'SkuRecall' ? (
                    <label className="block">
                      <span className="field-label">Variant id</span>
                      <input className="field-input w-full" value={variantId} onChange={(e) => setVariantId(e.target.value)} />
                    </label>
                  ) : null}
                  {kind === 'DemandShock' ? (
                    <label className="block">
                      <span className="field-label">% change</span>
                      <input className="field-input w-full" type="number" value={pctChange} onChange={(e) => setPctChange(e.target.value)} />
                    </label>
                  ) : null}
                  {kind === 'CashShock' ? (
                    <label className="block">
                      <span className="field-label">Amount (paisa)</span>
                      <input className="field-input w-full" type="number" value={amountMinor} onChange={(e) => setAmountMinor(e.target.value)} />
                    </label>
                  ) : null}

                  <label className="field-check">
                    <input type="checkbox" checked={includeNarration} onChange={(e) => setIncludeNarration(e.target.checked)} />
                    <span>Include a narrated summary</span>
                  </label>

                  <button className="btn-primary" disabled={busy} onClick={runPropagation}>
                    Run scenario
                  </button>
                </div>

                {result ? (
                  <>
                    <MetricStrip
                      label="Scenario summary"
                      className="mb-6"
                      items={[
                        { key: 'rows', label: 'At-risk SKU/locations', value: String(result.propagation.perSkuLocation.length) },
                        { key: 'actions', label: 'Recommended actions', value: String(result.rankedActions.length) },
                        {
                          key: 'top',
                          label: 'Top action preserves',
                          value: formatMoney(result.rankedActions[0]?.cashPreservedMinor ?? 0),
                        },
                      ]}
                    />

                    {result.narration ? <p className="notice notice-info mb-6">{result.narration.text}</p> : null}

                    <div className="overflow-hidden mb-8">
                      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">At-risk SKU / locations</h2>
                      <DataTable
                        rows={result.propagation.perSkuLocation}
                        rowKey={(r) => `${r.variantId}-${r.locationId}`}
                        emptyLabel="No SKU/location rows are affected by this scenario."
                        columns={[
                          { header: 'Variant', cell: (r) => r.variantId, muted: true },
                          { header: 'Location', cell: (r) => r.locationId, muted: true },
                          { header: 'On hand', align: 'end', numeric: true, cell: (r) => r.projectedOnHand },
                          {
                            header: 'Stockout in',
                            cell: (r) => (r.stockoutInDays === null ? '—' : `${Math.round(r.stockoutInDays)} day(s)`),
                          },
                        ]}
                      />
                    </div>

                    <div className="overflow-hidden">
                      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">Ranked recovery actions</h2>
                      <DataTable
                        rows={result.rankedActions}
                        rowKey={(a, i) => `${a.kind}-${i}`}
                        emptyLabel="No candidate actions were generated for this scenario."
                        columns={[
                          { header: 'Action', cell: (a) => a.description || a.kind },
                          { header: 'Preserves', align: 'end', numeric: true, cell: (a) => formatMoney(a.cashPreservedMinor) },
                          { header: 'Costs', align: 'end', numeric: true, cell: (a) => formatMoney(a.rupeesSpentMinor) },
                        ]}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            ),
          },
          {
            key: 'liquidity',
            label: 'Liquidity forecast',
            content: (
              <div>
                {!liquidityLoaded ? (
                  <button className="btn-primary" onClick={loadLiquidity}>
                    Load 30-day forecast
                  </button>
                ) : !liquidity ? (
                  <p className="notice notice-error">Could not load the liquidity forecast.</p>
                ) : (
                  <>
                    <MetricStrip
                      label="Liquidity summary"
                      className="mb-6"
                      items={[
                        { key: 'cash', label: 'Current cash', value: formatMoney(liquidity.currentCashMinor) },
                        {
                          key: 'ccc',
                          label: 'Cash conversion cycle',
                          value: liquidity.cashConversionCycleDays === null ? '—' : `${Math.round(liquidity.cashConversionCycleDays)} days`,
                        },
                      ]}
                    />
                    <div className="overflow-hidden mb-8">
                      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">Scheduled inflows</h2>
                      <DataTable
                        rows={liquidity.scheduledInflows}
                        rowKey={(e, i) => `in-${i}`}
                        emptyLabel="No scheduled inflows in this window."
                        columns={[
                          { header: 'Date', cell: (e) => formatDate(e.date), muted: true },
                          { header: 'Source', cell: (e) => e.source },
                          { header: 'Amount', align: 'end', numeric: true, cell: (e) => formatMoney(e.amountMinor) },
                        ]}
                      />
                    </div>
                    <div className="overflow-hidden">
                      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">Scheduled outflows</h2>
                      <DataTable
                        rows={liquidity.scheduledOutflows}
                        rowKey={(e, i) => `out-${i}`}
                        emptyLabel="No scheduled outflows in this window."
                        columns={[
                          { header: 'Date', cell: (e) => formatDate(e.date), muted: true },
                          { header: 'Source', cell: (e) => e.source },
                          { header: 'Amount', align: 'end', numeric: true, cell: (e) => formatMoney(e.amountMinor) },
                        ]}
                      />
                    </div>
                  </>
                )}
              </div>
            ),
          },
          {
            key: 'suppliers',
            label: 'Supplier scorecard',
            content: (
              <div>
                <div className="card p-6 mb-6 max-w-xl space-y-3">
                  <label className="block">
                    <span className="field-label">Supplier id</span>
                    <input className="field-input w-full" value={scorecardSupplierId} onChange={(e) => setScorecardSupplierId(e.target.value)} />
                  </label>
                  <button className="btn-primary" onClick={loadScorecard}>
                    Look up
                  </button>
                </div>

                {scorecard ? (
                  <MetricStrip
                    label="Supplier scorecard"
                    items={[
                      { key: 'otif', label: 'On-time-in-full', value: `${scorecard.otifPct.toFixed(1)}%` },
                      { key: 'variance', label: 'Price variance', value: `${scorecard.priceVariancePct.toFixed(1)}%` },
                      {
                        key: 'leadtime',
                        label: 'Lead time',
                        value: leadTime ? `${leadTime.meanDays.toFixed(1)} ± ${leadTime.stdDevDays.toFixed(1)} days` : '—',
                      },
                    ]}
                  />
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
