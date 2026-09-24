# 105 — Metadata-driven forms: the narrow case doc 104 already needs, not a general UI engine

"Decouple frontend views from fixed data models. The UI dynamically
renders forms and data tables based on JSON metadata payloads from the
server. If a new compliance law dictates a mandatory data field, updating
the metadata instantly updates the UI globally" describes two different
things worth separating: a **form-rendering engine driven entirely by
server metadata for every screen in the product**, and the **narrow case
doc 104's own custom fields already require** — rendering a form section
for whatever `CustomFieldDefinition` rows exist for one entity type. This
document builds the second, and explains why the first is a different,
much larger commitment this repository does not make.

## What doc 104 already needs, and this document supplies

Doc 104's own `CustomFieldsService` defines fields with a `valueType`
(`TEXT`/`NUMBER`/`BOOLEAN`/`DATE`), a `label`, and `isRequired` — exactly
enough metadata to render one generic form section:

```ts
// A small, purpose-built renderer — not a general "any screen" engine —
// consuming exactly the shape CustomFieldDefinition already produces:
interface CustomFieldFormSection {
  fields: Array<{ key: string; label: string; valueType: CustomFieldValueType; isRequired: boolean }>;
}
```

"If a new compliance law dictates a mandatory data field, updating the
metadata instantly updates the UI globally" is, for this bounded case,
already true: an admin adds a `CustomFieldDefinition` row with
`isRequired: true`, and the generic renderer immediately shows the new
mandatory field on every entity of that type's form — no frontend
deploy, exactly the claim, delivered by the narrow mechanism doc 104
already scopes.

## Why a general metadata-driven UI engine is not this repository's architecture, and should not become it

Every other screen in this repository — the payroll run detail, the
order fulfillment screen, the POS till — is a hand-built React component
with real, typed props, real business logic in its event handlers, and
real design-system compliance (Law 4's seven widths, the 48×48 touch
target, the "no dead end" rule). A general metadata-driven rendering
engine that generates *every* form and table from a server JSON payload
would mean:

- **Losing type safety at the exact place it matters most** — a
  `PayRunLine`'s `netMinor` field rendered generically loses the
  compile-time guarantee that a paisa-integer field is never accidentally
  formatted or edited as a floating-point rupee value.
- **Losing design-system enforcement** — `pnpm check:overflow`,
  `check:contrast`, and the 150 numbered design laws in `docs/design/`
  are checked against real, hand-authored components; a metadata-driven
  renderer would need its own parallel compliance-checking logic for
  every possible generated layout, effectively rebuilding the design
  system's own enforcement inside a generic interpreter.
- **No real, repeated need beyond doc 104's own bounded case** — every
  "new compliance field" this repository has actually specified this
  session (a `DeductionType`, a `TaxRate`, a `TrainingCourse`) is a real,
  typed Prisma model with its own admin form, not a generic metadata
  payload — because each one has real validation rules, real
  relationships, and real business meaning a generic renderer cannot
  express.

## Scope lenses

Not repeated — doc 104's own scope lenses already cover the bounded
custom-field case this document's renderer serves; a general engine is
explicitly not built, so it carries no lens treatment of its own.

## Work orders

**WO-105.1 — the generic custom-field form-section renderer**, consuming
doc 104's own `CustomFieldDefinition` shape — the one piece of metadata-
driven rendering this repository actually needs, scoped exactly to doc
104's own bounded mechanism.

## Acceptance

- Adding a `CustomFieldDefinition` with `isRequired: true` makes the
  corresponding field mandatory on the next form render, with no frontend
  deploy — proven by a spec/manual verification against doc 104's own
  mechanism.
- No other screen in this repository is rendered from a generic server
  metadata payload — verified by the absence of such a renderer anywhere
  outside doc 104's own custom-field use case.

## Out of scope

A general-purpose, server-metadata-driven rendering engine for arbitrary
forms and data tables across the whole product — named above as a real
capability with a real cost this repository's own design-system and
type-safety discipline is not willing to pay for a need doc 104's narrow
renderer already fully satisfies.
