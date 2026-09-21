---
paths:
  - "apps/api/src/**/*.service.ts"
  - "apps/api/src/**/*.controller.ts"
  - "apps/api/src/**/*.listener.ts"
  - "apps/api/src/**/*.subscriber.ts"
  - "apps/api/src/**/*.cron.ts"
---

<!-- Moved verbatim from CLAUDE.md so it loads only when it applies.
     BINDING — identical force to CLAUDE.md itself. Nothing here was reworded.
     Scope: Failure paths and logging are properties of a service, so they load with one. -->

## Error handling

Every external operation (database, API, network) needs a failure path
covering: validation failure, auth failure, timeout, partial failure,
duplicate request, concurrent request. Errors are understandable to users
where appropriate, useful to operators, safe to expose, and logged without
leaking sensitive information. Never silently swallow an error; never
expose a stack trace or a secret to a user.

## Observability

Where applicable: structured logging, error tracking, health checks,
request tracing, performance metrics, database monitoring, queue
monitoring, external-integration monitoring. A log should answer: what
happened, when, which operation, which organization/context, what was the
result, what failed. Never log passwords, tokens, secrets, or unnecessary
personal data.
