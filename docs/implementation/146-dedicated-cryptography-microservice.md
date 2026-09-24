# 146 — A dedicated cryptography microservice, built by explicit owner override (ADR-026), as an optional deployment topology behind the same interface doc 126 already specifies

Doc 126 recommended a versioned, in-process `PasswordHasher` interface
over a dedicated crypto microservice, because a network hop buys nothing
for an algorithm swap an in-process interface already handles. Per
ADR-026, the owner instructed the dedicated-service form be built anyway.
This document reconciles the two: **the interface from doc 126 is the
actual abstraction that makes any of this safe to change; this document
adds a second implementation of it that happens to call out to a separate
service, for deployments that specifically want cryptographic operations
physically isolated from the application process** — a real, legitimate
requirement in some regulated environments (a hardware security module
behind the service, a compliance boundary requiring key material never
touch the application host's own memory), scoped honestly rather than
assumed to be a universal improvement.

## 1. The service, behind the identical interface doc 126 already defined

```ts
// doc 126's own interface, unchanged:
interface PasswordHasher {
  readonly version: string;
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, storedHash: string): Promise<boolean>;
}

// A second implementation, calling a separate crypto service instead of
// bcryptjs in-process — registered exactly like doc 126's own bcrypt
// implementation, never a parallel authentication path:
class RemoteCryptoServiceHasher implements PasswordHasher {
  readonly version = 'remote-crypto-v1';
  async hash(plaintext: string): Promise<string> {
    // mTLS call to the crypto service (reusing doc 145's own mesh
    // pattern for this specific internal boundary, if doc 145 is also
    // adopted — never a second, separately-secured transport).
  }
  async verify(plaintext: string, storedHash: string): Promise<boolean> { /* ... */ }
}
```

```ts
// The identical pattern extends to secret-at-rest encryption
// (secret-crypto.ts's own encryptSecret/decryptSecret), which gains the
// equivalent SecretCipher interface doc 126 named as future work:
interface SecretCipher {
  readonly version: string;
  encrypt(plaintext: Buffer): Promise<Buffer>;
  decrypt(ciphertext: Buffer): Promise<Buffer>;
}
```

## 2. Why this stays a deployment *option*, not the default

- **Every algorithm swap this repository will realistically ever need is
  already served by doc 126's own in-process interface** — a second
  `PasswordHasher` implementation registered in-process (e.g., moving
  from bcrypt to argon2id) requires no network topology change at all.
  This document's own service form earns its cost only when the
  *reason* for isolation is physical/regulatory (key material must never
  reside in the application process's own memory), not merely
  "algorithm agility" — doc 126 already delivers algorithm agility for
  free.
- **A network hop on every password check is a real availability and
  latency cost** — login now depends on a second service's own uptime.
  This is an accepted, deliberate trade for deployments that specifically
  need it, never the default for every deployment; the default
  implementation registered for `PasswordHasher` remains doc 126's own
  in-process `bcrypt-v1`, unchanged.
- **The crypto service's own key material is the actual asset being
  protected** — if this service exists, it is the one place a compromise
  is catastrophic (every stored hash's own verification secret lives
  there); it must run on its own isolated host/container, with its own,
  narrower attack surface (no HTTP routes beyond `hash`/`verify`/
  `encrypt`/`decrypt`, no database of its own beyond whatever key-storage
  mechanism it requires), and this is precisely why it is flagged for the
  `security` subagent's own review before any production deployment
  relies on it, per this repository's model-routing table — identical
  reasoning to doc 144's WASM sandbox gate.

## Scope lenses

**The actor with three tables / The principal with no permission key** —
the crypto service authenticates `apps/api`'s own calls via mTLS (doc
145's mesh, if adopted) or a static, rotatable service credential if not
— a service-to-service principal, not a `User`.
**The grant that ends itself** — a compromised service credential is
rotated immediately, invalidating the old one; per doc 145's own
certificate-revocation answer if the mesh is used, or a `Setting`-stored
rotatable key otherwise.
**Whose rows, and which columns** — n/a: the crypto service holds no
business data of its own, only key material and the narrow
hash/encrypt/decrypt operations.
**The threshold nobody approves alone / The toxic pair** — n/a: this is
infrastructure, not a business authorization decision.
**Authority and blast radius** — who may deploy or reconfigure the crypto
service is an infrastructure-operator action; the blast radius of a
compromise here is total (every password hash, every encrypted secret)
which is exactly why isolation is the entire point of choosing this
implementation over doc 126's simpler one.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none / The period that already moved / The second legal entity / Dry run
before live** — n/a: infrastructure, not a business fact.
**Three silhouettes** — Solo/Chain: essentially never justified — the
in-process interface already serves every real need at this scale.
Organization, and specifically a regulated-industry deployment: the one
plausible real case this document exists for.
**The absent collaborator** — if the crypto service is unreachable, login
and secret-decryption fail closed (never fall back to a weaker, unaudited
local implementation) — the same fail-closed discipline doc 145's own
mesh answer already establishes for an invalid certificate.
**The second copy of the write / The hundred-thousandth row / The
reversal document / The undo fan-out / The version stamp** — n/a beyond
what doc 126's own interface already answers; this document changes only
where the interface's implementation runs, not its own versioning
discipline.
**The erasure the ledger cannot obey** — n/a: the service holds no
personal data, only key material and opaque hash/ciphertext operations.
**The failure path** — a timeout or error calling the crypto service
surfaces as a login/decryption failure, logged and alerted on, never
silently retried against a weaker fallback path.

## Work orders

**WO-146.1 (flagged for `security` subagent review before production
adoption)** — build and isolate the crypto service (its own host/
container, minimal attack surface, no routes beyond the four operations
named above).
**WO-146.2 — `RemoteCryptoServiceHasher`/`RemoteCryptoServiceCipher`**,
implementing doc 126's own `PasswordHasher`/`SecretCipher` interfaces,
registered as an *alternative* to the in-process default, selected by
deployment configuration, never hardcoded as the only option.
**WO-146.3 — the fail-closed behavior and alerting** named in "The
failure path" above.

## Acceptance

- A deployment with the crypto service disabled continues to function
  identically using doc 126's own in-process default — proven by the
  registered-implementation pattern requiring no code change elsewhere
  to switch between them.
- A crypto-service outage fails login/decryption closed, with an alert,
  never a silent fallback to a weaker path — proven by a spec.
- The `security` subagent's own review of the deployed service's actual
  isolation (network policy, host hardening, key-storage mechanism) is
  completed before any production deployment enables it.

## Out of scope

Making the crypto service the default for every deployment — explicitly
not recommended; doc 126's own in-process interface remains the default,
and this service is an opt-in topology for deployments with a specific,
named physical-isolation requirement.
