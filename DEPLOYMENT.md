> [!WARNING]
> **This document describes a deployment that is no longer in use.**
>
> Production runs on **Coolify** — projects, environments and resources, with
> Postgres and Redis as managed database resources and Traefik terminating TLS.
> Everything below (Docker Swarm, the self-managed Caddy container, the
> `deploy/` scripts and systemd timers, and the SSH-based deploy workflows)
> describes the previous setup and will mislead you.
>
> `docs/email.md` is current and Coolify-based. The rest of this file needs a
> rewrite; it is kept for now only because the history is still useful.

# Deploying yaseen.pk

Two environments, both on one VPS:

| Environment | Branch       | Domain(s)                          | DB/Redis        |
|-------------|--------------|-------------------------------------|------------------|
| Production  | `production` | yaseen.pk, www.yaseen.pk, api.yaseen.pk | isolated (prod) |
| Staging     | `main`       | test.yaseen.pk, api-test.yaseen.pk | isolated (staging) |

Admin (`/admin/...`) and the storefront are the **same app** (`apps/web`), so
there's no separate admin container or subdomain — it's reachable at
`yaseen.pk/admin` (and `test.yaseen.pk/admin` on staging).

Every push to `main` that passes CI auto-deploys to staging. Promoting to
production is a merge/push from `main` into `production` (see "Day-to-day
deploys" below) — CI runs again on `production`, and only then does
production actually redeploy.

**Note on this repo's Dockerfiles/compose files:** they were written and
validated against a real `pnpm build` / `pnpm prisma generate` output, but
this development environment has no Docker daemon, so the actual
`docker build` has not been run here. Watch the first build closely (step 6)
and report back if anything doesn't match.

---

## 1. Provision the VPS

**Image: Ubuntu 24.04 LTS (x86_64)**, minimum 2 vCPU / 4 GB RAM / 40 GB disk
(everything here — two Postgres instances, two Redis instances, two Next.js
+ two NestJS containers, Caddy — comfortably fits; go to 8 GB RAM if you
expect real traffic on both environments at once). Ubuntu LTS has the
longest support window and the widest first-party Docker package support,
which is why it's the default recommendation over Debian/Alpine-as-host.

You said you already have a VPS — just confirm it matches the above, and
that you have root or sudo SSH access to it.

---

## 2. First login: base setup, a deploy user, and firewall

SSH in as root (or your existing sudo user), then:

```bash
apt update && apt upgrade -y

# A dedicated non-root user for both interactive admin and GitHub Actions'
# automated deploys — never deploy as root.
adduser deploy
usermod -aG sudo deploy

# Firewall: only SSH, HTTP, HTTPS. Caddy needs 80 open (it uses it for the
# ACME HTTP-01 challenge even though it redirects everything to 443).
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Optional but recommended: disable SSH password auth (`PasswordAuthentication
no` in `/etc/ssh/sshd_config`, then `systemctl restart sshd`) once you've
confirmed key-based login works for `deploy`, and install `fail2ban`
(`apt install -y fail2ban`) to blunt brute-force SSH attempts.

From here on, do everything as `deploy` (`su - deploy`).

---

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy
```

Log out and back in (or `newgrp docker`) so group membership takes effect,
then confirm:

```bash
docker --version
docker compose version
```

---

## 4. DNS

Point every one of these at the VPS's public IP (A record; add AAAA too if
the VPS has IPv6). Caddy (step 6) issues Let's Encrypt certs for each
automatically once DNS resolves — no manual cert work.

| Host                | Points to        |
|---------------------|-------------------|
| `yaseen.pk`          | VPS IP |
| `www.yaseen.pk`      | VPS IP |
| `api.yaseen.pk`      | VPS IP |
| `test.yaseen.pk`     | VPS IP |
| `api-test.yaseen.pk` | VPS IP |

---

## 5. Clone the repo and create the `production` branch

```bash
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/nadeemmurtaza/yaseenecom.git
cd yaseenecom
```

`production` doesn't exist yet — create it once from `main` (the deploy
workflows and CI already expect it):

```bash
git checkout -b production origin/main
git push -u origin production
```

Protect it on GitHub (Settings → Branches → add a rule for `production`):
require the CI check to pass, and optionally require a PR before merging —
this is what makes "promote to prod" a deliberate act instead of every
`main` push going live.

---

## 6. First-time bootstrap on the VPS

