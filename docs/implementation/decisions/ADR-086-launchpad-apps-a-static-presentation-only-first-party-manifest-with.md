# ADR-086 — Launchpad apps: a static, presentation-only first-party manifest with tier/sector/audience tags; Mail as a control plane over a mail engine; Auction bids as predicate-on-write records

[← Decision log](../DECISIONS.md)


### Context

The owner is building an Odoo-style launchpad that groups modules into mini
apps (core and industry-specific, tagged B2B/B2C/C2C) and approved three new
apps: Mail, Auction, and a Vault & Work Credit app (docs 232–235). Docs
184–195 already define a different thing — third-party directory apps that are
always remote services (ADR-073). `MULTI-SECTOR.md` already rules that business
models cut across sectors.

### Options Considered

1. **App = module with declared dependencies (Odoo-style).** Rejected: turns app
   dependencies into code dependencies and breaks module independence.
2. **App = presentation manifest over independent modules (chosen).**
3. **Audience (B2B/B2C/C2C) as a folder/category.** Rejected: one app belongs to
   several; the repository already treats business models as cutting across
   sectors. Chosen: three tags — tier, sector, audience.
4. **Build a mail server.** Rejected: deliverability, spam, storage and abuse
   are an operations burden. Chosen: control plane over a mail engine (doc 13's
   Stalwart) behind an interface, gated on proof-of-concept spikes.
5. **Ship C2C auctions in the first release.** Rejected: needs escrow,
   reputation and dispute handling the platform lacks. `C2C` is a reserved tag.

### Decision

Options 2, 3, 4, and a B2C/B2B-first auction. The launchpad resolves tiles
server-side from permissions, `MODULES` and a per-tenant `AppEnablement`
setting. Directory (third-party) apps appear as tiles but their trust model
(doc 184 §2) is unchanged.

### Parameters

See doc 233 §6 (quotas, send limits, retries), doc 234 §12 (increment 5%,
anti-snipe 2 min / 30 min cap, 10 bids/min, 72 h payment window, 3 strikes,
2-of-3 sealed opening, hot-lot 50 bids/s). All are proposals in `Setting`,
versioned and audited.

### Reasoning

Keeps module independence and the third-party boundary intact, uses tags where
the domain is genuinely multi-valued, avoids owning mail infrastructure, and
puts the one hot concurrency invariant (current bid) behind one writer.

### Consequences

A new `check-launchpad` lint. Mail depends on spikes S1–S3 passing. Auction
deposits depend on a `payments` hold capability not yet verified, so v1 may run
without deposits. Auction legality needs per-market review. C2C stays unbuilt.

### Status

Proposed. Nothing built.

### ADR-086 addendum (2026-10-02) — vault protection mode: both ship, chosen per vault, no default

Owner decision, "keep both for now": sealed vaults support `CLIENT_SIDE` and
`SERVER_HELD` protection modes, selected by a vault's owners at creation, with
no global default (`vault.defaultMode` unset until the owner sets one).
Reasoning: neither mode dominates (confidentiality from the operator vs.
recovery and search), and the owner chose not to decide for every client in
advance. Cost accepted: two key providers behind one `VaultKeyProvider`
interface, and two sets of key-handling tests. Downgrade to `SERVER_HELD`
needs every owner; upgrade destroys the server-held key. Revisit with usage
evidence after the first client vaults. Doc 231 §3.3 holds the detail.
