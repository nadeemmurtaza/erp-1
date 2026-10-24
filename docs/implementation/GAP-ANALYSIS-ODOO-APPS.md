# Gap analysis: Odoo's app catalog vs. this repo

**What this is.** A roadmap reference, not a work order: a check of
Odoo's own published app list against this repository's actual schema and
code, done 2026-09-26. It records **what is missing today**, so a future
scoping pass has a starting inventory instead of re-discovering these gaps
from scratch. Nothing here is built, scheduled, or scoped as a numbered
work order — each bullet is a candidate for its own future document in the
matching `docs/implementation/<domain>/` folder (or a new domain folder,
for the categories with no home yet), carrying its own Work Orders and
Scope Lenses when someone actually picks it up, per `CLAUDE.md`'s own
"Feature scope: build the whole capability" discipline.

Checked directly against the schema and code. Odoo is a general business-OS
platform (website builder, no-code app builder, VOIP, IoT); this repo is a
deliberately-scoped retail/apparel ERP + storefront. Some gaps below are
genuinely out of this repo's own stated scope, not oversights — called out
explicitly rather than left ambiguous.

## Website / eCommerce

- **Website** (drag-and-drop site builder) — not built, and arguably out of
  scope: this repo's storefront (`apps/web`) is a coded Next.js app with a
  CMS (`content` module: pages, banners, blog) editable by content, not a
  builder that assembles arbitrary page layouts.
- **eCommerce** — built, extensively (catalog, cart, checkout, orders,
  payments, promotions, gift cards, loyalty).
