# 254 — Office replacement: documents, spreadsheets, presentations, mail and calendar

> **Status: Investigated (2026-10-11). A program map and tranche breakdown,
> not a brief.** Nothing here is built and nothing here is a work order. This
> scopes the program the owner put in scope in
> [doc 253](./253-distribution-stack-capability-map.md) §7 Q3, option (a):
> a native word processor, spreadsheet, presentation editor, mail client and
> calendar client. Every claim about the code was checked against the
> repository on the date above (§1.3). Each tranche gets its own brief
> (schema, work orders, scope-lens map, exact parameters). The editor
> tranches wait for the owner's answer to OQ1 (§3, §8).
>
> **No ADR is written for this pass.** This follows doc 253's precedent:
> nothing here is yet an irreversible decision. The question that changes the
> program's cost most is put to the owner (OQ1), not decided. The seven
> engineering decisions the program waits on are ADR candidates in §9. Each
> is written with the brief that first depends on it
> (`.claude/rules/decisions.md`).

## 1. Why this needs its own document

### 1.1 The decision it implements

Doc 253 left row I6 (office documents and spreadsheets) and the client side
of row I5 (mail and calendar) as §7 Q3, "the largest scope question in this
map". The owner resolved it on 2026-10-11 as option (a), full Office
replacement. The resolution says what doc 253 did not do:

> This is the single largest scope item in this map — a word processor,
> spreadsheet, presentation editor and mail/calendar client are each their
> own multi-tranche program, not a row inside XC. **Not scoped here.** XC's
> I6/I5 entries in §6.2 name the rows; a program of this size needs its own
> doc-of-record and its own tranche breakdown before a brief is written, the
> same way docs 236 and 245 exist before their work orders do.

This document is that doc-of-record. Its relation to doc 253 matches
[doc 236](./supply-chain-operations/236-supply-chain-operations-architecture.md)'s
relation to docs 237–244, and
[doc 245](./supply-chain-operations/245-field-sales-distribution-architecture.md)'s
to docs 246–248. It decides the program's shape, its dependencies and its
order. The briefs decide everything else.

### 1.2 What is in the program, and what is not

| Surface             | Plays the role of, for staff leaving Microsoft 365 | Tranche |
| ------------------- | -------------------------------------------------- | ------- |
| Word processor      | Word                                               | XW1     |
| Spreadsheet         | Excel                                              | XW2     |
| Presentation editor | PowerPoint                                         | XW3     |
| Mail client         | Outlook mail                                       | XW4     |
| Calendar client     | Outlook calendar                                   | XW5     |
| Shared foundation   | (the editing engine, sessions, file library)       | XW0     |

**Not in this program.** Each stays where doc 253 or its own document put it:

- **I8 enterprise document management** stays `documents`, doc 253 foundation
  X0.6. This program is its largest consumer and puts requirements on its
  brief (§4.3). It does not scope it.
- **I4 internal chat** stays in XC as NEW. Teams' chat half is not a document
  surface.
- **I7 e-signature** stays in XC, over `documents`. An authored document is
  signable through it, and nothing is duplicated here.
- **I1 knowledge base** stays in XC, on the CMS block model plus `rag`, as
  doc 253 row I1 says. §2.2 explains why that model is right for a wiki and
  wrong for a document.
- **The mail server** stays Stalwart, per
  [doc 13](./integrations-connectivity/13-email-service-plan.md) and
  [doc 233](./launchpad-apps/233-mail-app.md). Video stays
  [doc 205](./tasks-notifications-support/205-self-hosted-video-meetings-livekit.md).
  Bulk mail stays `marketing`.

### 1.3 Method, and how long it stays true

Checked on 2026-10-11 against:

- HEAD `92d2cc3d28c068bb`, with `docs/index/` current (221 pages,
  `63945ced1e24a787`, per `pnpm index:check`);
- the Prisma schema files cited in §2, `module-packs.ts`,
  `modules.registry.ts`, and the dependency lists of all five
  `package.json` files;
- the code paths cited by file and line in §2;
- the documents of record:
  - docs 253, 236, 245, 13, 24 and 205;
  - docs 231, 232, 233 and 235;
  - docs 28, 54, 35, 139, 142 and 229;
  - ADRs 049, 054, 060, 074 and 080;
  - `MULTI-SECTOR.md`, `ENTERPRISE-SCALE.md`, `RETAIL-ERP.md` R2,
    `GAP-ANALYSIS-ODOO-APPS.md` and the canonical rulings
    (`docs/erp-lenses/_meta/_canonical-decisions.md`).

As doc 253 §1.5 warns, a build-status claim in this folder stays accurate for
days. Re-verify any row in §2 before acting on it.

### 1.4 Where it lives, and why it is numbered

254 is the next free number. No file numbered 254 or higher exists on any
local or remote branch, and no document reserves the number. Like doc 253,
this file sits at the root of `docs/implementation/`. It spans `documents`,
`notify`, `mail`, `rag`, `core/storage`, `core/notifications` and three new
modules, so no single domain folder owns it. Briefs it spawns go in their
domain folders and trace back here ("doc 254 XW2").

Tranche ids use **XW**. The X keeps them clear of doc 236's SC0, W, O, E, Q,
M, R, N and doc 245's F, as doc 253's X tranches are. The W stands for
workspace, chosen because "XO" reads as doc 253's X0.

## 2. What already exists, verified, and what this program must reuse

### 2.1 Documents and storage

| What                               | Where                                                                                                                                     | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I8 `documents`                     | `apps/api/src/modules/*/`, `module-packs.ts`, `apps/api/prisma/schema/*.prisma`                                                           | **Not built.** No module, no `MODULE_PACKS` entry, and no document model except `rag`'s `DocumentSource`/`DocumentChunk`. Doc 253 row I8 is NEW, foundation X0.6, with no brief                                                                                                                                                                                                                                                                                                                                          |
| The "documents" setting            | `settings-admin.controller.ts:31-43`, `SettingKey.Documents`                                                                              | Logo source and number prefixes for generated receipts and invoices. Not a store                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Doc 28's vault, doc 54's watcher   | [doc 28](./hr-people-org/28-recruitment-onboarding-document-vault.md), [doc 54](./hr-people-org/54-employee-document-lifecycle-alerts.md) | Unbuilt: no `EmployeeDocument`. `rag-corpus.service.ts:37-44` says so. Doc 253 makes both consumers of I8                                                                                                                                                                                                                                                                                                                                                                                                                |
| `StorageService` / `StorageDriver` | `core/storage/storage.service.ts`, `storage.driver.ts`                                                                                    | One front door. The driver is picked by `STORAGE_DRIVER` in a ternary (`storage.service.ts:38`), not a registry. `put()` takes a whole `Buffer` (`storage.driver.ts:17-23`). `putDocument()` accepts images and PDF only, capped at the 8 MiB `MAX_IMAGE_BYTES` (`storage.service.ts:10,18,108-123`). No streaming, versioning or private object class                                                                                                                                                                   |
| The public file route              | `core/storage/files.controller.ts`, `local-storage.driver.ts`, `s3-storage.driver.ts`                                                     | The local driver serves **every** key at a `@Public()` `GET files/*path` (`files.controller.ts:30`). Only `rag-sources/` is refused (line 47). Every response is `Cache-Control: public, max-age=31536000, immutable` (line 62). Keys carry four random bytes (`local-storage.driver.ts:80`). `signedUrlFor()` falls back to the public URL (lines 53-57). S3 uses one bucket with one public base URL (`s3-storage.driver.ts:69-72`) and the same cache header (line 53). Production runs `local` (README "Known gaps") |
| Office formats, PDFs, editors      | the five `package.json` files                                                                                                             | None. `apps/api` has `pdfjs-dist` (reads PDFs, for `rag`), `csv-parse`, `csv-stringify` and `sanitize-html`. `apps/web` has `bpmn-js` and `recharts`. Nothing reads or writes OOXML or ODF, generates a PDF, or edits rich text                                                                                                                                                                                                                                                                                          |

### 2.2 The CMS block model, and why it is not the document model

**The facts.**

- `ContentBlock` is a union of six types (`packages/shared/src/content-blocks.ts:10-16`):
  `richtext` (an HTML string), `image`, `product_grid`, `banner`, `faq` and
  `video`.
- The body is stored as `Json` on `PageTranslation.body` and
  `BlogPostTranslation.body`, one body per locale
  (`content.prisma:46,83`).
