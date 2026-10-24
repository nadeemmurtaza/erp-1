# 78 — One HR nav section for twelve tabs: ten already exist, two do not

The promotional list names twelve HR nav tabs: Employees, Attendance,
Onboarding, Payroll, Performance, Documents, Leave Management, Assets,
Reports, Communications, Training, Recruitment. Checking each against
`apps/web/src/components/admin/nav-registry.ts` and this repository's own
documents:

| Tab | Backing capability | Nav entry exists today? |
|---|---|---|
| Employees | doc 20 `Employee` | No dedicated top-level entry |
| Attendance | doc 22/43 `AttendanceEvent` | No dedicated top-level entry |
| Onboarding | doc 28 `JobRequisition`/`Candidate`/`JobApplication` | No dedicated top-level entry |
| Payroll | `PayRun` | Yes — `payroll` nav section (compensation, leave requests, runs, me) |
| Performance | doc 26 performance scoring | No dedicated top-level entry |
| Documents | doc 28 `EmployeeDocument` | No dedicated top-level entry |
| Leave Management | `LeaveRequest`/`LeaveBalance` | Yes — under `payroll/leave` |
| Assets | *(nothing)* | Genuine gap — doc 79 |
| Reports | doc 74's own new tile + existing `reports.controller.ts` exports | Reachable only via the general Reports section, not HR-scoped |
| Communications | doc 61 bulletin board (specified, not yet built) | No entry — depends on doc 61 shipping |
| Training | *(nothing)* | Genuine gap — doc 80 |
| Recruitment | doc 28 `JobRequisition`/`Candidate` | No dedicated top-level entry |

**Ten of twelve tabs already have a real backend capability behind them,
with no nav entry surfacing it — the exact "reachable" requirement
`CLAUDE.md`'s own Definition of Done names: "nav entry + real UI +
permission actually granted to a role, not backend-only."** This document
is that nav consolidation, plus the honest naming of the two capabilities
(Assets, Training) that do not exist anywhere yet and so cannot get a nav
entry pointing at nothing — doc 79 and doc 80 build those first.

## 1. One `hr` nav section, grouping what already exists

```ts
// nav-registry.ts — additive, no existing entries removed; payroll's own
// sub-items move under this section rather than staying a sibling of it,
// since payroll is one HR sub-domain among twelve, not a peer of "HR"
// itself.
{
  key: 'hr',
  label: 'HR',
  icon: 'Users',
  children: [
    { label: 'Employees', href: '/admin/hr/employees' },        // doc 20
    { label: 'Attendance', href: '/admin/hr/attendance' },      // doc 22/43
    { label: 'Onboarding', href: '/admin/hr/onboarding' },      // doc 28
    { label: 'Recruitment', href: '/admin/hr/recruitment' },    // doc 28
    { label: 'Payroll', href: '/admin/payroll/runs' },          // existing
    { label: 'Leave management', href: '/admin/payroll/leave' }, // existing
    { label: 'Performance', href: '/admin/hr/performance' },    // doc 26
    { label: 'Documents', href: '/admin/hr/documents' },        // doc 28
    { label: 'Assets', href: '/admin/hr/assets' },               // doc 79
    { label: 'Training', href: '/admin/hr/training' },           // doc 80
    { label: 'Communications', href: '/admin/hr/bulletins' },   // doc 61, once shipped
    { label: 'Reports', href: '/admin/hr/reports' },             // doc 74 + existing exports, HR-scoped
  ],
}
```

Every child route that already has a real screen elsewhere (`payroll`,
`payroll/leave`) is a redirect/alias into this section, never a duplicated
screen — the nav groups existing routes, it does not fork them.

## 2. "No dead end" — a tab never ships before its screen does

Per `.claude/rules/design.md`'s own "no dead end" law, a nav entry is
added **only** as its target screen ships, in this exact dependency
order: Employees/Attendance/Onboarding/Recruitment/Performance/Documents
(WO-78.1, since their backend already exists — this is a UI-only lift per
tab), then Assets (doc 79) and Training (doc 80) once each ships its own
backend, then Communications once doc 61 ships. A partially-migrated nav
with some children pointing at real screens and others at nothing-yet is
worse than the current flat structure — this work order ships as
complete sub-sections, never a half-built menu.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: navigation reflects existing
permission-gated routes; no new actor.
**Whose rows, and which columns** — each child nav item is visible only
when the viewing user holds the permission its target screen already
requires (`hr.employees.view`, `hr.attendance.view`, etc.) — a nav section
with zero visible children for a given role simply does not render,
matching this repository's own existing nav-visibility discipline.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a navigation change, no new write or approval path.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none / The period that already moved / The second legal entity / Dry run
before live** — n/a: no write, no money/stock fact.
**Three silhouettes** — Solo: most of these twelve tabs are a light touch
(few employees, no formal recruitment pipeline) but still worth a single
consolidated menu rather than twelve scattered links. Chain/Organization:
the consolidation is where it earns its keep — an HR admin managing many
branches' worth of employees needs the whole domain in one place, not
guessing which top-level section hides "Documents."
**The absent collaborator** — with `hr`/`payroll` off, the entire `hr` nav
section does not render (`MOD-1`); with a specific sub-capability off
(e.g., `bom` unrelated, doesn't apply — but e.g. doc 61's bulletin module
off), only that one child is hidden, never a broken link.
**The second copy of the write / The hundred-thousandth row / The
reversal document / The undo fan-out / The version stamp / The erasure
the ledger cannot obey / The failure path** — n/a: this document is a
navigation reorganization, introducing no new write, table, or failure
mode beyond what each linked screen already owns.

## Work orders

**WO-78.1 — nav consolidation**: group existing routes (Payroll, Leave
management) plus new thin list/detail screens for Employees, Attendance,
Onboarding, Recruitment, Performance, and Documents — each a UI-only lift
over a model that already exists (doc 20/22/26/28), gated by that model's
own existing permission.
**WO-78.2 — Reports**: an HR-scoped reports landing page linking to doc
74's own new tile and the existing HR-relevant CSV exports, rather than
requiring an HR admin to hunt through the general Reports section.
**WO-78.3 — Assets/Training/Communications entries**: added only once doc
79, doc 80, and doc 61 each ship their own screen — never added ahead of
their backend, per the "no dead end" law.

## Acceptance

- Every nav child added in WO-78.1 links to a real, permission-gated
  screen — zero dead links, verified by `pnpm check:links`.
- A role with no HR permissions at all sees no `hr` nav section, not an
  empty one.
- Assets/Training/Communications nav entries appear only after their
  respective docs (79/80/61) ship, never before.

## Out of scope

Building Employees/Attendance/Onboarding/Recruitment/Performance/Documents
list-and-detail UI in full detail — each of those screens' own design is
whatever minimal UI its own originating document (20/22/26/28) already
implies; this document scopes only the navigational grouping, not a
re-specification of six existing modules' screens.