Still in `~/apps/yaseenecom`, on the `main` checkout (order matters: the
edge network must exist before the app stacks, which reference it as
external):

```bash
# 1. Shared reverse proxy — once, ever (survives redeploys of prod/staging)
docker compose -f docker-compose.caddy.yml up -d

# 2. Env files — copy the templates and fill in every CHANGE-ME
cp .env.production.example .env.production
nano .env.production   # fill in EVERY value marked CHANGE-ME (see the table below)

# 3. Switch to the production branch and bring up production
git checkout production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
git checkout main   # leave the working tree on main for day-to-day pulls
```

There is no staging stack on this VPS any more — preview deployments are
handled by Coolify (`chore: remove staging stack`). `docker-compose.staging.yml`
and `.env.staging.example` were removed with it; earlier revisions of this
guide told you to copy them, which now fails.

### Secrets you must generate, and what breaks if you get them wrong

| Variable | Generate with | If it is missing / changed |
|---|---|---|
| `APP_ENCRYPTION_KEY` | `openssl rand -hex 16` (**exactly 32 bytes**) | **The API refuses to boot.** It encrypts stored email-account passwords and signs unsubscribe links, so it must also stay the SAME forever — rotating it makes every already-encrypted value unreadable. |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` | API refuses to boot. Changing it signs everyone out. |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` | Same, and must differ from the access secret. |

The API validates these at startup and exits with the exact command to run,
so a container that will not come up is worth reading the logs for before
anything else.

Each `up --build` runs `prisma migrate deploy` automatically as part of the
api container's startup (`apps/api/Dockerfile`'s `CMD`) — migrations apply
themselves on every start, including the very first one.

**Then seed each environment — this is required, not optional.** Migrations
create the tables but leave them empty, and an empty `Permission` /
`RolePermission` pair means every admin route 403s and the admin nav renders
blank, even for a user whose role is ADMIN. The seed creates the permission
catalog, the role→permission mapping, the `admin@yaseen.pk` login, and the
garment/measurement reference data the storefront reads. It is idempotent
(every write is an upsert), so re-running it is safe:

```bash
docker compose -f docker-compose.staging.yml exec api pnpm db:seed
docker compose -f docker-compose.prod.yml exec api pnpm db:seed
```

Override the default admin credentials with `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` in the env file before seeding, or change the password
from `/admin/settings` afterwards.

Check everything's up. Each stack is its own Compose project (`name:` at the
top of each file), so query them one at a time — a single `-f a -f b` command
merges the files into one project and reports the wrong thing:

```bash
docker compose -f docker-compose.caddy.yml ps
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.prod.yml logs -f api    # Ctrl-C to stop following
```

Visit `https://yaseen.pk` and `https://test.yaseen.pk` — Caddy's first
request to each triggers certificate issuance, so the very first load may
take a few extra seconds.

---

## 7. GitHub Actions: secrets for automatic deploys

The two workflows (`.github/workflows/deploy-staging.yml`,
`deploy-production.yml`) SSH into the VPS and re-run the same `up --build`
command you just did by hand. Each only fires after CI has passed on the
relevant branch (`main` → staging, `production` → prod) — see the
`workflow_run` trigger in each file.

Create **two GitHub Environments** (repo Settings → Environments):
`staging` and `production`. Add these secrets to **each** (values can be
the same for both if it's one VPS/one deploy user, which is the setup this
guide walks through — separate Environments still let you tighten
production later, e.g. requiring manual approval before it deploys):

| Secret            | Value                                              |
|--------------------|-----------------------------------------------------|
| `VPS_HOST`         | the VPS's IP or hostname                            |
| `VPS_USER`         | `deploy`                                            |
| `VPS_SSH_KEY`      | a **private** key whose public half is authorized for `deploy` (generate a dedicated one — don't reuse your personal key) |
| `VPS_PORT`         | `22` (only needed if you changed the SSH port)      |
| `VPS_DEPLOY_PATH`  | `/home/deploy/apps/yaseenecom`                      |

Generate the dedicated deploy key **on your own machine** (not the VPS), then
authorize it on the VPS:

```bash
ssh-keygen -t ed25519 -f yaseen_deploy_key -N ""
# copy yaseen_deploy_key.pub's contents onto the VPS:
ssh deploy@<vps-ip> 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys' < yaseen_deploy_key.pub
```

Paste the **private** key's full contents (including the `-----BEGIN...`/
`-----END...` lines) into `VPS_SSH_KEY` on GitHub. Never commit either key
file — delete `yaseen_deploy_key`/`.pub` from your machine once they're in
GitHub Secrets and `authorized_keys`.

