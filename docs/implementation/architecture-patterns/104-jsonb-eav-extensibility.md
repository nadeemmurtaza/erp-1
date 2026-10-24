# 104 — Custom fields: a narrow, bounded JSONB overlay, never a general EAV model

> **Superseded in part.** This document's own engineering recommendation
> (a bounded, code-known overlay, never a general EAV model) stands as
> written and remains in production use for the entities it already
> covers. Per **ADR-026** (`DECISIONS.md`), the owner explicitly instructed
> that the general EAV form be built anyway, for near-term flexibility —
> see **doc 140**, which builds it as an *additional*, coexisting
> mechanism rather than a replacement of this one. Both are live; this
> document's own reasoning for keeping this overlay bounded is unchanged
> and doc 140 cites it directly.
>
> **Status: shipped (2026-09-26), WO-104.1/104.2/104.3.**
> `CustomFieldDefinition` + `CustomFieldValueType` (`custom-fields.prisma`)
> and `Supplier.customFields Json` are live; `CustomFieldsService`
> validates every value against its own definition's `valueType` before
> writing. No `organizationId` — corrected against this repository's own
> ADR-044/ADR-040 (this deployment IS the tenant), not the doc's own
> sketched required column. Admin screen at Settings > Custom fields
> (`settings.custom-fields.manage`); the generic form-section renderer
> (doc 105) is embedded on the Supplier detail screen.