- `richtext` is sanitised server-side to 18 tags
  (`content-sanitizer.ts:28-31`), with `class`, `href` and `src` as the only
  attributes (lines 33-37). There is no `table`, no `h1`, no `pre`/`code` and
  no `sub`/`sup`.
- It is rendered by a server component that fetches products and banners per
  block (`block-renderer.tsx:58-86`).
- There is no version history, no page geometry, no comment anchor and no
  concurrent editing.

**Ruling: not a usable foundation for an authored document. It is the right
shape for what it does.** Six reasons, each from the facts:

1. **Its unit is a composed web page, not a paginated document.** It has no
   page size, margins, headers, footers, sections, page breaks or footnotes.
   Those are what a Word user prints, signs and sends.
2. **Its text is an opaque string.** A sanitised HTML blob gives a comment or
   a tracked change nothing structural to anchor to. Two people editing it at
   once can only be resolved by last-writer-wins. Co-authoring needs a
   structured model.
3. **Two of its six types are storefront commerce.** `product_grid` and
   `banner` resolve catalogue slugs and banner placements. A document model
   for every department should not carry `catalog` concepts.
4. **It is a translation set.** One body per locale is right for a storefront
   page. A letter or a contract is one artefact, sometimes bilingual within
   itself.
5. **Its allow-list is a security control** against stored XSS, not a
   formatting choice (the file's own dependency block). Widening it to carry
   Word semantics would weaken a storefront control to serve a different job.
6. **Spreadsheets and slides have no block analogue at all.**

**Consequence.** CMS blocks stay the model for storefront pages and, per
doc 253 row I1, internal knowledge pages. Office documents are I8 objects in
their own format (§3). The two meet only by reference. A future `document`
block type could embed a published, read-only rendition of an I8 document in
a page; under the file's own rule that is a change to `CONTENT_BLOCK_TYPES`
plus its renderer. It is named here so the two models are never merged later.
No tranche proposes it.

### 2.3 Mail

| What                               | Where                                                                  | Finding                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The mail engine                    | `docker-compose.mail.yml`, `docs/email.md`                             | Stalwart `v0.13.4` (line 36) runs as its own Coolify resource. Its metadata is in its own Postgres database, and message bodies are on a local volume (line 22). The file header names SMTP, IMAP and JMAP. Doc 13 is the business intent; doc 205's premise 3 says this compose file is the mechanism                                       |
| Business mailboxes                 | `core.prisma:375-386` `EmailAccountPurpose`, `EmailAccount`            | Shared senders by purpose (`TRANSACTIONAL`, `MARKETING`, `SUPPORT`), with SMTP, optional IMAP and AES-GCM-encrypted secrets. **Not per person**                                                                                                                                                                                              |
| The Support Inbox                  | `crm/email-inbox/`, `crm.prisma:168-200`, `/admin/inbox`               | `MailboxPollerCron` polls IMAP every 5 minutes (`mailbox-poller.cron.ts:8`). `InboundEmail` keeps a plain-text copy, and "attachments are not ingested" (`crm.prisma:176`). Replies are `InboundEmailReply`. Routes sit under `admin/crm/inbox`, gated `crm.manage`. `email.reply_received` has no subscriber (`docs/index/cross/events.md`) |
| Outbound delivery                  | `core/notifications/email.channel.ts`, `notification-channel.ts:32-37` | `EmailChannel` behind the `NotificationChannel` extension point. Mail is a delivery path, not a client                                                                                                                                                                                                                                       |
| The mail control plane             | [doc 233](./launchpad-apps/233-mail-app.md) (Planned)                  | A new `mail` module: `MailDomain`, `Mailbox` (`PERSONAL`, `SHARED`), `MailboxMember`, `MailAlias`, `MailSentRecord`, `MailProvisionJob`. The engine stays Stalwart. Webmail is "embedded engine webmail via SSO, later a native screen" (§3). Spikes S1–S5 gate the build (§9). **Nothing is built**: no `mail` module exists                |
| Engine provisioning                | `system/managed-services/managed-services.service.ts`                  | Reads only the Master Platform's usage and invoices. Doc 13 §5's Stalwart provisioning is unbuilt; doc 233's `MailProvisionJob` is its planned home                                                                                                                                                                                          |
| Calendar or mail protocols in code | `apps/`, `packages/`                                                   | None. No `VCALENDAR`, `text/calendar`, CalDAV, JMAP or `RRULE` in any `.ts`/`.tsx` file                                                                                                                                                                                                                                                      |

### 2.4 Meetings, the embryo of a calendar

| What                                            | Where                                                   | Finding                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meetings (doc 24, ADR-060, built)               | `notify.prisma:76-125`, `notify/meetings.*.ts`          | `Meeting` has a **required** `audienceId` (line 85) and `orgUnitId` (line 87), plus `timezone` and `cancelledAt`. `MeetingInvitation` is keyed by `userId` (line 113), unique per meeting, with `ACCEPTED`/`DECLINED`/`TENTATIVE`. Create, cancel and shortfall need `notify.send`; respond needs only a signed-in user |
| What a calendar needs and `Meeting` cannot hold | the same file                                           | A personal event with no audience; an external attendee who is not a `User`; recurrence; a room or vehicle as a resource; free/busy                                                                                                                                                                                     |
| The invitee surface                             | `apps/web/src/app/(admin)/admin/(app)/notify/meetings/` | The caller's form only. Doc 205 (ADR-074 accepted; work orders proposed) adds `/admin/my-meetings`, the first invitee-facing view, and `core/video`. Neither exists yet                                                                                                                                                 |
| Reach                                           | `.env.production.example:64`                            | `notify` is in every default `MODULES`. `crm` and `content` are too                                                                                                                                                                                                                                                     |

### 2.5 `rag`, and whether authored content flows through it

| What             | Where                                                        | Finding                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DocumentSource` | `rag.prisma:76-122`                                          | Points at a `StorageService` key and never re-stores bytes (lines 80-83). Corpora are `EMPLOYEE_DOCUMENTS`, `SUPPLIER_CATALOG`, `BUSINESS_DOCUMENTS` and `KNOWLEDGE_BASE` (lines 48-62) |
| Ingestion        | `rag-corpus.service.ts:13,59-61`, `rag-ingestion.service.ts` | PDF only, off the request path. With no embedding provider the queue waits, and nothing fails                                                                                           |
| Isolation        | `rag-corpus-access.ts`, `rag.prisma` header                  | By `organizationId` plus a corpus visible by permission. **No per-document access**                                                                                                     |

**Ruling: yes, the same path, but by explicit publication.** Authored content
reaches `rag` the way doc 253 ruling 6 says every document does: I8 creates
the `DocumentSource`. It does so only when someone publishes a version into a
named corpus, and only when the document's grants cover that corpus's
audience. A private draft never lands in a shared corpus automatically,
because `rag` has no per-document check to stop a reader from seeing it.

`rag` stays PDF-only. The program supplies a PDF rendition through the
engine's `convert` (§4.1), so Word, spreadsheet and slide content becomes
ingestible without widening `rag`'s own boundary. There is never a second
embedding pipeline. The access rule is I8's brief's to write (R-7, §4.3).

### 2.6 Seams and precedents this program reuses

| Precedent                                                                                                                                                                                                                        | What it settles here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StorageDriver` (`storage.driver.ts:1-7`)                                                                                                                                                                                        | Infrastructure swapped behind an interface with no caller changes. The pattern the task names for the build-approach question                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `VideoConferenceProvider` ([doc 205](./tasks-notifications-support/205-self-hosted-video-meetings-livekit.md), [ADR-074](./decisions/ADR-074-doc-205-video-rooms-for-doc-24-s-meetings-self-host-livekit-as-newax.md), Accepted) | **The closest precedent.** A self-hosted open-source engine (LiveKit) that NEWAX runs as its own Coolify resource, behind a core seam, with an env allowlist that defaults to empty. Mechanism lives in core and policy in the module. The browser talks to the engine with a short-lived token minted by the server, and the engine is never part of readiness. ADR-074 rejected "hand-build a WebRTC media engine" as "a multi-year effort" with "no differentiated benefit", noting that "can the existing system already solve this?" applies to existing open-source systems too |
| Stalwart (doc 13, `docker-compose.mail.yml`, doc 233)                                                                                                                                                                            | A self-hosted engine as the data plane, with NEWAX as control plane and UI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `bpmn-js` ([doc 142](./architecture-patterns/142-bpmn-visual-workflow-engine.md) WO-142.2, [ADR-049](./decisions/ADR-049-docs-140-143-general-eav-metadata-driven-ui-bpmn-workflow-editor.md))                                   | An embedded open-source editor, "never a bespoke diagram tool built from scratch", mounted imperatively and loaded only on its own screen (`components/admin/bpmn-editor.tsx:34-45`)                                                                                                                                                                                                                                                                                                                                                                                                  |
| The launchpad ([doc 232](./launchpad-apps/232-launchpad-and-app-manifest.md), built)                                                                                                                                             | `packages/shared/src/launchpad.ts`: how an app gets a tile, required modules and a per-tenant switch. No Office or mail tile exists yet                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `core/extension-points/`                                                                                                                                                                                                         | `TaskSourceRegistry` (an event becomes a task), `StockIntakeRegistry` (a best-effort cross-module write), and `EmployeeOffboardingRegistry` (departure; it holds **one** handler, finding 4)                                                                                                                                                                                                                                                                                                                                                                                          |
| The embed token (`embeds/embed-widgets.service.ts`, doc 113)                                                                                                                                                                     | A 300-second token with its own `aud`, which cannot be replayed as a session                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `AiService`/`AiProvider` ([doc 09](./ai-layer/09-ai-layer.md))                                                                                                                                                                   | An absent provider is invisible. Any drafting or formula assistance uses this contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Doc 253's own bucketing already counts two of these as native.** Row I5 is
a NATIVE row. It lists "self-hosted mail (doc 13)" as built and "video
(doc 205)" as scoped, not as integration exceptions. §3.6 explains why that
is evidence and not a ruling.

### 2.7 Packaging

`module-packs.ts:28-38` allows a pack "only where a vertical owns genuine
domain data that core cannot express". Every sector writes letters, keeps
spreadsheets, presents and schedules. So every module here is a **core
capability module**, `offByDefault: true` (`modules.registry.ts:89`), and
survivably absent (`ENTERPRISE-SCALE.md` S4). There is no pack.

Core platform code (`apps/api/src/core/`) sits outside the independence check
(`MULTI-SECTOR.md`, "Independence"). `KNOWN_MODULE_COUPLINGS` holds 24
entries today. This program proposes **none** (§4.4).

## 3. The build-approach question: surfaced, not settled (OQ1)

### 3.1 The question

Doc 253 §1.2 rule 2 permits integration points "only in three categories":
hardware, external authorities and networks, and CAD/3D engines. Read
literally, the word processor, spreadsheet engine and slide renderer must be
NEWAX code written from first principles.

There is a second legitimate reading. Under it, everything that makes the
capability NEWAX's stays native: the UI shell, the record, storage,
permissions, audit, search and retention. Only the editing and rendering
engine is a **self-hosted, open-source component NEWAX operates itself**,
reached through an internal interface the way `StorageDriver` abstracts S3.

The two readings can differ by years of engineering. They do not differ in
what staff see: in both, staff never leave NEWAX and no SaaS vendor sits in
the path. That makes it the owner's decision, posed in §8 as OQ1.

**What an engine must do, per surface.** This is what makes the cost
concrete.

- **Word processor.**
  - Rich text with styles, tables, images and lists.
  - Pagination with page geometry, headers, footers, sections and footnotes.
  - Comments and tracked changes.
  - Bidirectional text. Urdu is a supported locale, set in Nastaliq
    (`brand.ts:151,383-385`; `constants.ts:9`). Nastaliq shaping and line
    layout are among the hardest problems in text rendering.
  - Print-accurate PDF.
  - Reading and writing what customers and suppliers send: `.docx`, legacy
    `.doc`, and ODF.
- **Spreadsheet.**
  - A formula language with several hundred built-in functions and
    Excel-compatible semantics: dates, errors, arrays.
  - A dependency graph with incremental recalculation.
  - Virtualised rendering for large sheets.
  - Number formats, conditional formatting, charts and pivots.
  - `.xlsx` round-trip including formulas.
- **Presentation.**
  - Masters, layouts, text in shapes, images and charts.
  - Presenter mode.
  - `.pptx` round-trip, and PDF export.
- **All three.**
  - Real-time co-authoring (a CRDT or operational transform), presence, and
    merge after a disconnect.
  - Accessible complex widgets. A spreadsheet grid is a known hard case for
    screen readers.
  - All seven widths of Law 4.

### 3.2 Option A: first-principles native engines

NEWAX writes all three engines: layout and pagination, a formula engine, slide
rendering, OOXML import and export, co-authoring, and the realtime transport.
There is none today: no WebSocket dependency or gateway exists in `apps/api`,
and doc 139's gateway is deferred by ADR-054.

- **Cost and schedule.** Each surface is its own decade-plus industry problem
  and a multi-year, dedicated-team program. The open-source suites that
  achieve high fidelity got there over decades.
  - OOXML is specified in thousands of pages.
  - Fidelity with real files is set by what the incumbent's software does,
    not by the specification alone.
  - Nastaliq shaping, pagination and right-to-left tables are each a project
    in their own right.
- **Maintenance.** NEWAX owns every line forever, including tracking format
  changes made by the incumbent vendor.
- **What it buys.** Total control.
  - The design system governs every pixel of the editing canvas, including
    `brand.ts` tokens, the seven widths and accessibility checks.
  - There is no licence exposure.
  - ERP-native behaviour is designed in from the start, such as a cell bound
    to a report or a merge field bound to an order.
  - It fits the literal text of §1.2.

### 3.3 Option B: a self-hosted open-source engine behind a seam

A self-hosted document-server process does the editing and rendering. The
category is well established; the two widely deployed self-hostable engines
are Collabora Online (built on LibreOffice) and ONLYOFFICE Docs. Nothing here
chooses between them. NEWAX runs it as its own Coolify resource, like
Stalwart and LiveKit.

**How it fits together.**

- It is reached through a host protocol in which the engine fetches a file
  from the host and saves it back: WOPI, or the engine's own callback API.
- NEWAX is the host. NEWAX owns the record, the bytes, sessions,
  permissions, audit, sharing, search, retention and the UI shell around the
  canvas.
- The engine holds a document only for the length of an editing session.

**Cost and schedule.**

- About one to two tranches to a first usable surface after XW0. The engine
  already does pagination, formulas, slides, co-authoring and OOXML.
- New operational load: a memory-heavy service with its own public endpoint,
  image updates, security releases and a measured capacity figure. This is
  ADR-074's consequences list, applied again.

**Maintenance and risk.** NEWAX inherits:

- the engine's architecture, its bugs and its release cadence;
- its licence: both named engines are copyleft (MPL-2.0 and AGPL-3.0
  respectively, as published at the time of writing; counsel verifies, §10).

**Governance of the canvas.**

- The editing canvas is the engine's own UI. NEWAX governs it only through
  the engine's theming and configuration options.
- The design system, the seven-width overflow check and the accessibility
  checks cannot reach inside it. The page around it stays fully governed.

**Fit.** This is the repository's settled precedent: ADR-074, doc 142 and
doc 13.

### 3.4 A variant worth naming: library composition (C)

A third shape sits between A and B. NEWAX owns the document model (its own
JSON, with OOXML only at import and export). It composes open-source
**libraries** inside its own web app and API:

- a structured rich-text framework (the ProseMirror family);
- a CRDT for co-authoring (the Yjs family);
- a formula engine. Licences range from permissive to GPL or commercial dual
  licensing, so each candidate must be checked.

This is the `bpmn-js` shape. The canvas is NEWAX's own and fully governed by
the design system. Fidelity with outside files becomes NEWAX's problem.
Pagination for print, slide rendering and a realtime transport are still
NEWAX's to build. The cost is multi-tranche per surface, between A and B, and
the fidelity gaps stay open for as long as NEWAX funds them.

### 3.5 Side by side

| Question                                   | A: first principles                          | B: self-hosted engine                                               | C: library composition                       |
| ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| Who writes the editing engine              | NEWAX                                        | Upstream; NEWAX operates it                                         | NEWAX, from libraries                        |
| Stored format of a version                 | NEWAX's choice                               | OOXML (what customers exchange)                                     | NEWAX JSON; OOXML at the edges               |
| Time to a first usable surface after XW0   | Years per surface                            | One to two tranches                                                 | Several tranches per surface                 |
| Co-authoring                               | NEWAX builds a CRDT and a realtime transport | Engine-provided                                                     | Library CRDT plus a NEWAX realtime transport |
| Fidelity with files from outside           | NEWAX's problem, indefinitely                | The engine's, typically high (verified against real files, §10)     | NEWAX's problem, partly library-assisted     |
| Design-system governance of the canvas     | Full                                         | Theming only                                                        | Full                                         |
| Licence exposure                           | None                                         | Copyleft engine; counsel (OQ3)                                      | Per library                                  |
| Security surface                           | NEWAX parsers in NEWAX processes             | An untrusted-file parser isolated in its own container              | Library parsers in NEWAX processes           |
| Operational load                           | NEWAX's realtime service                     | A memory-heavy engine service per deployment                        | NEWAX's realtime service                     |
| Exit path                                  | —                                            | Replace behind the seam, per surface; stored OOXML remains readable | Replace libraries; the model is NEWAX's      |
| Fits doc 253 §1.2 read literally           | Yes                                          | No: none of the three categories                                    | Arguably, since the code is NEWAX's          |
| Fits ADR-074, doc 142 and doc 13 precedent | No: ADR-074 rejected this shape for video    | Yes                                                                 | Yes, for doc 142's shape                     |

### 3.6 How each reads against the mandate's purpose

§1.2 gives its own counter-example: "Integrating with Salesforce does not meet
the bar." It does not meet the bar for four reasons:

1. the data sits in another vendor's system;
2. staff get a second login and a second workflow;
3. two records must be synchronised;
4. the business depends on a vendor's commercial decisions.

Option B has none of the first three. Bytes sit in NEWAX storage and the
record in NEWAX's database. The engine is opened inside NEWAX under the NEWAX
session. The engine reads and writes the one record, so there is nothing to
synchronise; its on-disk cache behaviour must be verified (§10). B reduces the
fourth, without removing it. Upstream still controls the code's roadmap and
licence, but NEWAX runs a pinned image and can fork it or replace it behind
the seam. Option A has none of the four.

Against the literal text, neither B nor C fits the three categories. Doc 253
never ruled on a self-hosted engine. Its bucketing counted Stalwart and
LiveKit inside a NATIVE row (§2.6), and its row A10 treats hosting substrate
as "Infrastructure NEWAX runs on, never becomes". That shows how the map was
read. It does not settle what the owner meant, which is why this is a
question and not a ruling.

### 3.7 Recommendation: B, behind a seam that keeps A and C open per surface

**Recommended: Option B for the three editors**, on these terms:

1. **One seam, `EditingEngineProvider`** (§4.1). Any one surface can later
   move to a native engine (A or C) without touching modules or records.
2. **OOXML is the stored format of each version.** It is what customers and
   suppliers exchange, so any future native engine must read it anyway.
3. **One engine per deployment, off by default.** Document bytes in an
   engine's memory are data. Doc 39's "shares infrastructure, never a
   database" therefore applies, as ADR-074 applied it to LiveKit's webhook
   stream.
4. **The triggers to revisit, per surface, written down now:**
   1. the engine's licence changes in a way counsel rejects;
   2. upstream leaves a critical vulnerability unpatched beyond a window the
      XW0 brief sets;
   3. a NEWAX-specific capability that the engine's extension API cannot
      express behind the seam, and that the owner ranks above the cost of A
      or C for that surface;
   4. measured operating cost per active editor exceeds a ceiling the XW0
      brief sets.

**Why.**

- It delivers the product the owner chose in Q3 in tranches, not years.
- It follows a precedent this repository has already settled twice for
  infrastructure-class engines (ADR-074, doc 13), plus once for an embedded
  editor (doc 142).
- It keeps native everything that makes the capability NEWAX's: the record,
  permissions, audit, search, retention and the ERP integrations of §6.3.

**The honest costs.**

- An inherited architecture and bug list.
- Copyleft obligations to clear with counsel (OQ3). These matter most for the
  OFFLINE licence product
  ([ADR-080](./decisions/ADR-080-doc-211-cloud-subscription-and-offline-license-locked-to-strictly.md)),
  which ships software to customer premises.
- An editing canvas the design system governs only through theming.
- A new service to operate.

**Not settled.** OQ1 is the owner's.

### 3.8 What does not wait for OQ1

- **XW0.1, the record layer**: I8 requirements, the seam's interface,
  sessions, permissions, launchpad entries and the file library actions.
- **XW4, the mail client.** The engine is already chosen: Stalwart, docs 13
  and 233.
- **XW5, the calendar.** The store of record is already native: `notify`.

Only XW0.2 (the engine itself) and the editing work of XW1–XW3 wait.

## 4. Program architecture (proposed; each ADR lands with its first brief)

### 4.1 The shape: one core seam, three editor modules, two extensions

```
apps/api/src/core/editing/                 mechanism, no module knowledge
  EditingEngineProvider (interface)         launch, save callback, convert, preview, ping
  EditingEngineService                      sessions, tokens, EDITING_ENGINES allowlist (default empty)
  <engine>EditingEngineProvider             one implementation, per OQ1

core capability modules (offByDefault, each survivably absent)
  wordprocessing   policy: text kind, templates, merge fields, UI
  spreadsheets     policy: sheet kind, data connections, UI
  presentations    policy: slides kind, brand themes, chart embeds, UI

extensions, not new modules
  mail   (doc 233, planned)   + the native mail screen       (XW4)
  notify (doc 24, built)      + the calendar                 (XW5)

record layer
  documents (I8, doc 253 X0.6)  one store for every file, captured or authored
```

The names `core/editing`, `wordprocessing`, `spreadsheets` and `presentations`
are proposals to reserve. Each brief confirms its own name.

**Why three modules and not one `office` module.**

1. `MODULES` can ship any subset, and the launchpad can entitle each app
   separately (doc 232 §8).
2. Each owns a distinct ERP integration with its own data:
   - merge-field templates (`wordprocessing`);
   - data connections (`spreadsheets`);
   - themes and chart embeds (`presentations`).
3. A native engine can replace one surface behind the seam while the other
   two stay on the engine.
4. The shared mechanism is in core, so three modules duplicate nothing.

The cheaper alternative, one module with three kinds selected by env, is ADR
candidate OA1.

### 4.2 An authored file is an I8 document, never a second store

Every version's bytes are a `StorageService` object referenced by I8. The
editor modules hold no file table and no storage folder of their own. I8 owns
all of these, once:

- ownership and sharing;
- versions, retention and legal hold;
- trash, search and audit.

An editing session is a lease over one version of an I8 document, never a
copy of it. This is doc 253 §5 ruling 6 applied to authored content. The
file library staff browse ("Drive" in the launchpad README's catalogue) is
I8's own library screen. XW0 gives it "New document", "New spreadsheet" and
"New presentation" actions. It is never a second store.

### 4.3 What this program requires of X0.6 (I8's brief)

Doc 253 owns I8's scope. These are the inputs this program puts on that
brief, written down before it exists so that I8 is not built too narrow for
its largest consumer.

| #    | Requirement                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1  | **Kinds by registration.** Captured upload, generated document and authored text, sheet or slides are kinds that editor modules register from `onModuleInit()`. I8 never edits an enum per editor                                                                                                                         |
| R-2  | **Immutable versions with one writer** (`ENTERPRISE-SCALE.md` D5). Each version records its storage key, content hash, size, author and the engine's save id. Named versions and autosaves are distinguishable                                                                                                            |
| R-3  | **Two placements, one table.** An object can sit in a personal, team or org-unit space and also be linked to business records (an order, a supplier, an employee). The library view and the attachment view are two views of the same rows                                                                                |
| R-4  | **Per-object grants** (read, comment, edit, manage) to users and org units, enforced server-side on every list. `ENTERPRISE-SCALE.md` L2 is unenforced, so I8 must not rely on it. A restricted object ignores org-tree reach, which is doc 231 §3.6's principle                                                          |
| R-5  | **A private object class.** Private bytes are never served by the public `files/*path` route and never cached `public, immutable`. They reach a browser or engine only through an authorised, audited route or a short-lived token. Required before the first authored byte is stored (finding 2)                         |
| R-6  | **Streamed transfer and a size cap stated as an exact number with its reason.** `putDocument()`'s 8 MiB image cap is not that number (finding 3)                                                                                                                                                                          |
| R-7  | **Explicit publication into a `rag` corpus**, only when the object's grants cover the corpus's audience, withdrawn on un-share. Never automatic (§2.5)                                                                                                                                                                    |
| R-8  | **Hooks for extracted text and renditions** (search, preview, `rag`, print), fed by `core/editing`'s `convert` where an engine exists and absent where none does                                                                                                                                                          |
| R-9  | **Soft delete and a trash with restore** (`deletedAt`), per CLAUDE.md's rule against deletion without confirmation. A retention schedule and legal hold override purging the trash                                                                                                                                        |
| R-10 | **Ownership passes to a named successor inside the deactivation transaction** (canonical rulings 6 and 14). This needs `EmployeeOffboardingRegistry` to accept more than one handler (finding 4)                                                                                                                          |
| R-11 | **Editors reach create, version and check-access with no direct module import.** I8 has ten or more consumers named in doc 253 ruling 6, plus three here. As core platform code (the `core/approvals`, `core/storage` and `core/audit` precedent), each consumer injects it. As a module, each needs a registry seam. OA2 |
| R-12 | **A home node per object.** Versions flow up as facts and brand templates flow down as policy. File bytes need a replication path at Organization edition; none exists, since `ReplicationRecord` carries JSON rows. OA3                                                                                                  |

### 4.4 How the modules talk: no new couplings

| From → to                                                    | Mechanism                                                                                                                                     | Couplings added |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Editor module → I8 (create, add version, check access)       | I8's core API if I8 is core, otherwise a `core/extension-points/` registry that I8 registers into (R-11)                                      | 0               |
| Editor module → engine                                       | `core/editing` (platform code)                                                                                                                | 0               |
| Engine → API (load, save)                                    | A callback route owned by `core/editing`. Each session has its own signed token, and the callback is idempotent on the engine's save id       | 0               |
| `spreadsheets` ← `reports`, `analytics` data                 | A data-source registry in `core/extension-points/`. Those modules register read-only sources into it, evaluated under the **viewer's** grants | 0               |
| `wordprocessing` ← merge fields from `crm`, `orders`, quotes | A merge-field registry of the same shape                                                                                                      | 0               |
| Comments and mentions → tasks, notifications                 | Domain events into `TaskSourceRegistry`. Delivery goes through `NotificationsService`, with audiences resolved by capability                  | 0               |
| `mail` attachments ↔ documents                               | `mail` saves an attachment as an I8 object through the same seam as editors. "Attach from documents" passes an I8 id                          | 0               |
| `notify` calendar → external invitees                        | iMIP mail through `core/notifications` (org-sent), or a domain event that `mail` consumes (person-sent, XW4)                                  | 0               |

`KNOWN_MODULE_COUPLINGS` stays at 24. Every registry named here is a
proposal for its brief.

### 4.5 Mail and calendar: extend, do not rebuild

**The mail client (XW4) extends doc 233's `mail` module.** Doc 233 already
settles the control plane:

- domains, personal and shared mailboxes, and members;
- attribution of the real sender;
- the provisioning outbox and the departure archive.

It says webmail is "embedded engine webmail via SSO, later a native screen".
XW4 is that native screen, and it adds nothing new to the control plane.

- **What the screen does.** Threads, folders, search and compose. Attachments
  pass in and out of I8. Signatures come from `brand.ts`. It also covers rules,
  shared mailboxes under doc 233's roles, and record links through the
  existing inbound-email handling (doc 233 §5.7).
- **Where mail lives.** The store of record for message bodies stays the
  engine (doc 233 §11: "message bodies live in the engine, not our DB").
- **Protocol.** JMAP is preferred, since Stalwart serves it (`docs/email.md`
  line 12). A spike, S6, is added to doc 233's S1–S5 to confirm it.
- **The Support Inbox.** `crm`'s Support Inbox keeps working. Whether it
  becomes a shared-mailbox view in XW4 or stays a CRM projection is OA6.

**The calendar (XW5) extends `notify`.** `Meeting` and `MeetingInvitation`
already form a calendar's core record: time, timezone, invitees, responses,
and cancellation as a notice. Doc 205's "My meetings" grows into the calendar
rather than a second view being added beside it.

- **What it adds.** The gaps in §2.4.
- **Interop.** iCalendar (RFC 5545) invitations and replies over mail (iMIP,
  RFC 6047), and device sync (OQ6).
- **Where events live.** `notify` stays the store of record. Any CalDAV store
  is a projection.

**Why the calendar is not a module of its own, nor part of `mail`.**

- A `calendar` module would split invitations from meetings into two event
  stores.
- Inside `mail` it would vanish from deployments without mail. `notify` ships
  in every deployment; `mail` is off by default.

### 4.6 Failure modes

| Failure                                                           | Behaviour                                                                                                                                                                      | Recovery                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Engine down or slow                                               | Editor tiles say "editing unavailable". Documents stay listable, downloadable and shareable through I8. API readiness is unaffected (ADR-074 rule 4)                           | Engine restart; only the unsaved window is at risk           |
| A save cannot be applied (revoked access, stale base, I8 refusal) | It lands as a recoverable "unapplied save" version visible to the document's owner, never dropped. An edit that happened is a record, and its refusal becomes a reviewable row | The owner promotes it or discards it, soft                   |
| API down mid-session                                              | The engine cannot save. Loss is bounded by the autosave interval (XW0 sets the number)                                                                                         | Saves resume; the engine's retry behaviour is verified (§10) |
| Two sessions save against the same base version                   | The version append is predicated on the base version, House Rule 10's predicate-on-write applied to versions                                                                   | The losing save becomes a branch version, never an overwrite |
| Stalwart down                                                     | Doc 233 §8: mail keeps flowing while the control plane is down, and the mail screen says "mail unavailable"                                                                    | Automatic                                                    |
| A user deactivated mid-session                                    | The token is not renewed, and a sweep closes the engine connection. The residual is set by the XW0 brief, as doc 205 set its 60 seconds                                        | —                                                            |
| No AI provider                                                    | Assistance is hidden                                                                                                                                                           | —                                                            |

### 4.7 Security posture

- **Every route carries `@RequirePermission`.** Role permissions gate
  capabilities only: using an app, managing central templates, managing data
  connections, engine settings. Who may open a given document is an I8 grant,
  never a role.
- **Minting an editing session is `@SessionOnly()`** (`.claude/rules/security.md`),
  audited at evidence class (canonical ruling 9). The token names the
  document, version, user, mode and expiry. It never carries a storage key.
- **The engine is an internet-facing parser of untrusted files.** It runs in
  its own container without database credentials. It reaches bytes only
  through the callback route, and its on-disk cache is purged under a stated
  policy (§10).
- **A data connection refreshes under the viewer's grants, never the
  author's.** Otherwise sharing a spreadsheet would hand finance figures to a
  colleague who lacks `finance.view`.
- **External sharing (OQ7) uses doc 231 §3.4's review-grant shape**: scoped,
  expiring and watermarkable. It is never a public link by default.
- **No mailbox password ever enters NEWAX**, under doc 233's rule.
- **R-5 holds before the first authored byte is stored.**

## 5. Zero-duplication rulings this program carries into every brief

Each line is a place where this program would tempt a second implementation.
The first brief to touch it must honour it.

1. **One document store (I8).** Every authored file is an I8 object. The file
   library is I8's screen. No editor owns a file table.
2. **One content model per job.** CMS blocks serve composed pages, and I8
   objects serve documents. They meet by reference only (§2.2).
3. **One engine seam.** No module talks to an engine directly. All three
   editors use `core/editing`.
4. **One mail store and one mail control plane.** Message bodies live in
   Stalwart. Domains, mailboxes and members live in doc 233's `mail`. NEWAX's
   database holds references (`MailSentRecord.messageRef`), never a second
   copy of mailbox content. An attachment saved to documents becomes one I8
   object, keyed so a second save is a no-op.
5. **One calendar of record (`notify`).** CalDAV and iCalendar are
   projections. `stitching` bookings and B10 customer events keep their own
   records and may appear in a calendar view, read-only, through a registry.
6. **One delivery path, one audience resolver.** Share notices, mentions and
   invitations are delivered by `core/notifications`, to audiences resolved by
   capability. They are never sent to a literal address.
7. **One retrieval index (`rag`)**, fed only by I8 publication (§2.5).
8. **One OOXML reader for imports, independent of the engine.** Doc 229's
   `.xlsx` upload, doc 72's importer and supplier price lists must work in a
   deployment with no engine. Whichever of them ships first adds the reader
   once, in core, under `.claude/rules/dependencies.md`.
9. **One directory.** Address autocomplete reads `User`, `Contact` and
   `Party`. There is no address-book table.
10. **One AI path (`AiService`).**
11. **No write-back from a document into a fact.** A spreadsheet never edits a
    price, stock or the ledger. Bulk changes go through the owning module's
    own import, as a request (D5, one writer per invariant).

## 6. Roadmap: tranches XW0–XW5

These are tranches in doc 236 §12's sense: a dependency graph, not a priority
list. **Which tranche starts first is the owner's call** from the first real
customer, as it is for docs 236, 245 and 253.

The engineering suggestion:

- XW4 and XW5 can start now, since nothing in OQ1 blocks them.
- Among the editors, XW2 goes first. A distributor's working tool is the
  spreadsheet: price lists, reconciliations, and the twelve CSV exports doc
  253 row K1 counts.

### 6.1 The graph

```
Already built or scoped, not re-scoped here
  X0.6 documents (I8, doc 253; no brief yet)     doc 233 mail (planned; S1–S5 first)
  doc 24 meetings (built)                        doc 205 video and "My meetings" (ADR-074; planned)
  doc 232 launchpad (built)                      X0.5 asset register (doc 253 AD-2)

XW0 Foundation
  XW0.1 record layer ......................... needs X0.6 (R-1 to R-12); independent of OQ1
  XW0.2 the engine ........................... needs OQ1 (and OQ3 if B)
XW0 ─┬─ XW1 documents (wordprocessing) ....... merge-field sources registered by their owners
     ├─ XW2 spreadsheets ..................... data sources registered by reports/analytics
     └─ XW3 presentations .................... chart sources registered by analytics
doc 233 WO-233.1–233.7 ─── XW4 mail client ... + X0.6 for attachments; XW0.2 optional, for previews
doc 24 + doc 205 "My meetings" ─── XW5 calendar ... + XW4 for invitations sent as a person; + X0.5 for resources
```

### 6.2 The tranches

| Tranche               | Delivers                                                                                                                                                                                                          | Needs                                                                                        | Its brief must decide                                                                                                                                                                                           | Absent when                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **XW0** Foundation    | `core/editing` (interface, service, sessions, callback, `convert`, preview, `EDITING_ENGINES`); the engine resource; launchpad entries; capability permissions seeded to real roles; nav entries; library actions | X0.6; OQ1 for XW0.2; OQ3 if B                                                                | The seam's contract (OA7); engine topology (OA4); every parameter in §6.4 marked XW0                                                                                                                            | `EDITING_ENGINES` is empty: tiles hide, documents stay in I8                                              |
| **XW1** Documents     | `wordprocessing`: blank and template documents; edit, comment, track changes and co-author; PDF and DOCX export; print; central templates with merge fields; default styles from `brand.ts`                       | XW0                                                                                          | Merge-field registry; template scoping per brand at Organization edition; Nastaliq verified on real documents                                                                                                   | Module off: the tile hides, and existing text documents open read-only through I8                         |
| **XW2** Spreadsheets  | `spreadsheets`: workbooks; `.xlsx` open and save; data connections to registered sources; "Open in spreadsheet" beside the existing CSV exports                                                                   | XW0; sources registered by `reports`/`analytics`                                             | Data-connection semantics (OA5); refresh and row caps                                                                                                                                                           | Module off: the tile hides. With no sources registered, the connection picker is empty                    |
| **XW3** Presentations | `presentations`: decks; themes from `brand.ts`; analytics charts embedded as a dated snapshot or live; presenter mode; PDF and PPTX export                                                                        | XW0                                                                                          | Whether charts are snapshot or live by default                                                                                                                                                                  | Module off: the tile hides                                                                                |
| **XW4** Mail client   | Doc 233's native screen: threads, folders, search, compose, I8 attachments, signatures, rules, shared mailboxes, record links, and address autocomplete as a read model                                           | Doc 233 built (at least WO-233.1–233.4); S6                                                  | JMAP or IMAP (S6); the Support Inbox's future (OA6)                                                                                                                                                             | `mail` off, or the engine absent: doc 233 §8's "mail unavailable"                                         |
| **XW5** Calendar      | "My meetings" grown into day, week and month views; personal events; recurrence; external attendees by iMIP; free/busy; resources; device sync per OQ6                                                            | Doc 24 (built); doc 205's "My meetings"; XW4 for person-sent invitations; X0.5 for resources | Whether to relax `Meeting`'s required audience (null's meaning written down, canonical ruling 11) or add a sibling event model in `notify`; either way, one events store. How recurrence is stored and expanded | `notify` is always on. Without `mail`, external invitations go through `core/notifications` or are hidden |

### 6.3 What each tranche is for, beyond the table

- **XW0.1 is independent of OQ1.** It confirms R-1 to R-12 are in I8's brief
  or built. It also:
  - defines the seam's interface in the shape every option needs: launch a
    session for (document, version, user, mode), accept a save as a new
    version, convert between formats, render a preview, and report health;
  - ships the launchpad entries, permissions, nav entries and library
    actions.
- **XW0.2 is the engine, and depends on OQ1.**
  - **Under B**, it is a Coolify resource beside Stalwart and LiveKit. It
    comes with a compose file, a runbook, a pinned image as
    `stalwart:v0.13.4` is pinned, and a capacity figure measured on the real
    host before any deployment enables it (ADR-074's rule).
  - **Under A or C**, it is the native kernel plus a realtime transport. Doc
    139 left its gateway unbuilt until "a real agent/voice integration
    requirement exists" (ADR-054). A native editor would be a real
    requirement of a different kind, so building the gateway needs its own
    ADR with this as the new evidence.
- **XW1–XW3 are where NEWAX beats a standalone suite.** Each one's ERP
  integration is the reason it is a module and not just a file type:
  - a contract generated from a customer, quote or order (XW1);
  - a sheet whose range is a live, permission-checked report (XW2);
  - a deck whose charts link back to the numbers behind them (XW3).
- **XW4 and XW5 add no new module.** They finish what doc 233 and doc 24
  started.

### 6.4 Parameters each brief must set

CLAUDE.md's exact-parameters rule. **None is set here.** Each is set by the
brief named, with its value, unit and reason, and recorded in that brief's
ADR.

| Parameter                                                                         | Set by       | Existing figure to start from (not a decision)                                      |
| --------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| Editing-session token lifetime                                                    | XW0          | The embed token's 300 s (`embed-widgets.service.ts`); doc 205's join token          |
| Largest file accepted                                                             | X0.6 and XW0 | `putDocument()`'s 8 MiB; doc 229's 25 MB and 200,000 rows; doc 233's 25 MiB message |
| Autosave interval (the unsaved-loss window)                                       | XW0          | —                                                                                   |
| Autosave coalescing and version retention                                         | X0.6 and XW0 | —                                                                                   |
| Concurrent editors per document; engine memory ceiling; open documents per engine | XW0.2        | Measured on the real host, as ADR-074 required for LiveKit                          |
| Session residual after deactivation                                               | XW0          | Doc 205's 60 s sweep                                                                |
| Unpatched-vulnerability window that triggers a revisit (§3.7)                     | XW0          | —                                                                                   |
| Data-connection refresh interval and row cap                                      | XW2          | —                                                                                   |
| Recurrence expansion horizon; subscription-feed cache lifetime                    | XW5          | —                                                                                   |
| Attachment size; search page size                                                 | XW4          | Doc 233 §6                                                                          |

## 7. Program-level scope lenses (what each brief must close)

Per `.claude/skills/feature-scope/SKILL.md`. This is a program map, so each
line names the artifact known now and the brief that closes it. Each brief
still writes its own full map.

| Lens                                    | Program-level answer                                                                                                                                                                                                          | Closed by      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| The transaction, start to finish        | Create, edit, share, co-author, version, then export, print, mail or sign (I7), then retain or archive. Each step is an artifact in §4–§6                                                                                     | XW0–XW3        |
| The other side of the transaction       | Operator twins: engine health and capacity, storage quota, sharing audit, retention and legal hold, reassigning a leaver's documents (R-10), and doc 233's mailbox administration                                             | XW0, X0.6, XW4 |
| What happens after "done"               | Restore a version, restore from trash (R-9), un-share (withdrawing `rag` publication, R-7), legal hold, and retention expiry                                                                                                  | X0.6, XW0      |
| The integrations a real business needs  | OOXML fidelity (OQ2), PDF, print, mail attachments, phone sync (OQ6), e-signature (I7), migration from Microsoft 365 (OQ8)                                                                                                    | XW0–XW5        |
| The policy layer                        | Whether external sharing is allowed (OQ7), retention schedules (I8), brand templates managed centrally, quotas                                                                                                                | X0.6, XW1      |
| The actor with three tables             | Staff are `User`. An external collaborator is a review-grant principal (doc 231 §3.4), not a `User`. An external attendee is an address on an invitation row, linked to `Contact`/`Party` where one matches                   | XW0, XW5       |
| The principal with no permission key    | The engine. It is checked against a per-session signed token on the callback route, never `PermissionsGuard`, and reads only the one version that token names                                                                 | XW0            |
| The grant that ends itself              | An I8 grant's expiry; ownership passes to a successor inside the deactivation transaction (R-10); doc 233 §5.6 for mailboxes                                                                                                  | X0.6, XW4      |
| Whose rows, and which columns           | Per-object grants on every library list (R-4), never inferred from the org tree for a restricted object. A data connection shows only what the viewer may see (OA5)                                                           | X0.6, XW2      |
| The threshold nobody approves alone     | Opening a leaver's archive needs two approvers (doc 233 §5.6). Changing the external-sharing policy needs a second admin. Neither money nor stock moves in this program                                                       | XW4, XW0       |
| The toxic pair                          | Doc 233's `mail.archive.read` + `mail.members.manage`. Template management + data-connection management is a candidate, decided in XW2's brief                                                                                | XW4, XW2       |
| Authority and blast radius              | Enabling an engine or changing sharing policy affects the whole deployment. Each change is audited with its old and new value                                                                                                 | XW0            |
| Audience is a capability                | Share notices and mentions resolve to grants and capability holders through `core/notifications`. A zero-holder query escalates by name; a large one becomes a digest                                                         | XW0            |
| Request or record                       | A save is a **record**: a refusal becomes an "unapplied save" row the owner clears (§4.6). Sharing, publishing to `rag` and enabling an engine are **requests**                                                               | XW0            |
| The movement with no address            | n/a, because no stock or cash moves. Each document has a home node instead (R-12, OA3)                                                                                                                                        | OA3            |
| Four hours down, the counter stays open | The engine down: documents stay downloadable. Stalwart down: doc 233 §8. The API down: loss is bounded by the autosave interval. Offline editing is OQ5                                                                       | XW0, XW4       |
| The unwritten posting rule              | n/a: the program posts nothing, because no domain event carries money. A data connection _shows_ ledger figures with provenance (the "click the number" lens)                                                                 | XW2            |
| Every column or none                    | n/a: no `JournalLine` is written                                                                                                                                                                                              | —              |
| The period that already moved           | n/a: no posting. A connected range states the as-of date it was refreshed                                                                                                                                                     | XW2            |
| The second legal entity                 | Brand letterheads and templates are scoped by `retailBrandId` at Organization edition, with `brand.ts` defaults at Solo                                                                                                       | XW1            |
| Dry run before live                     | `preview*()` for a mail merge (which records, which fields) and for publishing to `rag` (which corpus, which audience), following the services rule's naming                                                                  | XW1, X0.6      |
| Click the number                        | A connected range or embedded chart keeps its source, filters and as-of time, and links to the source report pre-filtered                                                                                                     | XW2, XW3       |
| Three silhouettes                       | Solo: one engine co-located. Chain, one database: grants by org unit. Organization, many nodes: a home node per document and a blob replication path (OA3)                                                                    | XW0, OA3       |
| The absent collaborator                 | No engine, no `mail`, no `reports`/`analytics` source, no AI provider: each degrades as §6.2's last column says. I8 absent is not survivable for the editors, which is OA2's reason to weigh core placement                   | XW0–XW5        |
| The second copy of the write            | Engine save retried: unique on (document, engine save id). Attachment saved twice: unique on (message reference, part). Invitation reply twice: `MeetingInvitation` unique on (meeting, user), and the response is idempotent | XW0, XW4, XW5  |
| The hundred-thousandth row              | Versions grow with autosave: coalescing and retention (§6.4), and bytes deduplicated by content hash. Library lists are keyset-paginated on an indexed (space, updated) pair, measured in X0.6                                | X0.6, XW0      |
| The adoption test                       | Invents no numbered series. Ids are cuids. If controlled-document numbering is ever asked for, it uses `documentNumber()`'s node-folded sequence                                                                              | —              |
| The reversal document                   | Restoring a version appends a new version; it never rewrites history. Un-sharing is a revoke row                                                                                                                              | X0.6           |
| The undo fan-out                        | Restore: automatic (I8). `rag` withdrawal on un-share: automatic (R-7). A sent mail or an external invitation: deliberately irreversible, so a cancellation notice follows                                                    | X0.6, XW4, XW5 |
| The version stamp                       | Each version names its engine and engine version, so a rendering difference after an upgrade can be explained from stored fields                                                                                              | XW0            |
| The erasure the ledger cannot obey      | Author ids on versions and audit rows are pseudonymised (canonical ruling 1). Content follows I8 retention. Mail bodies follow the engine's retention. The engine's cache is purged (§10)                                     | X0.6, XW0, XW4 |
| The failure path                        | Unapplied saves (owner's screen); doc 233's `MailProvisionJob` problems list; engine health on the settings screen, as doc 205 §11.4 does for video                                                                           | XW0, XW4       |

## 8. Open questions for the owner

Each is a real ambiguity. None is answered here.

1. **OQ1 — How the three editors are built (mandatory; §3).**
   - **(A)** First-principles native engines.
   - **(B)** A self-hosted open-source engine NEWAX operates behind
     `EditingEngineProvider`, with everything else native.
   - **(C)** Library composition, the variant in §3.4.
   - **Recommendation: B**, with the revisit triggers of §3.7.
   - **Blocks** XW0.2 and the editing work of XW1–XW3. Nothing else.
2. **OQ2 — The fidelity bar for outside files.** Must a `.docx`, `.xlsx` or
   `.pptx` from a customer or supplier come back out of NEWAX intact enough to
   return to them? Or is "open it, work natively, export best-effort"
   acceptable? Under B this is largely the engine's. Under A or C it is the
   largest single cost.
3. **OQ3 — Licence and distribution (owner, with counsel).**
   - Both named engines are copyleft, and the OFFLINE licence product
     (ADR-080) ships software to customer premises.
   - Does the owner accept source-availability obligations for an
     unmodified engine shipped as its own container? Or must the engine be
     permissively or commercially licensed?
   - The same question exists, unasked, for Stalwart, which runs today. Its
     licence terms are to be verified (§10), and the answer should apply to
     both.
4. **OQ4 — Co-authoring at launch.** Is simultaneous editing by several
   people a launch requirement, or is one editor at a time with versions
   acceptable for a first release? It is free under B and very large under A.
5. **OQ5 — Editing offline.** Must documents be editable with no
   connectivity, for example on a branch box during an outage (R5, R7) or on
   a phone? Under B, editing needs a reachable engine. A branch would then
   need its own engine.
6. **OQ6 — Phones and desktop mail apps.** For calendar and contacts, is a
   read-only subscription feed enough, or must two-way CalDAV and CardDAV
   exist? This sets XW5's size and whether Stalwart's own collaboration
   features (unverified, §10) matter.
7. **OQ7 — Sharing outside the company.** May staff share an authored
   document with a customer or supplier in the first release? If so, it uses
   a scoped, expiring review grant (doc 231 §3.4), never a public link.
8. **OQ8 — Leaving Microsoft 365.**
   - Is importing existing files, mailboxes and calendars in scope?
   - Is a period of coexistence with Microsoft 365 in scope, as doc 253 Q2
     allowed for legacy ERPs?
   - Microsoft's APIs would be an AUTH integration point, used for migration
     only.
9. **OQ9 — Editing on `apps/mobile`.** Is editing on the Expo app in scope,
   or only viewing and commenting there, with full editing on the web? The
   web screens must meet Law 4 at all seven widths either way. A phone-width
   editing canvas is its own design problem.

## 9. Decisions the program waits on (ADR candidates, not written here)

| #   | Decision                                                                                                                                                                                                                | Blocks               | Recommendation in brief                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OA1 | Program shape: one core seam plus three modules, or one `office` module with three kinds selected by env                                                                                                                | XW0                  | Three modules (§4.1)                                                                                                                                   |
| OA2 | Where I8 lives and how editors write to it (I8's own ADR; this program's evidence)                                                                                                                                      | X0.6, XW0            | Weigh core placement: ten or more consumers, and the editors are not survivable without it                                                             |
| OA3 | R2 class of an authored document: home-node owned, versions as facts flowing up (canonical ruling 8), brand templates as policy flowing down, editing only at the home node. Plus a blob replication path between nodes | Organization edition | Adopt for Organization edition. Solo and Chain need none of it                                                                                         |
| OA4 | Engine topology                                                                                                                                                                                                         | XW0.2                | One engine per deployment, `EDITING_ENGINES` empty by default, never part of readiness (ADR-074's three rules)                                         |
| OA5 | Data-connection semantics                                                                                                                                                                                               | XW2                  | Read-only, evaluated under the viewer's grants at refresh, provenance kept, never written back (§5 ruling 11)                                          |
| OA6 | Stores of record for mail and calendar, and the future of `crm`'s `InboundEmail`                                                                                                                                        | XW4, XW5             | Stalwart for messages; `notify` for events; `InboundEmail` kept as a CRM projection until XW4's brief decides whether it becomes a shared-mailbox view |
| OA7 | The seam's contract: a host protocol in which the engine fetches and saves through NEWAX, or native editing operations through a NEWAX realtime service                                                                 | XW0                  | Follows OQ1. Keep the interface wide enough for both (§6.3)                                                                                            |

OQ1's answer becomes an ADR of its own once given.

## 10. Needs verification, never invented here

1. **Each candidate engine's licence and community-edition limits**, from
   current upstream terms, reviewed by counsel (OQ3). The same check applies
   to Stalwart's licence.
2. **Engine behaviours this design relies on:**
   - how the engine retries a failed save;
   - its on-disk cache and how to purge it;
   - its co-authoring limits;
   - how far its theming reaches;
   - whether it emits callbacks for comments and mentions;
   - its accessibility conformance;
   - right-to-left and Nastaliq rendering on real Urdu documents.
3. **OOXML fidelity, measured** against a corpus of the first customer's real
   files, never assumed from a vendor claim.
4. **What the pinned Stalwart (`v0.13.4`) serves:**
   - JMAP mail with per-user sharing (doc 233 S1, and S6 here);
   - calendars and contacts over CalDAV, CardDAV or JMAP. This matters only
     as an option for OQ6, never as a second store.
5. **Retention law for documents and mail** in each jurisdiction. Doc 233's
   seven-year default is an engineering placeholder.
6. **Microsoft's migration API terms and limits**, if OQ8 says yes.
7. **Nastaliq fonts on the devices staff actually use.**

## 11. Findings made while checking (not fixed here)

1. **Doc 253 row I5 does not cite doc 233.** The row cites docs 13, 24 and 205
   and the mailbox inbox, and calls a full mail client "Q3". Doc 233 (Mail
   app, Planned) already scopes the mail control plane and names the native
   mail screen as "later". Row I8 likewise does not cite the launchpad
   README's "Chat and Drive later". Doc 253 is not edited (§12).
2. **Stored files are public by default.**
   - The local driver's `@Public()` route serves every key except
     `rag-sources/`, which is refused by folder name
     (`files.controller.ts:30,47`).
   - Responses carry `Cache-Control: public, max-age=31536000, immutable`
     (line 62). Keys carry 32 random bits (`local-storage.driver.ts:80`), and
     `signedUrlFor()` falls back to the public URL on local.
   - S3 serves one bucket under one public base URL.
   - Any new store of private documents built on this abstraction would be
     public to anyone holding the URL, and cacheable by intermediaries. R-5
     makes closing this a prerequisite of X0.6, not a follow-up.
3. **`StorageService` cannot carry Office files.** `putDocument()` accepts
   images and PDF only, under the 8 MiB image cap. `StorageDriver.put()`
   takes a whole `Buffer`, a limit ADR-074 also hit, for recordings.
4. **`EmployeeOffboardingRegistry` holds a single handler.** `register()`
   overwrites it (lines 27-32), so a second departure concern cannot
   register: doc 233's mailbox archive, or document ownership (R-10).
5. **`rag` ingests PDF only and isolates by corpus, not by document**
   (`rag-corpus.service.ts:59-61`; `rag-corpus-access.ts`).
6. **`validateAndSanitizeBlocks()` does not check the shape of non-`richtext`
   blocks** (`content-sanitizer.ts:79`). Low severity: React escapes text,
   and `img`/`video` sources do not execute.
7. **`Meeting` requires an audience and an org unit**, and invitations are
   keyed by `userId` (`notify.prisma:85,87,113`). Personal events and external
   attendees are not representable.
8. **The generated permissions index's `ADMIN` row includes comment fragments
   parsed as keys** (`docs/index/cross/permissions.md`, the `ADMIN` row of the
   roles table). This is a bug in the `scripts/build-index.mjs` scanner. The
   file is generated, so it is not hand-edited.
9. **Doc 13 §4 describes a core `communications` module reading `SMTP_URL`.**
   The code has `core/notifications` and `EmailChannel` reading `SMTP_HOST`.
   Doc 205's premise 3 already noted that doc 13 states intent, not
   mechanism. Doc 13 itself still reads as current.

## 12. Documents this changes

**Made in this change:** `docs/implementation/README.md` gains doc 254's
entry.

**Proposed, not made.** Each waits for the owner, or for the brief named:

| Document                   | Amendment                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Doc 253                    | §7 Q3's resolution and §6.2's XC row point to doc 254. Row I5 cites doc 233, and row I8 cites R-1 to R-12 |
| Doc 233                    | §3's "later a native screen" points to XW4. §9 gains S6 (JMAP). §10's "Drive" points to I8's library      |
| `launchpad-apps/README.md` | "Drive" is I8's library. The catalogue gains the three editor apps                                        |
| Docs 24 and 205            | "My meetings" is the seed of XW5's calendar                                                               |
| Doc 35 (`rag`)             | Non-PDF content reaches `rag` as I8 PDF renditions, so the PDF-only boundary stands                       |
| Doc 139                    | Its gateway's trigger is met only under OQ1 options A or C                                                |
| Doc 229                    | Its `.xlsx` reader goes in core so non-pack importers can use it (§5 ruling 8)                            |
| `MULTI-SECTOR.md`          | The capability table gains `wordprocessing`, `spreadsheets` and `presentations`                           |
| `RETAIL-ERP.md`            | If OA3 is adopted, R2 gains the authored-document case                                                    |

## 13. The five pillars

| Pillar              | How this program protects it                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proper architecture | One core seam, three survivably absent core modules, and two extensions of existing modules. No pack, no new `KNOWN_MODULE_COUPLINGS` entry, no conditional on sector or engine. One store per kind of fact: I8 for files, Stalwart for messages, `notify` for events (§5)                                                           |
| Scalable systems    | Versions deduplicated by content hash and coalesced. Library lists keyset-paginated. One engine per deployment with capacity measured before enabling. Node ownership and blob replication named for Organization edition (OA3). No size or capacity number invented (§6.4)                                                          |
| Secure by design    | Per-object grants enforced server-side, with role permissions for capabilities only. Private-by-default bytes as a prerequisite (R-5, finding 2). Session minting session-only, short-lived and evidence-audited. The engine isolated without database credentials. Data connections under the viewer's grants. No mailbox passwords |
| Stable & reliable   | The engine is never part of readiness. A refused save becomes a reviewable row, never lost. Version appends are predicated on the base version. Idempotent save, attachment and reply keys. Mail's data plane survives its control plane (doc 233)                                                                                   |
| Observable          | Structured `Logger` in every service. Engine health on the settings screen. Unapplied saves and provisioning problems in queues, never only in logs. Sharing and session issuance audited. No APM is claimed: ADR-017 stays open, and the engine's own metrics stay off until a metrics backend is adopted, as with LiveKit          |

## 14. Out of scope (named, not silently skipped)

- **I4 internal chat, I7 e-signature, I1 knowledge base and I8 itself**: doc
  253 XC and X0.6.
- **Note-taking, forms, whiteboards, and diagramming beyond BPMN.** None was
  named by the owner or the research.
- **Generated business documents modules already render**, such as invoices
  and receipts. They stay their modules' print pages. Moving them onto
  `wordprocessing` templates would be a separate decision.
- **Building a mail server, a calendar server or a media server.** Stalwart
  and LiveKit stay.
- **Bulk and marketing mail**: `marketing`.
- **Webinars, recording and video features beyond doc 205.**
- **A multi-tenant shared engine.** It is excluded by OA4's reasoning, as
  ADR-074 excluded a shared LiveKit.
