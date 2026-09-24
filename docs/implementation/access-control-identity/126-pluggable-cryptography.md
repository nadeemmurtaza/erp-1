# 126 — Cryptographic agility: today a fixed, correct default; a real, narrow gap for the one algorithm this repository would actually need to rotate

> **Status: this document's own recommendation stands, again.** Per
> **ADR-026** (`DECISIONS.md`), the owner briefly instructed that a
> dedicated crypto microservice be built anyway (specified as doc 146).
> Per **ADR-027**, the owner reviewed the actual security exposure a
> separate, network-reachable crypto service adds and reversed that
> instruction — doc 146 is withdrawn and deleted. This document's own
> in-process `PasswordHasher` interface is this repository's own current,
> standing mechanism for cryptographic agility.

"Abstract encryption protocols away from the application layer into a
dedicated security service. This allows security teams to rapidly swap
out hashing algorithms globally when future computing advancements render
current encryption standards obsolete" names a real, legitimate long-term
concern (cryptographic agility) applied against this repository's own two
actual cryptographic mechanisms — checked individually, because "swap
hashing algorithms" and "swap encryption" are two different primitives
with two different real answers here.

## The two mechanisms, checked individually

- **Password hashing** — `bcryptjs` (`apps/api/package.json`), called
  directly from `auth.service.ts`/`password.util.ts`, with no interface
  between the caller and the specific algorithm. Bcrypt is a reasonable,
  currently-secure default; the honest gap is that **swapping it would
  today mean changing every call site**, not a configuration change.
- **Secret-at-rest encryption** — `encryptSecret`/`decryptSecret`
  (`packages/shared/src/secret-crypto.ts`), a fixed AES-256-GCM
  implementation, moved to `@newax/shared` specifically because House
  Rule 11 requires a rule enforced in two places to live in the shared
  package — already centralized, but centralized as *one function*, not
  as a pluggable *provider* a second algorithm could sit behind.

## Why a full "dedicated security service" is oversized for what this actually needs

A separate, dedicated microservice for cryptography is doc 92's own
already-declined architecture applied to security specifically — a real,
large operational commitment (a new deployable, a new network hop every
password check or secret decryption would pay) for a problem this
repository can solve with the identical pattern used everywhere else:
an interface with a version tag, not a service boundary.

## The narrow, correct answer: a versioned hashing/encryption interface, in-process

```ts
// A rotation-ready interface, never a full pluggable-algorithm-at-runtime
// system a client could misconfigure into weak crypto — the choice of
// which algorithm is a code-level, reviewed decision, but a PAST hash's
// algorithm identity travels with it so an old one can be verified and
// transparently upgraded on next successful login:
interface PasswordHasher {
  readonly version: string; // "bcrypt-v1", "argon2id-v1"
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, storedHash: string): Promise<boolean>;
}

// User.passwordHash already implicitly carries its own algorithm identity
// (bcrypt's own hash format prefix, $2b$...) — the missing piece is a
// registry keyed by that prefix, so a future argon2id migration verifies
// an old bcrypt hash correctly and re-hashes with the new algorithm on
// that same successful login, never a forced mass-reset.
```

This is the actual, useful form of "cryptographic agility" for a password
hash: **rotation on next use, not a big-bang global swap** — the same
"a policy change only applies going forward, an old record keeps the
meaning it had when created" discipline this repository already applies
to `TaxRate` and `ApprovalChain` (doc 96), applied here to a hashing
algorithm's own version tag instead of a policy version.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: this is an internal cryptographic
primitive, not a counterparty.
**Whose rows, and which columns** — `User.passwordHash` is never exposed
by any read endpoint today, unchanged by this document.
**The threshold nobody approves alone / The toxic pair** — n/a.
**Authority and blast radius** — changing the *default* hashing algorithm
for new hashes is a code-level, reviewed change (never a runtime
toggle a compromised admin account could downgrade), consistent with
"the choice of algorithm is a code decision" above; the blast radius of
getting this wrong is every future password, which is exactly why it
stays a reviewed code path, not a `Setting` row.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none / The period that already moved / The second legal entity / Dry run
before live** — n/a.
**Three silhouettes** — identical treatment at every scale; this is not a
per-tenant-configurable concern.
**The absent collaborator** — n/a: password hashing is core, never
optional.
**The second copy of the write** — n/a: a hash rotation on login is a
single, idempotent `passwordHash` update.
**The hundred-thousandth row** — n/a: no new table; the version identity
already lives inside the existing hash string's own format prefix.
**The reversal document / The undo fan-out** — n/a.
**The version stamp** — restated as the entire mechanism: an old hash's
own algorithm identity travels with it, verified correctly, upgraded
transparently, never silently reinterpreted under a new algorithm's own
verification logic.
**The erasure the ledger cannot obey** — n/a: unchanged from today's
existing password-storage answer.
**The failure path** — a corrupted or unrecognized hash format fails
login safely (the same constant-time-failure discipline
`auth.service.ts`'s own existing comment already establishes for "a real
bcrypt hash of a value nobody knows"), never silently treated as a match.

## Work orders

**WO-126.1 (named, small, not urgent)** — wrap `bcryptjs` behind the
`PasswordHasher` interface above, with `bcrypt-v1` as the only registered
implementation today — a rotation-ready seam, not a rotation itself,
since no current requirement to move off bcrypt exists. **WO-126.2
(deferred)** — a second algorithm implementation (e.g., argon2id) is
added only once a real reason (a security audit finding, a compliance
requirement) names it, per `CLAUDE.md`'s own "No speculative
functionality."

## Acceptance

- No behavior change for any existing password — an old bcrypt hash
  continues to verify correctly through the wrapped interface.
- Adding a second `PasswordHasher` implementation requires no change to
  `auth.service.ts`'s own call sites, only a registry entry.

## Out of scope

A dedicated, separately-deployed cryptography microservice — declined for
the same reasons doc 92/125 decline a service mesh; a versioned interface
in-process already delivers real rotation-readiness without the
operational cost of a network hop on every password check. Encryption-at-
rest algorithm pluggability for `secret-crypto.ts` — named as a real,
identically-shaped future improvement, not built in this pass since no
concrete need to rotate off AES-256-GCM exists today.
