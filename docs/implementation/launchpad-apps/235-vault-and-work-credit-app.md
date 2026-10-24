# 235 — Vault & Work Credit app

> **Status: Planned.** Launchpad app (doc 232): tier **CORE**, audiences
> **INTERNAL, B2B**. This document **adds no new design**: the mechanisms are
> in [doc 231](../access-control-identity/231-work-attribution-and-sealed-access.md).
> It only defines the app that exposes them.

## 1. What the app is

Two things a person opens from one tile, kept as two pages (Law 5):

| Page | Job | Backed by (doc 231) |
|---|---|---|
| **Work credit** | see how my work is credited, with evidence; claim, dispute, endorse | §2 `WorkContribution`, `CreditClaim`, `CreditDispute` |
| **Vaults** | open a sealed vault I belong to; request/grant a scoped review link | §3 `SealedVault`, `ReviewGrant`, break-glass |

## 2. Manifest sketch (doc 232 §3)

`key: 'vault'`, tier `CORE`, audiences `INTERNAL`/`B2B`, stage `BETA`,
`modules: work-credit (required), vault (required)`, entries: *My credit*,
*Team credit* (needs `work.contribution.view_team`), *Vaults*, *Review links*,
*Access problems*. `anyOfPermissions`: `work.contribution.view_own`,
`vault.create`. Everyone sees **My credit** (every user holds
`work.contribution.view_own`); *Vaults* appears only for people who belong to
one or may create one.

## 3. Interaction with other apps

* **Mail (233):** each reply from a shared mailbox writes a contribution with
  the real sender. **Auction (234):** sealed-bid opening reuses the vault's key
  split. **Housing / Hospitality packs:** a client-confidential project file is
  a vault item; the *fact* of authorship stays visible, the content does not.

## 4. Build order

Per doc 231 §6 (WO-231.1–231.10), then the app shell: 235.1 manifest + tiles ·
235.2 nav entries and permissions seeded to real roles · 235.3 empty/loading/
error states and seven-width pass. The app is not "shipped" until a user
holding only `work.contribution.view_own` can open it and see their own
credit.

## 5. Decision recorded (owner: "keep both for now")

Both protection modes ship, chosen **per vault by its owners at creation**
(doc 231 §3.3): `CLIENT_SIDE` (strongest; a lost key is unrecoverable by the
platform) and `SERVER_HELD` (recoverable and searchable; weaker against a
malicious operator). **There is no default yet.** The create-vault screen shows
the comparison and requires a choice; `vault.defaultMode` in `Setting` can set
one later once real usage shows which owners prefer. Revisit after the first
client vaults exist, with evidence of which mode owners pick and how often keys
are lost.

The app shell adds one screen element for this: the vault page always shows the
active mode and what it does and does not protect against.
