# Deployment Strategy

## Overview

Yaseen uses a **deployment/cloudflare** branch as the single source of truth for production deployments on Cloudflare. This branch maintains strict quality gates to ensure only verified, tested code reaches production.

## Deployment Branches

| Branch | Purpose | Policy |
|--------|---------|--------|
| `main` | Integration branch for accepted features | No restrictions; merge from feature branches via PR |
| `deployment/cloudflare` | Production deployment target | Verified upgrades only; only receives merges from `main` after full CI passes |

## Verified Upgrades Policy

The `deployment/cloudflare` branch only accepts changes under these conditions:

1. **Source**: Changes flow only from `main` → `deployment/cloudflare`
2. **Testing**: All CI checks (lint, typecheck, build, tests) must pass on `main` before merging
3. **Merge Strategy**: Only fast-forward or squash merges are allowed (no merge commits)
4. **Review**: At least one approval required before merge
5. **Status Checks**: Cannot merge if any CI suite is red on the target branch
6. **Deployment**: Cloudflare Pages automatically deploys on push to `deployment/cloudflare`

## Manual Merge Process

To promote a tested version from `main` to production:

```bash
# 1. Verify main is fully tested
git fetch origin main
git log origin/main --oneline -n 5

# 2. Switch to deployment branch
git checkout deployment/cloudflare
git pull origin deployment/cloudflare

# 3. Merge main into deployment (fast-forward only)
git merge --ff-only origin/main

# 4. Push to trigger Cloudflare deployment
git push origin deployment/cloudflare

# 5. Verify deployment at https://yaseenecom.pages.dev
```

## Rollback Procedure

If production deployment fails:

1. Identify the last stable commit on `deployment/cloudflare`
2. Reset branch to that commit: `git reset --hard <commit>`
3. Force-push with justification in commit message: `git push -f origin deployment/cloudflare`
4. Notify team and file incident report

## Cloudflare Pages Configuration

### Build Settings
- **Framework**: Next.js (for web app)
- **Build command**: `pnpm build --filter @yaseen/web`
- **Build output directory**: `apps/web/out` (for static export)
- **Environment**:
  - `NEXT_PUBLIC_API_URL`: Production API endpoint (e.g., `https://api.yaseenecom.com`)
  - `DATABASE_URL`: Production database (via Cloudflare KV or secret)

### Deployment Triggers
- **Automatic**: Every push to `deployment/cloudflare`
- **Manual**: Via Cloudflare Pages dashboard if needed

### DNS & SSL
- SSL/TLS: Automatically provisioned by Cloudflare
- Custom domain: Configure in Cloudflare dashboard
- Redirect HTTP → HTTPS: Enabled by default

## Monitoring Deployments

```bash
# Check recent deployments
git log deployment/cloudflare --oneline -n 10

# Compare main vs deployment
git diff main..deployment/cloudflare

# View Cloudflare deployment status
# Visit: https://dash.cloudflare.com → Pages → yaseenecom
```

## Emergency Access

Only use this for genuine production emergencies:

```bash
# Direct push to deployment (bypasses normal review)
# ONLY for critical hotfixes with incident tickets
git push origin <feature-branch>:deployment/cloudflare
```

**Note**: This requires admin access to the repository and should be documented in incident reports.

## Related Documentation

- [README.md](./README.md) - Application overview and setup
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Development workflow
- GitHub Actions CI logs - Verify all checks pass before deployment
