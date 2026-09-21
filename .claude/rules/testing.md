---
paths:
  - "**/*.spec.ts"
  - "**/*.e2e-spec.ts"
  - "apps/api/test/**"
---

<!-- Moved verbatim from CLAUDE.md so it loads only when it applies.
     BINDING — identical force to CLAUDE.md itself. Nothing here was reworded.
     Scope: Loads when you are writing or changing a test. -->

## Testing standard

Match the category (unit / integration / API / e2e / permission / security
/ regression / performance) to the risk. Minimum scenarios to consider:
normal case, invalid input, boundary values, unauthorized access, wrong
organization, wrong branch, duplicate request, concurrent request, external
service failure, partial failure, empty state, loading state, error state.
Tests verify business behavior, not implementation details.
