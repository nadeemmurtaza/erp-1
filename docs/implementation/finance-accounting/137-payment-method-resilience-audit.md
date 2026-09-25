# 137 — `PaymentProvider`, checked against a wallet, BNPL, and CBDC future

> **Status (2026-09-25): audit re-verified, no code change.** This doc's
> own claim was re-checked against the current
> `apps/api/src/modules/payments/payment-provider.ts` rather than trusted
> from its own text: `PaymentContext` still carries only `orderId`/
> `orderNumber`/`amount`/customer contact fields, and `PaymentInitiation`
> still resolves through `redirectUrl` (nullable) plus an opaque `meta`
> bag — no card number, no wallet-specific field, in either shape. The
> audit's own finding stands unchanged. No work order fires from this doc.

`PaymentProvider` (doc 15/50) already means a new payment method is a new
registered class, never a rewrite of `PaymentsService`. This document is
the specific audit: does the interface's own shape quietly assume "a
card number and a CVV," in a way that would break for a payment method
that has neither?

## What was checked, against three plausible near-future payment shapes

- **A wallet-based payment (Easypaisa/JazzCash, already supported)** —
  already proven to fit; no card number in the interface's own required
  fields.
- **Buy-now-pay-later (BNPL)** — a BNPL provider's own "charge" step
  usually returns a *pending* state (the actual approval happens
  asynchronously, on the provider's own timeline) rather than a
  synchronous success/failure. Checked against `PaymentProvider`'s own
  interface: it already supports this, because a card payment's own
  webhook-confirmed flow (`PaymentSucceeded` published from a callback,
  not synchronously from `charge()`) is the identical asynchronous shape
  BNPL needs — **no interface change required**, confirmed rather than
  assumed.
- **A CBDC or biometric-authorized payment (no card number, no wallet
  phone number — a cryptographic proof of payment instead)** — checked
  against the actual interface in `payment-provider.ts`: `PaymentContext`
  (the input every provider receives) already carries only `orderId`,
  `orderNumber`, `amount`, and customer contact fields — **no card number,
  no wallet-specific field anywhere in the required shape**, because
  every existing provider (cash, bank transfer, JazzCash, Easypaisa) is
  already written against a hosted-checkout/redirect model:
  `PaymentInitiation.redirectUrl` sends the customer to whatever the
  provider's own flow requires, and `meta?: Record<string, unknown>`
  already carries provider-specific detail opaquely.

## The actual finding: no gap, and why

This audit's real finding is the opposite of what it set out to check
for: **`PaymentContext`/`PaymentInitiation` already generalize correctly**,
because the redirect-based design doc 15/50 chose for entirely different
reasons (supporting a hosted-checkout flow at all) turns out to be
exactly the shape a wallet, a BNPL provider, or a CBDC/QR-code payment
also needs — none of them require the customer's payment credential to
ever pass through this repository's own backend, only a redirect and a
callback. A hypothetical `CbdcProvider` or `BnplProvider` implementation
would set `redirectUrl` to its own hosted flow and populate `meta` with
whatever provider-specific detail the storefront needs to display,
identical in shape to how `JazzCashProvider` already works.

## Scope lenses

Not applicable — this audit found no gap requiring a change; every
existing `PaymentProvider` implementation's own scope-lens treatment
(doc 15/50) is unaffected and unchanged.

## Work orders

None. This document records a clean audit result rather than a fix.

## Acceptance

- No interface or implementation change — verified by citation to the
  actual `PaymentContext`/`PaymentInitiation` shapes in
  `payment-provider.ts`.
- A hypothetical BNPL or CBDC provider implementation can be drafted
  against the existing interface with no interface change required,
  confirmed by sketching (not shipping) such a stub against the redirect/
  `meta` pattern above.

## Out of scope

Implementing a specific BNPL or CBDC provider today — no real requirement
names one yet; this document only confirms the interface would not need
rework when one is eventually built, per doc 36's own "write a typed
interface once a real, repeated need exists" rule.
