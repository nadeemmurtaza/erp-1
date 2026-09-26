# 140 — A general EAV model, built by explicit owner override (ADR-026), narrowed to stay queryable

> **Status: shipped (2026-09-26), WO-140.1/140.2/140.3/140.4.**
> `EntityAttribute` (`entity-attributes.prisma`) + `EntityAttributeService`
> are live. Two corrections against this document's own sketch:
>
> - **No `organizationId`** — corrected against this repository's own
>   ADR-044/ADR-040 (this deployment IS the tenant), the same correction
>   already applied to doc 104's own `CustomFieldDefinition`. See
>   `DECISIONS.md` ADR-049.
> - **The "runtime-checked list of known Prisma model names" this document
>   asks for is `Prisma.ModelName`** — the client's own auto-generated
>   registry, always in sync with the schema on every `prisma generate`,
>   never a hand-maintained array that could drift. The acceptance
>   criterion below asking for "a clear error naming the valid options" is
>   narrowed in practice: `Prisma.ModelName` lists 260+ models today, so
>   `setAttribute()` names the *rejected* value, not an enumeration of
>   every valid one — the same trade-off a 400 on an invalid enum value
>   makes anywhere else in this codebase.
>
> `deleteAll()` is wired into `PurchasingService.remove()` for `Supplier`
> — the same first worked example doc 104 used — and nowhere else yet;
> the next entity to adopt this mechanism must wire its own deletion path,
> per this document's own "real, standing maintenance obligation" above.
> Wired through a new `SupplierDeleted` domain event, not a direct
> cross-module call: `purchasing` publishes it, and
> `EntityAttributeSupplierDeletedListener` (inside `entity-attributes`
> itself) subscribes — `check-module-boundaries.mjs` refuses a module
> importing another module directly, and this is exactly the "publish a
> domain event" escape hatch it names.
> `EntityAttributeEditor` (generic key/value UI) is embedded on the
> Supplier detail screen alongside doc 104/105's own bounded
> `CustomFieldFormSection`. Access is gated per-entity-type via a
> maintained `ENTITY_TYPE_EDIT_PERMISSION` map in
> `EntityAttributesController` (currently `{ Supplier: 'suppliers.manage'
> }`) — an entity type not on that map is refused, never defaulted to "any
> signed-in user may edit."

Doc 104 scoped a bounded, code-known custom-field overlay instead of a
general EAV (Entity-Attribute-Value) model, for a specific reason: an EAV
table with no entity allowlist produces untyped, unindexable, unreviewable
queries. The owner reviewed that reasoning and instructed, per ADR-026,
that the general form be built anyway, for near-term flexibility as
requirements are discovered — a new entity type should be extensible
without a code change to add it to an allowlist, unlike doc 104's own
design. This document builds that general form, keeping doc 104's own
specific risk in view rather than pretending it disappears.

## 1. A true EAV model: any entity, any attribute, no code-known list

```prisma
// additive — coexists with doc 104's own bounded CustomFieldDefinition,
// which remains in place for the entities it already covers; this model
// is the general fallback for any entity doc 104's own allowlist does not
// (yet) name, and for ad hoc attributes nobody anticipated wiring up.

model EntityAttribute {
  id             String   @id @default(cuid())
  organizationId String
  /// No code-known allowlist — any Prisma model name a caller supplies.
  /// This is the exact property doc 104 declined: nothing in this schema
  /// stops a caller from naming a table this mechanism was never
  /// reviewed against.
  entityType     String
  entityId       String
  attributeKey   String
  /// Stored as text; typed interpretation (number, date, boolean) is a
  /// caller-side convention, not a database constraint — the direct
  /// consequence of accepting doc 104's own named EAV trade-off.
  attributeValue String
  valueType      String   @default("TEXT")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, entityType, entityId, attributeKey])
  @@index([organizationId, entityType, entityId])
}
```

## 2. The mitigations doc 104 named as the real risk, applied rather than removed

- **No foreign key to the target entity** — `EntityAttribute.entityId`
  cannot be a real Prisma relation, because `entityType` varies; this
  means **deleting an entity does not cascade to its attributes**
  automatically. `EntityAttributeService.deleteAll(entityType, entityId)`
  must be called explicitly by every entity's own deletion path that
  opts into this mechanism — a real, standing maintenance obligation, not
  a one-time cost, named here so it is not silently forgotten by the next
  entity that adopts this table.
