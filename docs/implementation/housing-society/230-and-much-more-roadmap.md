# 230 — "And much more": roadmap and extension points

> **Industry-specific module.** This belongs to the **housing-society sector pack** (real estate / society management), not to `core`. It is enabled only in housing-society deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned, sequenced.** None is in the first release. Each is a **new
> module attached to an extension point or event the first release already
> ships** — never a rewrite. Rule for all: absent → the pack still boots and
> runs; vendor down → degrade honestly, never block a member.

| # | Service | Attaches through | Notes and failure mode |
|---|---|---|---|
| 1 | **Maintenance / society charges billing** (monthly, per plot size, arrears) | `SocietyCharge` + `society-billing` schedule | The biggest next module for a *developed* society; reuses installments and dunning. Failure: rule missing → no bill, alert. |
| 2 | **Utility billing** (water, electricity, gas via meter reads) | new `society-utilities` + `SocietyCharge` | Meter-reading import (Excel) then IoT later; bills land as installments. |
| 3 | **Online payments** (cards, wallets, bank) | core `payments` gateway; receipt callback (doc 225) | Gateway down → office/bank transfer; idempotent by gateway ref. Refund fix prerequisite (partial-refund reversal gap). |
| 4 | **SMS / WhatsApp / email** reminders, receipts, notices | `NotificationChannel` (doc 33) | Consent per member; undelivered → in-portal notice, dead-letter list. |
| 5 | **Resident / member mobile app** | portal API (own-row scope) | Same API as the portal; no new auth model. |
| 6 | **Dealer / agent & commission** | key-hash principal (doc 34 pattern) + `PaymentVoucher(kind=COMMISSION)` | Commission rules versioned; clawback on cancel via reversal document. |
| 7 | **Lead / CRM & site visits** | core `crm` + `plots.hold` | Prospect → hold → booking. |
| 8 | **Development progress & milestone tracking** | `society-property` + milestone installments | Drives milestone-based billing; photos and % per phase. |
| 9 | **Possession, conveyance and registry documents** | document templates + `PlotDocument` | Per-jurisdiction templates as data; filing itself is a legal process, not automated. |
| 10 | **Society elections / voting, notices, meetings** | core `tasks`/notifications meetings (doc 24) | Eligibility = member in good standing (no dues beyond X). |
| 11 | **Amenity / clubhouse booking** | new `society-amenities` + charges | Slot booking with deposit. |
| 12 | **Staff, security and payroll** | core `hr`, `attendance`, `payroll` | Already exist; this pack only adds roles. |
| 13 | **Vendor & contractor management, work orders** | core `purchasing`, `tasks` | Development expenses against project cost centre. |
| 14 | **Gate hardware** (barrier, RFID/QR, ANPR) | `VisitorPass` code + a gate-device extension point | Same pass code works for QR and NFC; no driver ships. |
| 15 | **Multi-project / multi-society** | `projectId`/`organizationId` from migration one | A group of societies = separate legal entities with own series and COA; two societies that must not see each other's members are two *organizations/brands*. |
| 16 | **Analytics & AI** (default prediction, collection forecasting, document extraction for import) | `AiProvider`, behind interfaces | Always optional; a recommendation never changes a record without staff action. |
| 17 | **Government / authority reporting** (tax, registry, regulators) | `tax` module + report templates | Jurisdiction-specific formats as data. |

## Sequencing

1. Maintenance billing (1) → utilities (2): the recurring-revenue pair for developed societies.
2. Online payments (3) + notification channels (4): remove cash friction and chasing.
3. Dealer commission (6) and CRM (7) for sales-led societies, ahead of 1–2 for a society still selling.
4. Mobile app (5), amenities (11), voting/meetings (10) as engagement features.
5. Hardware (14), IoT (2), AI (16) when a client names the trigger.

Each becomes its own numbered work order with its own `feature-scope` pass
before building. This document records the door each one walks through, and
deliberately scopes none of them.
