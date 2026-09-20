---
paths:
  - "apps/api/prisma/**"
---

<!-- Moved verbatim from CLAUDE.md so it loads only when it applies.
     BINDING — identical force to CLAUDE.md itself. Nothing here was reworded.
     Scope: The migration discipline has no automated guard; it is a reviewer's job, so it loads whenever the schema is open. -->

## Database change protocol

Before modifying a database: inspect the current schema, identify
relationships, review existing migrations, check constraints and indexes,
determine data ownership, consider backward compatibility and rollback,
update documentation, add or update tests. Never casual — every migration
states a clear reason (this repo's own D1/D2 above go further: forward-only,
tested against a copy of production data, never `migrate dev` against
production).