Enabling production approval (optional, recommended once you're live): in
the `production` Environment's settings, add yourself as a **required
reviewer** — every `deploy-production` run then waits for a manual approval
click in the Actions tab, on top of already requiring CI to pass.

---

## 8. Day-to-day deploys

### Before a deploy that adds an env var — check this first

A release can introduce a variable the API validates at startup. If it is not
on the server before you merge, the api container starts, fails validation and
exits, and the deploy looks like it "hung" or rolled back for no reason.

Before promoting, diff the templates against what the server actually has:

```bash
# on the VPS, in ~/apps/yaseenecom
git fetch origin
diff <(grep -oE '^[A-Z_]+' .env.production | sort -u)      <(git show origin/main:.env.production.example | grep -oE '^[A-Z_]+' | sort -u)
```

Anything listed as only in the template is a variable you need to add to
`.env.production` **before** the merge. Then restart to pick it up.

**Known for the release currently in flight:** `APP_ENCRYPTION_KEY` is new and
required (`openssl rand -hex 16`, exactly 32 bytes), and `MODULES` gains
`marketing` and `tax`.


- **Push/merge to `main`** → CI runs → on success, `deploy-staging.yml`
  SSHes in and redeploys `test.yaseen.pk`/`api-test.yaseen.pk` automatically.
  This is the "connected to main branch for testing" environment.
- **Promote to production**: once `main` looks good on staging,
  `git checkout production && git merge main && git push` (or open a PR
  from `main` into `production` if you turned on required-PR above) → CI
  runs on `production` → on success, `deploy-production.yml` redeploys
  `yaseen.pk`/`api.yaseen.pk`.

Both deploy workflows do `git fetch && git reset --hard origin/<branch>`
on the VPS, then `docker compose up -d --build`, then `docker image prune
-f` to clear old image layers. Compose only rebuilds images whose inputs
changed, so an unrelated change (e.g. only the API changed) doesn't force a
web rebuild.

---

## 9. Backups, restore tests and off-site copies

The named volumes `postgres-prod-data` and `api-prod-uploads` (payment
receipts, product images, stitching job photos — everything `STORAGE_DRIVER=
local` writes to disk) are the only state that is not reproducible from git.

`deploy/backup.sh` runs nightly and does five things, in this order:

1. **Find the running postgres container.** Docker Swarm names task
   containers `<stack>_<service>.<slot>.<id>`, not a fixed name, so this is
   auto-detected from `STACK_NAME` (default `yaseen-prod`, matching the
   `docker stack deploy ... yaseen-prod` in the CD workflow) rather than
   hardcoded. Set `CONTAINER=<name>` to skip detection.
2. **Dump and compress**, then check the archive is a valid gzip and is not
   suspiciously small.
3. **Restore it into a throwaway database and assert row counts** on
   `Product`, `Permission` and `User`. This is the step that separates a
   backup from a file. A schema-only or half-written dump restores *without
   any error* and is completely useless — only the row assertions catch that.
   The scratch database is dropped afterwards, on success or failure.
4. **Archive the uploads volume** (`${STACK_NAME}_api-prod-uploads`) to a
   `.tar.gz` alongside the database dump. Skipped (not failed) if the volume
   does not exist — e.g. `STORAGE_DRIVER=s3`, where uploads never touch local
   disk in the first place.
5. **Ship both archives off-site** to `S3_TARGET`, then confirm each object is
   actually listed before its local copy is eligible for pruning. With
   `S3_TARGET` unset the script still works but warns, loudly, that the only
   copy of your data is on a VPS you might lose.
6. **Prune local copies** older than `RETAIN_DAYS` (default 14). Off-site
   retention belongs in an S3 lifecycle rule instead, where a compromised VPS
   cannot reach back and delete history.

Any failure aborts with a non-zero exit, so `systemctl status
yaseen-backup.service` shows a red failed unit rather than quietly leaving you
with nothing.

Install it:

```bash
cd ~/apps/yaseenecom
mkdir -p ~/backups

# Off-site: create a bucket and an IAM user restricted to PutObject/ListBucket
# on it, then:
sudo apt install -y awscli
aws configure                       # the restricted key, not a root key

sudo cp deploy/systemd/yaseen-backup.{service,timer} /etc/systemd/system/
sudo systemctl edit yaseen-backup.service   # uncomment/set S3_TARGET
sudo systemctl daemon-reload
sudo systemctl enable --now yaseen-backup.timer

# Prove it works now rather than discovering it at 03:00 during an incident:
sudo systemctl start yaseen-backup.service
journalctl -u yaseen-backup.service -n 40 --no-pager
```

You should see `restore test PASSED` with the row counts. **Restoring for
real** is the same dump loaded into the live database — find the running
container name first (Swarm's task-container names carry a random suffix):

```bash
CONTAINER=$(docker ps --filter name=yaseen-prod_postgres --format '{{.Names}}')
gunzip -c ~/backups/prod-<stamp>.sql.gz \
  | docker exec -i "$CONTAINER" psql -U yaseen -d yaseen
```

**Restoring the uploads volume** (payment receipts, product/job images) is
the same idea, into the named volume the `api` service mounts:

```bash
docker run --rm -v yaseen-prod_api-prod-uploads:/data -v ~/backups:/backup \
  alpine:3 sh -c "rm -rf /data/* && tar xzf /backup/uploads-<stamp>.tar.gz -C /data"
```

---

## 10. Disk threshold alerts

A full disk does not slow this shop down, it stops it: Postgres refuses
writes and checkout fails. Docker is the usual cause — every deploy leaves
image layers behind.

`deploy/disk-alert.sh` runs every 30 minutes. It warns at 75%, and at 90%
reclaims dangling image and build-cache layers before alerting. It never
touches named volumes, so it cannot delete your database.

```bash
sudo cp deploy/systemd/yaseen-disk-alert.{service,timer} /etc/systemd/system/
sudo systemctl edit yaseen-disk-alert.service   # set ALERT_EMAIL or ALERT_WEBHOOK
sudo systemctl daemon-reload
sudo systemctl enable --now yaseen-disk-alert.timer
```

Without `ALERT_EMAIL` or `ALERT_WEBHOOK` the alert only reaches syslog, which
nobody reads at 3am — set one of them.

---

## 11. Automatic restart at boot

`restart: unless-stopped` in the compose files already restarts a container
that crashes. It does not bring the stack back after a reboot, or if the
docker daemon itself is replaced. That is what `yaseen.service` is for — the
two layers are complementary: compose watches containers, systemd watches the
stack.

```bash
sudo cp deploy/systemd/yaseen.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now yaseen.service

sudo reboot          # then confirm the site comes back on its own
```

---

## 12. Resource limits and connection pooling

Set in the compose files, so both stacks inherit them:

| Service    | Production | Staging |
|------------|-----------|---------|
| `api`      | 768M      | 512M    |
| `web`      | 640M      | 448M    |
| `postgres` | 1G        | 640M    |

`memswap_limit` equals `mem_limit` on every service, so a container that
exceeds its limit is killed rather than quietly swapping and dragging the
whole box down with it. On your 12 GB VPS both stacks together are capped
well under the total, leaving headroom for the host and for builds.

Every service also carries `no-new-privileges:true`, and `api`/`web` run as
non-root users defined in their Dockerfiles.

**Connection pooling** is set on the `DATABASE_URL` the compose files build:
`connection_limit=10`, `pool_timeout=20`, `connect_timeout=10`. Prisma's
default pool is sized from the CPU count, which on a 6-core box is larger than
Postgres's default 100 connections can comfortably serve once both
environments and a migration are running at once. Ten per stack is
deliberate headroom.

**Keep-alive** is set in `apps/api/src/main.ts`: the API holds idle
connections open *longer* than Caddy does (65s vs Caddy's 60s default). This
ordering matters — if the API evicted a connection Caddy still believed was
good, Caddy would send a request into a closing socket and the customer would
get an intermittent 502.

---

## 13. Troubleshooting

```bash
# Container status across all three stacks
docker compose -f docker-compose.caddy.yml -f docker-compose.prod.yml -f docker-compose.staging.yml ps

# Logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.caddy.yml logs -f caddy

# Caddy not issuing a cert? Usually DNS hasn't propagated yet, or port 80
# is blocked — recheck `dig yaseen.pk` and `ufw status`.

# Re-run migrations/seed manually
docker compose -f docker-compose.prod.yml exec api pnpm --filter @yaseen/api db:deploy
docker compose -f docker-compose.prod.yml exec api pnpm db:seed
```
