# 222 — Members and customers

> **Industry-specific module.** This belongs to the **housing-society sector pack** (real estate / society management), not to `core`. It is enabled only in housing-society deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Module: `society-members`. One job: **know who each
> person is to the society.**

## 1. One person, several roles

Every human or company is **one `Party`** (the existing parties module). Role
rows say what they are *to the society*:

| Role table | Fact |
|---|---|
| `Member` | owns a booking/plot; `memberNo` (`PREFIX-YEAR-SEQ`, node-safe), joined date, status (`ACTIVE` `INACTIVE` `DECEASED` `CANCELLED`) |
| `Residency` | lives at a plot: `plotId`, `partyId`, `kind` (`OWNER_OCCUPIED` `TENANT` `FAMILY`), `from`, `to?` |
| `Nominee` | named by a member: `memberId`, `partyId`, `relation`, share %, `expiresAt?` |
| `JointHolder` | co-owner of a booking with a share % (sum must be 100, checked) |

The same person can hold all four at once; a deletion or edit of the Party
changes every role consistently, and no second people table exists.

## 2. What is stored (and what is protected)

* Name, father/spouse name, contact, address, photo, identity number, passport
  (overseas members), occupation, next of kin — in `Party` plus
  `MemberProfile` for society-only fields (via custom fields, so a client adds
  fields without a migration).
* **Identity verification**: the existing `identity-verification` module
  (doc 18; NADRA-style lookup) is an **optional** extension point — absent,
  staff enter and attach copies manually; present, the check result is
  stored with a timestamp, never replaces the staff's own sign-off.
* **Sensitive columns** (ID number, bank, nominee shares) are masked unless
  the viewer holds `society.members.sensitive`; every reveal is audited.
* **Documents**: scanned ID, photos, agreements via `StorageService` with
  type and expiry; shown by category, not as a flat dump.

## 3. Duplicate prevention

A new member runs a **match check** on identity number, phone and
name+father's name (fuzzy). A probable duplicate is shown *before* creation
with "use this person" as the default — the cure for the classic
spreadsheet problem of one buyer entered five ways. Merging two `Party` rows
is the existing parties merge; role rows follow it, and the merge is a
reversible, audited document, never a delete.

## 4. Staff

Society staff are core `User` + `Employee` (docs 19–22), not a new table;
this pack only adds a society-scoped role set (doc 228) and, for gate
guards, a narrow role.

## 5. Member portal

Opt-in per society. A member logs in (phone/OTP via existing auth) and sees
*only their own rows*: plots, booking, installment schedule, dues, receipts,
statements, complaints, documents to download. No permission key beyond the
portal grant; the scope is the member's id (own-row lens). Anything they can
do (pay, complain, request a transfer) is a *request* the office reviews.

## 6. States the screens ship

Empty (no members yet → "Add member or import from Excel"), loading, search
no-results, duplicate-found, missing-document warning, deceased member
(nominee flow, doc 223 §6), cancelled member. Seven widths; targets ≥ 44 px.

## 7. Permissions

`society.members.view`, `society.members.manage`, `society.members.sensitive`,
`society.members.merge` (second signature). Portal: `society.portal.view`.

## 8. Acceptance criteria

1. A person entered twice is caught by the match check ≥ 95% on a seeded set of 200 near-duplicates (measured, quoted).
2. Joint holders' shares always sum to 100%.
3. A portal user cannot read another member's rows via the API (test, every endpoint).
4. Revealing a masked ID writes an audit row.
5. A member who is also a resident and nominee is one `Party`.

## 9. Work orders

222.1 role tables + profile · 222.2 match check + merge · 222.3 member screens
+ documents · 222.4 portal (own-row) · 222.5 sensitive-field masking + audit.
