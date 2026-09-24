# 41 — Pending versus disbursed payroll, tracked separately

`PayRunStatus` today is `DRAFT → APPROVED → POSTED`, and `POSTED` quietly
does two different jobs at once: it means "the GL entry exists" and it is
treated as meaning "the money left the bank," because `hr.payroll_run_posted`'s
posting rule credits `1000 Cash & Bank` in the same transaction that marks
the run posted. Those are two different real-world events the moment
disbursement is a bank transfer batch that clears hours or days after
approval, not a machine that pays 200 people the instant a button is
clicked. This document adds the one status this repository is missing
between "posted" and "actually paid," and the dashboard that was asked for
sits directly on top of it — no new metric to invent, once the status
exists.

## 1. A pay run is disbursed once the bank confirms it, not once it is posted

```prisma
// payroll.prisma

enum PayRunStatus {
  DRAFT
  APPROVED
  POSTED
  DISBURSED
}
```

`POSTED` now means exactly what it always should have: the GL entry exists
and the amount owed is fixed. `DISBURSED` is a separate transition, set
once the actual payment method confirms — a bank batch file's own
acknowledgement, a manual "mark as paid" for cash payroll, or (doc 49) a
disbursement-partner API's own settlement callback. The Dr/Cr posting rule
itself is unchanged: it already correctly recognises the liability at
`POSTED` (crediting `2300 Salaries Payable` when disbursement is not
instant would be the more correct fix, but that is doc 19/25's own posting
rule, not reopened here) — this document only adds the status transition
and the dashboard reading it, never touches the ledger entries themselves.

```prisma
model PayRun {
  // existing fields unchanged
  disbursedAt DateTime?
}
```

## 2. Pending versus disbursed is a query over existing rows, not a new table

```ts
async pendingVsDisbursed(period: { start: Date; end: Date }) {
  const runs = await this.prisma.payRun.findMany({
    where: { periodStart: { gte: period.start }, periodEnd: { lte: period.end } },
    include: { _count: { select: { lines: true } } },
  });
  const pending = runs.filter((r) => r.status === 'POSTED');
  const disbursed = runs.filter((r) => r.status === 'DISBURSED');
  return {
    pending: { batches: pending.length, headcount: sum(pending, 'lines'), amountMinor: sum(pending, 'netMinor') },
    disbursed: { batches: disbursed.length, headcount: sum(disbursed, 'lines'), amountMinor: sum(disbursed, 'netMinor') },
  };
}
```

No new schema beyond `disbursedAt`/the enum value above — the headcount and
amount figures this dashboard shows are exactly `PayRunLine` and
`PayRunLine.netMinor`, already stored, grouped by the one status this
document adds.

## Scope lenses

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: no new actor, no new grant.
**Whose rows, and which columns** — the pending/disbursed dashboard is
scoped to the caller's subtree exactly as every other payroll screen
already is; amounts require `hr.compensation.view`, headcount alone does
not, mirroring doc 25's own "a departmental list shows that an advance
exists without showing its size."
**The threshold nobody approves alone** — n/a: marking a run disbursed is
a status transition recording a fact (the bank confirmed), not a new
authority to commit money — the money already committed at `POSTED`.
**The toxic pair** — n/a.
**Authority and blast radius** — who may mark a run `DISBURSED` manually
(for a cash/manual payroll with no bank confirmation callback) — a
narrower permission than `hr.payroll.run` itself, since falsely marking an
undisbursed run as paid is the one way this status could mislead a
reconciliation.
**Audience is a capability, not an address** — n/a beyond the existing
payroll dashboard audience.
**Request or record** — the `DISBURSED` transition is a RECORD once the
bank or manual confirmation actually happened — never refused, since the
money has, in fact, already moved by the time this status is set; it can
only be late, never wrong to write.
**The movement with no address / The unwritten posting rule / Every column
or none / The period that already moved** — n/a: this document posts no
new `JournalLine` and changes no existing posting rule.
**The second legal entity** — the dashboard scopes by brand/organization
exactly as every other cross-run payroll report already does.
**Dry run before live** — `pendingVsDisbursed()` above is itself already a
pure read with no side effect; there is nothing to preview beyond what it
already shows live.
**Three silhouettes** — Solo: one pay run at a time, the distinction rarely
matters. Chain: a payroll batch per brand, disbursement lag genuinely
tracked. Organization: cross-brand pending/disbursed totals, the
dashboard's real reason to exist.
**The absent collaborator** — with `payroll` module rows simply absent (no
runs), the dashboard renders its own zero-state, never an error.
**The second copy of the write** — a bank confirmation callback (doc 49)
that fires twice for the same run sets `disbursedAt` idempotently — the
second call is a no-op against an already-`DISBURSED` run, not a second
write.
**The hundred-thousandth row** — n/a beyond `PayRun`'s own existing volume,
already bounded by `[status, periodStart]`.
**The reversal document** — n/a: disbursement is not itself reversed; a
failed bank transfer discovered after `DISBURSED` was set in error is
corrected via a note and a manual status correction with an audit row
carrying old/new value, the same "authority and blast radius" pattern
every status correction in this document set already uses.
**The undo fan-out / The version stamp** — n/a: a status field with no
downstream automatic effect beyond the dashboard reading it.
**The erasure the ledger cannot obey** — n/a: no new personal data.
**The failure path** — a bank confirmation callback that cannot be matched
to a `PayRun` (doc 49's own concern) lands in that document's own
dead-letter queue, never silently marks the wrong run disbursed.

## Work orders

**WO-41.1 — schema**: `DISBURSED` added to `PayRunStatus`, `disbursedAt`
on `PayRun`.
**WO-41.2 — `pendingVsDisbursed()`** read, scoped by subtree.
**WO-41.3 — manual disbursement marking** for cash/manual payroll, gated
by a narrower permission than `hr.payroll.run`.
**WO-41.4 — UI**: a tile on the existing payroll dashboard (doc 19's own
screen, extended, not a new page) showing pending vs. disbursed batches,
headcount and amount.

## Acceptance

- A `POSTED` run never appears in the disbursed total until `disbursedAt`
  is actually set.
- The dashboard's headcount and amount figures reconcile exactly to
  `PayRunLine` rows for the runs counted, proven by a spec that sums both
  independently.
- Manually marking a run disbursed requires its own, narrower permission,
  distinct from `hr.payroll.run`.

## Out of scope

Automated bank-confirmation ingestion — that is doc 49's own scope; this
document only adds the status the confirmation would set. Partial
disbursement (some employees paid, others pending within the same run) —
named as a real future need if a client's actual payment process fragments
a batch, not assumed here.
