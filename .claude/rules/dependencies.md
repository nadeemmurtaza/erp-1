---
paths:
  - "**/package.json"
  - "pnpm-workspace.yaml"
---

<!-- Moved verbatim from CLAUDE.md so it loads only when it applies.
     BINDING — identical force to CLAUDE.md itself. Nothing here was reworded.
     Scope: Loads exactly when a dependency could be added. -->

## Dependency standard

Before installing one:

```
Dependency: / Purpose: / Existing Alternative: /
Why Existing Alternative Is Insufficient: / Security Considerations: /
Maintenance Considerations: / Bundle / Runtime Impact: / Approval Required:
```

Prefer fewer dependencies — each one is a long-term maintenance obligation,
not a temporary convenience.