- **Blog** — built (`content.prisma`'s `BlogPost`).
- **Forum** — not built.
- **eLearning** — not built. No `Course` model anywhere.
- **Live Chat** — not built. `OnsiteMessage` exists but is a targeted
  popup/banner system for marketing (page-pattern-triggered announcements),
  not a live two-way chat widget.

## Sales

- **CRM** — built, though narrower than Odoo's: `Lead` exists with a plain
  status enum; there is no separate `Opportunity` stage/pipeline concept
  between a lead and a converted order (already flagged in
  `GAP-ANALYSIS-ERP-FEATURE-COMPARISON.md`).
- **Sales** (quotation → invoice) — built (`orders`, `tradingpartners`
  quotes).
- **Point of Sale** — built, extensively (`pos` module: shifts, sales,
  instalments, cash management, receipts).
- **Subscriptions** (recurring customer billing / renewals) — not built
  for *products*. `platform` has usage-based billing for tenants of this
  software itself (doc 153), which is a different thing — no
  customer-facing recurring order/subscription-box mechanism exists.
- **Rental** (contracts, deliveries, returns of rented goods) — not built.

## Finance

- **Accounting** — built (chart of accounts, journal entries, fiscal
  periods, GL reports).
- **Invoicing** — built (orders carry their own invoice/receipt data).
- **Expenses** (employee expense claims) — built (`finance.prisma`'s
  `ExpenseCategory`/`Expense`).
- **Documents** (a real DMS — folders, workspaces, tags, approval
  workflows on files) — not built. File storage exists (`StorageDriver`)
  but as attachment plumbing for other records, not a browsable document
  library.
- **Spreadsheets** — not built.
- **Sign** (e-signature on documents) — not built.
- **ESG** (sustainability metric tracking/reporting) — not built.

## Inventory & Manufacturing

- **Inventory** — built.
- **Manufacturing** (orders & BOMs) — built (`bom` module).
- **PLM** (product lifecycle / engineering change orders on a BOM) — not
  built.
- **Purchase** — built.
- **Maintenance** (equipment/asset preventive-maintenance requests) — not
  built. `hr.assets` tracks an asset *assigned to an employee* (a laptop, a
  phone); it does not track equipment maintenance schedules or requests.
- **Quality** (inspection checkpoints in a production or receiving flow) —
  not built. Stock counts/spot-checks exist for inventory accuracy, not
  formal quality-control checkpoints.

## Human Resources

- **Employees** — built (`hr` module: positions, postings, ranks, org
  tree).
- **Recruitment** (job postings, candidate pipeline) — not built.
- **Time Off** — built (`payroll`'s leave requests/balances).
- **Appraisals** (performance reviews) — not built.
- **Payroll** — built.
- **Referral** (employee referral program) — not built.
- **Fleet** (vehicle tracking, costs) — not built.

## Marketing

- **Marketing Automation** — partially: `marketing` has campaigns and
  segments, not a visual automated-drip-sequence builder.
- **Email Marketing** — built (`EmailChannel`, `Campaign`).
- **SMS Marketing** — built (`SmsChannel`, campaign channel).
- **Social Marketing** (manage social posts/inbox) — not built.
- **Events** (ticketed event publishing/sales) — not built.
- **Survey** — not built.

## Services

- **Project** (general project planning with milestones) — not built as
  a general concept; `tasks` (doc 23, built) tracks work items assigned to
  a post, not a project with phases/milestones/a Gantt view.
- **Timesheet** — not built. No time-against-task logging exists.
- **Field Service** (scheduled onsite work with time/material tracking) —
  not built.
- **Helpdesk** — scoped as `tasks-notifications-support/64-help-desk-support-ticketing.md`
  (internal ticketing) and `148-external-customer-support-portal.md`
  (customer-facing ticketing); check those two documents' own `Status:`
  note for whether they have since been built.
- **Planning** (general employee-schedule builder) — partial: `attendance`
  has shift scheduling, not a cross-department resource planner.
- **Appointments** (generic booking) — partial and vertical-specific:
  `stitching` has its own booking flow for tailoring appointments; there is
  no generic "book any kind of meeting slot" system.

## Productivity

- **Discuss** (real-time internal chat/channels) — not built.
  `tasks-notifications-support/24-internal-notifications-meetings-escalation.md`
  adds internal announcements/meetings/escalation, which is asynchronous
  notification, not live chat — check that document's own `Status:` note.
- **Approvals** — built, as a generic engine (`ApprovalChain`/`ApprovalStep`,
  doc 63), reused across requisitions, wallet adjustments, B2B orders, and
  (pending doc 24 above) broadcast messages — arguably more reusable than
  Odoo's own per-app approval flows, though with no single unified
  "approvals inbox" screen across every subject type yet.
- **Internet of Things** — not built, and out of scope: nothing here talks
  to physical devices except the existing camera-based attendance
  extension point (doc 30/85), which is a narrow, named exception, not a
  general IoT platform.
- **VOIP** — not built, and out of scope: this repo has no telephony
  integration of any kind.
- **Knowledge** (an internal wiki) — not built.
- **AI** — partially built: `AiProvider` (doc 09) and RAG (doc 35/121) exist
  for embeddings/retrieval and an AI-assisted WhatsApp responder; there is
  no general-purpose "AI agent" builder across every app the way Odoo's own
  AI app frames it.

## Customization

- **Studio** (no-code app/field/workflow builder) — not built as a unified
  builder. Pieces of the same idea exist separately and unevenly: custom
  fields (`custom-fields` module), a generic EAV model and metadata-driven
  form renderer (architecture-patterns 140/141), and BPMN workflow
  definitions — but no single "Studio" screen ties them into one no-code
  app-building experience.

## Bottom line

This repo covers the commerce/retail/finance/HR core deeply — often more
rigorously than a generic platform (real permission-scoped module
independence, an actual outbox-based event system, real tenant/branch
isolation model). What it does not have is Odoo's *breadth* into adjacent
categories: content/community (Forum, eLearning, Knowledge, Live Chat),
document collaboration (Documents, Spreadsheets, Sign), a few HR
sub-modules (Recruitment, Appraisals, Referral, Fleet), Services'
project/timesheet/field-service trio, and the platform-level features
(Website builder, Studio, IoT, VOIP) that make Odoo a general business-OS
rather than a focused vertical ERP — which is this repo's own deliberate
choice, not an oversight, per `CLAUDE.md`'s own scope.
