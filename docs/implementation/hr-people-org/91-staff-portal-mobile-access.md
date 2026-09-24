# 91 — "Staff Portal" and mobile app: one PWA, doc 52's own words

"Provision of a dedicated 'Staff Portal' in addition to mobile app access
for employees to interact with the broader HR system" describes, as two
separate deliverables, what doc 52 (`52-staff-self-service-mobile-app.md`)
already built as one: "An installable PWA (`apps/pos`'s own proven
pattern) over self-service routes already required to work at every
width — clock-in, schedule, announcements — not a third native mobile
stack." A Progressive Web App installed on a phone *is* the mobile app;
the identical URL opened in a desktop browser at the `lg`/`xl` widths Law
4 already requires *is* the "Staff Portal" — one responsive application,
never two separately-built surfaces that could drift apart.

## What already exists, and what the two-name request risks if taken literally

- **The self-service routes** — clock-in, schedule, leave requests
  (payroll/leave), and, once doc 61 ships, bulletin-board announcements —
  are already scoped as one route tree in doc 52, required to satisfy Law
  4's seven widths already.
- **The risk this document names explicitly**: building a *second*,
  desktop-only "Staff Portal" web app alongside doc 52's PWA would violate
  `CLAUDE.md`'s own "No duplicate implementation" rule and create exactly
  the two-surfaces-that-drift-apart problem the design system's
  responsive-by-default discipline exists to prevent. "Staff Portal" is
  the marketing name for opening the same PWA on a laptop; it is not a
  second product.

## Scope lenses

Not repeated — doc 52's own scope lenses already answer every lens for
this exact mechanism; this document introduces no new schema, write
path, or permission.

## Work orders

None. If "Staff Portal" needs its own distinct marketing landing/login
page (a branded entry point distinct from the admin login), that is a
`brand.ts`-driven UI treatment on doc 52's own existing PWA shell, never
a second application.

## Acceptance

- No schema, service, or permission change — verified by citation to doc
  52's own existing mechanism.
- The same route tree renders correctly at both mobile (`xs`/`sm`) and
  desktop (`lg`/`xl`) widths, proven by `pnpm check:overflow`'s existing
  sweep, satisfying both the "mobile app" and "Staff Portal" framings from
  one implementation.

## Out of scope

A separate, desktop-only staff web application distinct from doc 52's
PWA — named above as a duplicate-implementation risk this document
explicitly declines to build.
