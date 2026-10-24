# Security architecture

Moved verbatim from the root `README.md`, where it was a section. The rules
here are enforced in code (`pnpm check:secrets`, `env.validation.ts`,
`AllExceptionsFilter`, `PermissionsGuard`), not left as slogans. For how a
security review is run, see `.claude/rules/security.md`.

The trust boundary in this codebase is simple to state and, more importantly,
already enforced in three places rather than left as a slogan. It's the
house rule for where a secret is allowed to exist and where a sensitive
decision is allowed to be made:

1. **The browser and the Expo app hold zero secrets.** No database
   credentials, no payment-gateway password or salt, no SMTP password, no S3
   key, no JWT secret — ever, in any form, committed or not. The only
   environment values a frontend build may embed are ones already public by
   definition, and they're marked as such: `NEXT_PUBLIC_API_URL`
   (`apps/web/src/lib/api.ts`), `EXPO_PUBLIC_API_URL`
   (`apps/mobile/src/api/client.ts`). Anything else appearing in a frontend
   `.env` is a bug, full stop. The frontend only ever calls its own backend
   over an authenticated HTTPS API — never a database, never a third party
   directly.
2. **Sensitive operations happen only on the backend, and the backend is the
   only source of truth for them** — authenticating a user, computing a
   final price/total/tax/stock figure, checking a permission
   (`assertCanManage`, `@RequirePermission`), and every database write. A
   client-submitted total, discount or stock count is a suggestion, never an
   input to money math: `orders.service.ts` recomputes every figure
   server-side, inside the same transaction that decrements stock, and
   discards whatever the client sent.
3. **Every call to a third party that needs a secret — JazzCash, Easypaisa,
   SMTP, S3 — happens from the API process only**, using a secret read from
   an environment variable through the validated config layer
   (`apps/api/src/core/config/env.validation.ts`), never hardcoded and never
   committed. The inbound side of that relationship — a payment gateway's
   webhook callback — is verified with a constant-time signature comparison
   (`timingSafeEqual` in `payments/providers/*.ts`), not `===`, so a timing
   side-channel can't be used to guess the secret one byte at a time.

Four supporting practices carry the same principle into the places a
three-line rule doesn't reach on its own:

- **Fail fast.** The API refuses to boot if a required secret is missing, too
  short, or still the checked-in placeholder in production
  (`env.validation.ts`) — a misconfigured secret is a startup error, not a
  silent vulnerability discovered later.
- **Least privilege.** A secret is scoped behind the one interface that needs
  it — `PaymentProvider`, `StorageDriver`, `NotificationChannel` — so
  unrelated code never reaches for `process.env.JAZZCASH_PASSWORD` directly.
- **Errors are generic on the wire.** `AllExceptionsFilter` returns a fixed
  "Something went wrong" message and logs the real stack trace server-side
  only; a client response never carries an exception message, a stack trace,
  or a database error string.
- **The perimeter is locked down by default.** CORS is an explicit allowlist
  (`CORS_ORIGINS`), never `*`; login and registration are rate-limited
  (`@Throttle`) against brute force; every `.env*` file is gitignored, and
  only `.env.example`/`.env.production.example` templates with placeholder
  values are committed.
