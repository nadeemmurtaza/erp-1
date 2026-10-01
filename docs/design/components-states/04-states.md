# 04 · States and behaviour

What every element can be, and what each state promises the user.

Status: **partly built.** `EmptyState` and `Loading` exist and are used; the
full matrix below is enforced by review.

## The rule

**Designing only the resting state is designing a screenshot.** Most of the
time a user spends with an interface is spent in a state that is not the happy
path — loading, empty, denied, failed, stale, offline. Those are the design.

## The state matrix

Implement the states that logically apply. Not every component has all of
them; a component that has *only* `default` is almost certainly wrong.

| State | The promise it makes | Common failure |
|---|---|---|
| `default` | this is what it is | — |
| `hover` | this responds to you | animating too much (Chapter 05) |
| `focus` | keyboard is here **now** | removed for looking untidy — never do this |
| `pressed` | the input registered | omitted, so touch feels dead |
| `active` / `selected` | this is the current one | indistinguishable from hover |
| `disabled` | not available **and why** | greyed out with no reason given |
| `loading` | working, and roughly how long | a spinner for a 200 ms action |
| `success` | it is done and persisted | shown before the write commits |
| `error` | it failed, and what to do | the raw server message |
| `empty` | nothing here yet, do this | a bare "No results" with nothing to click |
| `stale` | shown data is out of date | silently showing old numbers |
| `offline` | queued, not lost | showing it as an error |
| `expanded` / `collapsed` | more exists here | no indication either way |
| `entering` / `exiting` | this arrived or left | replaced instantly, so it seems to teleport |

## Focus is not optional

A focus state that was removed because it looked untidy is an accessibility
defect, not a style choice. Chapter 07 sets the requirement; it is repeated
here because this is where it gets deleted.

## Disabled must explain itself

Greyed out with the reason left for the user to guess is a puzzle. Binding, in
`.claude/rules/ui.md`. Give it a tooltip, `aria-describedby`, or visible
adjacent text — and prefer *not rendering* an action the user can never take
over rendering it dead.

## Empty states

Every `EmptyState` carries an action, unless the primary action already sits
directly above it — a `PageHeader` create button, a filter row's clear control.
Binding.

Three different empties, often confused:

| Kind | Message | Action |
|---|---|---|
| **Nothing yet** | there is no data because none has been created | create one |
| **Nothing matched** | a filter excluded everything | clear the filter |
| **Nothing permitted** | data exists, this user may not see it | say so; do not pretend it is empty |

The third matters: showing "no orders" to someone who lacks
`orders.manage` is a lie that costs a support ticket.

## Loading

**Match the wait.** Three tiers, not one spinner:

| Wait | Treatment |
|---|---|
| under ~200 ms | nothing. A flash of spinner is worse than the wait |
| ~200 ms – 1 s | inline indicator on the control that was pressed |
| over ~1 s | skeleton matching the real content structure |

A skeleton mimics what is coming — the same rows, the same column widths. A
skeleton that does not match causes a visible jump when data lands, which is
worse than no skeleton. Skeletons respect reduced motion (Chapter 07) and never
replace a meaningful empty state or hide an error.

## Validation

- **Validate on blur, not on every keystroke.** Telling someone their email is
  invalid while they are typing it is nagging.
- **Re-validate on submit**, always, server-side. A client-side check is a
  convenience, never authorization (`.claude/rules/security.md`).
- **The message says how to fix it**, not what rule it broke. Chapter 06.
- **Errors land next to the field**, and the first invalid field takes focus.

## Confirmation and destructive actions

Prefer **undo** to confirmation. A confirmation dialog on every delete trains
people to click through it, so it stops protecting anything.

| Reversibility | Treatment |
|---|---|
| Reversible | do it, offer undo |
| Irreversible or wide, not financial, and the label says all there is to say | hold to confirm (`DNG-1`): `HoldToConfirm`, labelled with the act and its object, replaces the dialog |
| Irreversible, with consequences a person should read, or a count | a plain dialog whose confirm button is the verb and its object (`DNG-2`), the cancel button focused |
| Irreversible and high stakes | confirm by typing the object's name |
| Removing a whole account, workspace or brand | a cooling-off period (`DNG-6`): the request is accepted, the thing is hidden, and `CooldownBanner` says when it is purged and offers to restore it |

Every one of these stays on the page that owns the object, off the happy path
(`DNG-3`): a danger control is never the primary action, never beside it, and
the ones that belong together sit in a `DangerZone` at the end of the page
(`DNG-5`), closed by default. The state a danger control passes through is part
of its design: **idle**, **holding** (the ring filling), **released early**
(draining, nothing happened, and a screen reader is told so), **armed**
(assistive technology's first activation, with no time limit), **running**
(the control's own `loading`) and **cooling off**.

Irreversible here means irreversible in the domain, not in the UI: closing a
fiscal period is locking, and `accounting.manage_periods` says so in its own
permission label.

## Permission states

Permissions are capabilities, and the UI must reflect three outcomes, not two:

1. **Permitted** — render normally.
2. **Not permitted, and the user could have it** — show it disabled with the
   reason, so they know to ask.
3. **Not permitted, and it is irrelevant to them** — do not render it. A till
   operator should not see accounting chrome at all (RETAIL-ERP.md R14: every
   tier concept is invisible until the deployment has it).

The server enforces all three regardless. The UI choice is about clarity, never
about access.

## Notifications and system feedback

- **Inline beats toast.** Feedback belongs where the action happened.
- A toast is for something that finished elsewhere, or after a navigation.
- **Never a toast for an error the user must act on** — it disappears.
- Toasts stack at `z.toast` (Chapter 01), are dismissible, and never carry the
  only copy of information.

## Offline and degraded — the POS case

`apps/pos` is offline-first. A sale that already happened is never rejected by
sync (R5), so the till must distinguish three things the naive design collapses
into "error":

| Truth | Show |
|---|---|
| Written and confirmed by the server | done |
| Written locally, queued for sync | **queued** — with a count of what is pending |
| Rejected by the server after sync | a variance to resolve, not a failed sale |

Showing a queued sale as failed would make an operator re-ring it, which is a
double sale — a data defect caused by a state design mistake.