"Store custom attributes in flexible, schemaless database columns... This
allows administrators to add new business fields (e.g., a 'Carbon
Footprint' metric for suppliers) at runtime without requiring hardcoded
database migrations" names a real, common ERP need — a client wants to
track one extra fact this schema was never designed around — but names
the wrong mechanism for it. A full **EAV (Entity-Attribute-Value)** model
(a generic `EntityAttribute` table holding `entityType`/`entityId`/
`attributeKey`/`attributeValue` for *any* entity) is the specific
anti-pattern this repository's own "rows over enums, not columns over
rows" discipline exists to avoid: an EAV table has no foreign keys, no
column types, no `NOT NULL` constraints, and turns every query that needs
the custom field into an untyped join nobody can index sensibly. This
document scopes the bounded version of the same idea that this
repository already partially uses (`Setting.value: Json`, per
`core.prisma`) and extends it narrowly, per-entity, rather than
generically.

## 1. `CustomFieldDefinition` + a JSONB overlay column, one per entity that needs it — never one universal EAV table

```prisma
// additive, per entity that opts in — e.g. Supplier

model CustomFieldDefinition {
  id           String  @id @default(cuid())
  organizationId String
  entityType   String   // "Supplier", "Product" — a closed, code-known list,
                         // never an arbitrary string a client could point at
                         // a table this mechanism was never wired into
  key          String   // "carbon_footprint_kg"
  label        String
  valueType    CustomFieldValueType // TEXT | NUMBER | BOOLEAN | DATE
  isRequired   Boolean @default(false)

  @@unique([organizationId, entityType, key])
}

enum CustomFieldValueType { TEXT  NUMBER  BOOLEAN  DATE }

// on Supplier (and any other entity that opts in):
model Supplier {
  // ...existing fields unchanged
  customFields Json @default("{}")  // { "carbon_footprint_kg": 42.5 }
}
```

The critical difference from EAV: **`entityType` is a closed list of
entities this repository's own code explicitly wires up**, never an
arbitrary string a client could point at any table — adding `Supplier` to
the wired-up list is a small, reviewed code change (one Prisma field, one
admin-form-rendering branch); the *values* under it are schemaless, the
*shape of where they can live* is not. This is the same bounded-JSON
discipline `Setting.value` already uses for configuration, applied here
to a handful of named business entities instead of global settings.

## 2. Why this stays narrow, deliberately

- **Custom fields are never queryable at production scale by this
  mechanism** — a JSONB column can be indexed with a GIN index for
  containment queries, but this repository's own performance discipline
  ("no index added just because it seems generally useful") means a
  custom field a client adds for their own reference is a *display and
  filter-in-the-UI* field, never assumed to need a fast server-side
  `WHERE customFields->>'carbon_footprint_kg' > 10` query at first —
  that upgrade, if a real client needs it, is a promoted real column via
  an ordinary forward-only migration, exactly the "if it turns out to be
  optional long-term, it becomes a real Setting/column" escape hatch doc
  37's own `FeatureFlag` lifecycle already establishes for a different
  kind of flag.
- **Application logic never branches on a custom field's value** — a
  custom field is metadata a human reads, never a business rule input
  (that would make it invisible, untyped, unreviewed logic hiding inside
  a JSON blob) — if a custom field starts driving a real decision
  (pricing, compliance gating), it has outgrown this mechanism and needs
  its own real, reviewed column, per the same "rows over enums" reasoning
  once a field's *value* matters to code, not just to a report.

## Scope lenses

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: no new actor; a definition is created by
an authenticated admin under `settings.custom-fields.manage`.
**Whose rows, and which columns** — `CustomFieldDefinition` and every
entity's own `customFields` column are scoped by `organizationId` exactly
as every other client-configurable row in this repository already is.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: adding a custom field definition commits no money
or stock; the audit row is `AuditService`'s own existing create-event log.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none / The period that already moved / The second legal entity / Dry run
before live** — n/a: this is a display/reporting overlay, never a
money or stock fact, never a computed rule.
**Three silhouettes** — Solo: rarely used, a nice-to-have field or two.
Chain/Organization: real value — different brands or regions track
different compliance attributes without a schema fork per client.
**The absent collaborator** — a `CustomFieldDefinition` for an entity type
this document's own wired-up list does not cover simply cannot be
created — the admin UI only offers entity types this repository has
actually wired a rendering branch for.
**The second copy of the write** — n/a: a `customFields` JSON write is an
ordinary field update on the entity's own existing row, subject to the
exact same concurrency handling as every other field on that row.
**The hundred-thousandth row** — `CustomFieldDefinition` is small (tens
of rows per organization); each entity's own `customFields` column adds
negligible row size, bounded by however many fields an admin defines.
**The reversal document / The undo fan-out / The version stamp** — n/a:
removing a `CustomFieldDefinition` leaves existing values in the JSON
column orphaned but harmless (never read once the definition is gone),
the same "a stale key in a JSON blob is inert" reasoning that makes this
mechanism safe to evolve without a migration per change.
**The erasure the ledger cannot obey** — n/a unless an admin deliberately
defines a custom field that stores personal data, which the admin UI
should discourage but cannot technically prevent — named honestly as a
review responsibility, not a technical guarantee this mechanism provides.
**The failure path** — n/a beyond an ordinary write failure; a malformed
value against `valueType` is rejected at the admin form, never silently
stored as the wrong type.

## Work orders

**WO-104.1 — schema**: `CustomFieldDefinition`, `CustomFieldValueType`,
plus a `customFields Json @default("{}")` column on the first entity this
mechanism wires up (`Supplier`, per the bullet's own example).
**WO-104.2 — `CustomFieldsService`**: `defineField()`,
`setValue(entityType, entityId, key, value)`, validated against
`valueType`.
**WO-104.3 — UI**: a generic custom-field admin screen (define fields per
entity type) and a generic form-section renderer that any entity's own
detail screen can embed, reading its own `customFields` column and the
matching `CustomFieldDefinition` rows.

## Acceptance

- A new `CustomFieldDefinition` requires no code deploy or migration.
- Removing a definition does not error against existing rows carrying the
  now-orphaned key in their `customFields` JSON.
- No application business logic reads a `customFields` value to make a
  decision — verified by code review, since this cannot be enforced by a
  type system alone.

## Out of scope

A general EAV model spanning every entity in the schema — explicitly
rejected above as untyped, unindexable, and unreviewable at scale; this
mechanism is deliberately bounded to a small, code-known list of entity
types, extended one at a time as a real need names the next one.
