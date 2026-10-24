---
paths:
  - ".env*"
  - ".env.example"
  - "**/config/**"
  - "docker-compose*.yml"
  - "docker-stack*.yml"
---

<!-- Moved verbatim from CLAUDE.md so it loads only when it applies.
     BINDING — identical force to CLAUDE.md itself. Nothing here was reworded.
     Scope: Loads when touching configuration, where hardcoding an environment value is the live risk. -->

## Environment and configuration

Never hardcode an environment-specific value — URLs, API keys, database
credentials, feature flags, deployment settings, external service ids,
timezones, locale configuration all resolve through config. Never commit a
secret or a production credential.
