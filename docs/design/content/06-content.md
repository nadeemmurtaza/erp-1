# 06 · Content

How the product speaks. Copy is interface, not decoration applied afterwards.

> **Status: partly built.** Two locales exist in
> `apps/web/messages/{en,ur}.json`, English in customer-facing JSX is already
> forbidden, and the terminology table below is the one word list. Admin pages
> and the POS write their strings as literals today (a named gap, `ITG-9`).
> There is still no error-message standard beyond the examples under
> "Errors", so most error strings are invented at their call site.

## Voice

**Plain, exact, and short.** The reader is at work, often in a hurry, and
frequently anxious — money and stock are involved.

| Do | Don't |
|---|---|
| "Stock updated." | "Great news! Your stock has been updated!" |
| "You need *Adjust stock* to change stock." | "Oops! Access denied." |
| "Two of six items are out of stock." | "Some items may be unavailable." |
| "Closing this period cannot be undone." | "Are you sure?" |

**Never apologise for the software's own rules.** "Sorry, you can't do that"
is worse than "Only an admin can approve a refund" — the second tells the
reader what to do next.

**Never blame the user.** "That email is already registered" not "You entered
an invalid email".

## Terminology — one word per concept

The most expensive content problem in an ERP is two words for one thing. Fix
the word once, here, and use it everywhere including code identifiers.

| Concept | The word | Never |
|---|---|---|
| A place stock lives | **location** | warehouse, branch, store (branch is a *node*, a different concept) |
| A sellable unit | **variant** | SKU (that is its code), item, product (that is the parent) |
| A person who buys | **customer** | client, user (a `user` is someone who signs in) |
| A person who supplies | **supplier** | vendor |
| Money owed to us | **receivable** | outstanding, due |
| A till session | **shift** | session, period (a *period* is fiscal) |
| Moving stock between locations | **transfer** | shipment, move |
| What a customer ordered | **order** | sale (a *sale* is the POS channel of an order) |
| Destroying a record | **delete** | erase, destroy |
| Taking a thing out of a list, cart or group without destroying it | **remove** | delete (that destroys), clear |
| Abandoning a flow or a form | **cancel** | back out, discard |
| Dismissing a notice, a finished dialog or a panel | **close** | cancel (nothing is being abandoned), dismiss |
| Storing a form | **save** (name the object when it is not obvious: "Save price") | submit, apply, update |
| Authenticating | **sign in**, **sign out**, **create account** | log in, login, register, sign up |

**Rule.** If a new noun is about to enter the product, it goes in this table
first. Two words for one concept is a defect, not a style difference.

## Labels

- **Verb for actions, noun for objects.** "Receive stock", not "Stock receipt",
  on a button.
- **Say what happens, not what the control is.** "Approve refund" beats
  "Submit".
- **Sentence case.** Not Title Case, not ALL CAPS.
- **No colons on labels.** The field already looks like a field.
- **Never "Submit", "OK", or "Click here."**

## Microcopy

Help text earns its place or goes. A hint under every field is noise that
trains people to ignore hints.

Write help text when: the field has a non-obvious format, a business
consequence, or a constraint the user cannot infer. Otherwise nothing.

## Error messages

The standard, and all three parts are required:

```
What happened  ·  Why  ·  What to do next
```

| Bad | Good |
|---|---|
| "Request failed" | "Couldn't save the order — the connection dropped. Your changes are kept; try again." |
| "Insufficient stock" | "Only 3 of 5 in stock at Main. Reduce the quantity, or transfer from another location." |
| "Forbidden" | "You need *Approve payments* to approve a bank transfer. Ask an admin to grant it." |
| "Validation error" | "Phone number needs the country code, like +92 300 1234567." |

**Never expose a stack trace, a SQL error, or an internal identifier.** That is
both a content failure and a security one (`.claude/rules/security.md`).

**The error names the actual constraint.** "Only 3 in stock" is useful; "not
enough stock" makes the user guess.

## Content hierarchy

One page, one message. The page title says the job; everything else supports
it. If three things on a screen compete for the title's role, the page has
more than one job (Law 5).

Order: what this is → what state it is in → what you can do → the detail.

## Localisation

- **No English in customer-facing JSX.** Binding. Text comes from
  `apps/web/messages/*.json`. Admin pages and the POS write literals today
  (`ITG-9` names the gap); that is not a licence for a new customer-facing one.
- **Never concatenate a sentence from fragments.** Word order differs between
  English and Urdu; build the whole string with placeholders.
- **Assume strings grow.** Urdu and German commonly run longer than English; a
  button sized to its English label will break.
- **Numbers, dates and money go through `@newax/shared`** — `formatMoney`,
  `formatDate`. Never `toLocaleString` at a call site.
- Urdu is right-to-left; that is layout as well as language, and it is
  [Chapter 07](../accessibility/07-accessibility.md).

## Verifying

```bash
# English leaking into customer-facing JSX, and stray formatting
grep -rn "toLocaleString\|toLocaleDateString" apps/web/src

# Brand leaks — Law 1 on the brand axis. Terms derive from brand.ts, so a
# rebrand rebrands the check. Part of `pnpm lint`.
pnpm check:rebrand
```

There is no automated check for voice, terminology or error-message shape
today. Chapter 09 says what that costs.