- **No server-side query filtering by attribute value at scale** —
  `attributeValue` is untyped text with no index beyond the lookup key
  above; a "find every supplier with `carbon_footprint_kg > 10`" query
  against this table requires a full scan of matching rows, not an
  indexed range query. Where that access pattern becomes real and
  frequent, the correct fix remains what doc 104 already stated: promote
  that specific attribute to a real column via a forward-only migration,
  never optimize the EAV table itself into pretending to be relational.
- **No compile-time guarantee an `entityType` string is spelled
  correctly** — `"Suplier"` (a typo) silently creates orphaned attributes
  no query will ever find attached to a real `"Supplier"` row. This
  document does not solve this — it names the mitigation available:
  `EntityAttributeService.setAttribute()` is the *one* write path,
  validating `entityType` against a runtime-checked (not compile-time)
  list of known Prisma model names, catching a typo at write time even
  though the schema itself cannot.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: no new actor; writes go through
`EntityAttributeService`, gated by whatever permission the target entity's
own edit screen already requires.
**Whose rows, and which columns** — `organizationId`-scoped exactly as
every other client-configurable row in this repository; an
`EntityAttribute` is visible only to a caller who can already see the
entity it's attached to (checked by re-resolving the entity's own
visibility rule at read time, since this table carries no independent
authorization logic of its own).
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: an attribute value carries no money or stock
authority of its own; if a future attribute *does* start driving a real
decision, that decision has outgrown this mechanism per doc 104's own
"application logic never branches on a custom field" rule, restated here
unchanged.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none / The period that already moved / The second legal entity / Dry run
before live** — n/a: a display/reporting attribute, never a money or
stock fact, never a computed rule.
**Three silhouettes** — Solo: rarely used. Chain/Organization: the value
case doc 104 already named, now reachable for any entity without a code
change first — the explicit trade this document exists to deliver.
**The absent collaborator** — n/a: this table has no dependency on any
optional module.
**The second copy of the write** — `@@unique([organizationId, entityType,
entityId, attributeKey])` makes `setAttribute()` an upsert, never a
duplicate row for the same key.
**The hundred-thousandth row** — unlike doc 104's bounded overlay (a JSON
column on a handful of entities), this table can genuinely grow
unbounded across every entity type in the system; `@@index([organizationId,
entityType, entityId])` bounds the one query this mechanism must serve
fast ("all attributes for this one entity"), but a cross-entity attribute
search remains, by design, the slow path named above.
**The reversal document / The undo fan-out** — n/a: an attribute
overwrite is a plain update; there is no reversal concept beyond editing
or deleting the row.
**The version stamp** — `updatedAt` records the last change; no history
of prior values is kept unless a future need names it (a real, separate
audit requirement, not assumed here).
**The erasure the ledger cannot obey** — an `EntityAttribute` could hold
personal data if an admin defines one carelessly (e.g., attaching a
"personal note" attribute to a `Contact`); with no foreign key to enforce
cascade-on-delete, an erased `Contact`'s own attributes are **not**
automatically removed — `deleteAll()` must be called by the entity's own
deletion path, named here as a real, easy-to-miss obligation for every
future adopter of this mechanism.
**The failure path** — `setAttribute()` rejects an unrecognized
`entityType` at the runtime-checked list above, never silently creating an
orphaned row for a misspelled entity name.

## Work orders

**WO-140.1 — schema**: `EntityAttribute`, forward-only migration.
**WO-140.2 — `EntityAttributeService`**: `setAttribute()`, `getAttributes(entityType, entityId)`, `deleteAll(entityType, entityId)`, each validating `entityType` against a maintained, runtime-checked list.
**WO-140.3 — wire `deleteAll()` into every entity deletion path that opts in** — starting with whichever entities this mechanism is actually first used for; never assumed automatic.
**WO-140.4 — UI**: a generic attribute editor (key/value pairs) embeddable on any entity's own detail screen, alongside doc 104's own bounded custom-field renderer where both coexist on the same entity.

## Acceptance

- Deleting an entity that has opted into `deleteAll()` leaves no orphaned
  `EntityAttribute` rows.
- `setAttribute()` rejects an `entityType` not on the runtime-checked
  list, with a clear error naming the valid options.
- A cross-entity attribute search is never assumed fast; any screen that
  needs one states its own expected result-set size and a pagination
  bound.

## Out of scope

Automatic promotion of a frequently-queried attribute into a real column —
named as the correct next step once a real access pattern justifies it,
per doc 104's own already-stated escape hatch, not automated by this
mechanism itself.
