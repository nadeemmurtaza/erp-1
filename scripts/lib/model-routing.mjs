/**
 * Which model and how much effort each kind of job in this repository deserves.
 *
 * This file is the ONLY place the policy is written down. Everything that acts
 * on it — the subagent definitions under `.claude/agents/`, the routing page in
 * the index, the paragraph inside every agent-instruction file, the advisory
 * hook — is generated from this array by `scripts/build-index.mjs`. A policy
 * copied into five places is a policy that disagrees with itself within a
 * month, and the copy somebody's agent happens to read is the one that decides
 * what runs.
 *
 * WHAT ACTUALLY SWITCHES, AND WHAT DOES NOT. A subagent definition carries both
 * `model` and `effort`, and Claude Code delegates to it automatically by
 * matching its `description` — so for work that can be handed to a subagent,
 * selection is genuinely automatic with nobody choosing. The MAIN session is
 * different: its model is `/model` and its effort is `/effort`, and hooks
 * cannot set either. That is a documented limit, not an oversight here, which
 * is why the hook this policy generates advises rather than switches.
 *
 * THE DEFAULT DIRECTION IS DOWN. Every row below has to justify going above
 * `sonnet` / `medium`, never the other way round. Routing everything to
 * `opus` / `max` would be slower and dramatically more expensive for no gain
 * on work that does not need it — the point of a routing policy is to spend
 * the expensive models where being wrong is costly, which in this repository
 * means permissions, money, migrations and the module boundaries, and to spend
 * nothing extra on looking a file up.
 *
 * EFFORT LEVELS: low · medium · high · xhigh · max (which ones a given model
 * offers depends on the model — haiku is kept at low/medium here on purpose).
 */

/** @typedef {'haiku'|'sonnet'|'opus'|'fable'|'inherit'} ModelAlias */
/** @typedef {'low'|'medium'|'high'|'xhigh'|'max'} EffortLevel */

export const ROUTING_POLICY = [
  {
    agent: 'locate',
    model: 'haiku',
    effort: 'low',
    proactive: true,
    job: 'Find where something lives',
    when: 'any "where is X", "which file", "does this already exist" question',
    why:
      'The index already did the thinking. This is retrieval, not reasoning, and ' +
      'it is the single most common thing an agent does here — paying Opus rates ' +
      'to read a lookup table is the clearest waste in the whole workflow.',
    tools: 'Read, Grep, Glob, Bash',
    body: [
      'Answer strictly from `docs/index/` wherever it can answer.',
      '',
      'Open `docs/index/README.md` first and follow its routing table to the one',
      'page that covers the question. Only fall back to grepping the repository',
      'when the index genuinely does not cover what was asked — and when that',
      'happens, say so, because it means the generator is missing something.',
      '',
      'Report file paths with line numbers (`path/to/file.ts:123`) so the caller',
      'can open them directly. Never speculate about what code does: the index is',
      'a map, so if the answer needs the code read, name the file and say so.',
    ],
  },
  {
    agent: 'verify',
    model: 'haiku',
    effort: 'low',
    proactive: true,
    job: 'Run the checks and report what failed',
    when: 'running lint, typecheck, tests, the build, or the index freshness check',
    why:
      'Running a command and reading its output is mechanical. The judgement is ' +
      'in what to do about a failure, which belongs to whoever asked.',
    tools: 'Bash, Read, Grep, Glob',
    body: [
      'Run the checks asked for and report results faithfully. Nothing else.',
      '',
      '```bash',
      'pnpm lint && pnpm typecheck && pnpm test   # the pre-PR gate',
      'pnpm build                                  # where applicable',
      'pnpm index:check                            # index freshness',
      '```',
      '',
      'Report the real numbers and quote the actual failure output. Do not fix',
      'anything, and do not describe a failure as flaky, pre-existing or',
      'unrelated unless you have checked it against a clean tree and can say how',
      'you checked.',
      '',
      'Two failures are known and pre-existing — say so when they appear, and',
      'never present them as caused by the change under test:',
      '  · `check:env` — MODULES drift in the `.env*.example` templates',
      '  · 9 API suites — the Prisma schema has drifted ahead of the committed',
      '    migrations (see `docs/index/cross/migrations.md`)',
    ],
  },
  {
    agent: 'implement',
    model: 'sonnet',
    effort: 'medium',
    job: 'A contained change inside one module',
    when: 'a bug fix, a small endpoint, a component, a test, a copy change',
    why:
      'The ordinary case. The house rules already constrain the shape of the ' +
      'change, so the work is applying them carefully rather than deciding ' +
      'anything architectural.',
    tools: null,
    body: [
      'Smallest complete change that satisfies the requirement. Do not rewrite',
      'unrelated modules, rename unrelated files, or reformat unrelated code.',
      '',
      'Before writing anything new, check it does not already exist — the',
      '"Use what exists" section of `CLAUDE.md` lists the primitives and classes',
      'you must reuse, and `docs/index/cross/components.md` says what is already',
      'there. A duplicate implementation is a defect.',
      '',
      'If the change turns out to cross a module boundary, need a migration, or',
      'touch a permission, stop and hand it to the agent that owns that: those',
      'are `feature`, `schema` and `security` respectively.',
    ],
  },
  {
    agent: 'feature',
    model: 'sonnet',
    effort: 'high',
    job: 'A whole capability, end to end',
    when: 'a named feature spanning modules, or anything needing a plan first',
    why:
      "CLAUDE.md's five lenses make this genuinely harder than it looks: a named " +
      'feature includes the operator-facing twin, the after-completion lifecycle, ' +
      'the integrations and the policy layer. Getting that scope wrong ships half ' +
      'a feature that looks finished.',
    tools: null,
    body: [
      'Run the five lenses from `CLAUDE.md` ("Feature scope: build the whole',
      'capability") BEFORE implementing, and write the resulting map down:',
      '',
      '1. The transaction, start to finish.',
      '2. The other side of it — the operator-facing twin.',
      '3. What happens after "done" — returns, cancellations, disputes, refunds.',
      '4. The integrations a real business needs, not a demo.',
      '5. The policy/rules layer that governs it.',
      '',
      'A feature ships whole: backend, the minimum UI to perform it, a',
      '`nav-registry` entry so it is reachable by clicking, and every permission',
      'seeded through to a real grant a live user holds. Backend-only is not done.',
      '',
      'Anything the map surfaces that is a separable, larger capability is never',
      'silently stubbed and never silently skipped — name it and sequence it as',
      'its own work order.',
    ],
  },
  {
    agent: 'debug',
    model: 'sonnet',
    effort: 'high',
    job: 'Root-cause a failure',
    when: 'a failing test, a red CI run, a bug reproduced but not explained',
    why:
      'Debugging is search over hypotheses, which is exactly what extra effort ' +
      'buys. The failure mode this guards against is the "make the error go ' +
      'away" fix the house rules forbid.',
    tools: null,
    body: [
      'Understand why the failure appeared before changing anything. A fix that',
      'makes the error go away without an explanation is not a fix — `CLAUDE.md`',
      'names that as vibe coding and it is not allowed here.',
      '',
      'Reproduce it first, state the root cause in one sentence, then fix that',
      'cause. Never skip, disable or quarantine a test to get green.',
      '',
      'Check whether the failure is pre-existing before attributing it to the',
      'change under test: `docs/index/cross/migrations.md` lists a known schema/',
      'migration drift that accounts for 9 failing API suites on a fresh database.',
    ],
  },
  {
    agent: 'schema',
    model: 'opus',
    effort: 'high',
    job: 'Database schema and migrations',
    when: 'a Prisma model or column change, or writing a migration',
    why:
      'Migrations here are hand-written and forward-only against real data. A ' +
      'wrong one is not a revert — it is a restore. This repository already ' +
      'carries five models and six columns that were declared but never ' +
      'migrated, which is what that mistake looks like.',
    tools: null,
    body: [
      'Before touching the database: inspect the current schema, identify',
      'relationships, review existing migrations, check constraints and indexes,',
      'determine data ownership, and consider backward compatibility and',
      'rollback. Start from `docs/index/cross/data-model.md`, which lists every',
      'model field by field, and `cross/migrations.md`, which lists the history.',
      '',
      'Migrations are HAND-WRITTEN and FORWARD-ONLY. Never `prisma migrate diff`',
      'or `migrate dev` against a real database. Every migration states its',
      'reason.',
      '',
      'Rules that hold for every table here:',
      '  · Money is integer paisa. Never a float.',
      '  · Customer-facing text is never a column — it lives in `*Translation`',
      '    rows, one per locale.',
      '  · Every movement of value names its location.',
      '',
      'Check your work against `cross/migrations.md`: it reports which models,',
      'columns and enums the schema declares that no migration builds.',
    ],
  },
  {
    agent: 'architect',
    model: 'opus',
    effort: 'xhigh',
    job: 'Architecture and irreversible decisions',
    when:
      'module boundaries, the sector/brand/branch axes, a new module or pack, ' +
      'an extension point, anything going in DECISIONS.md',
    why:
      'These decisions are load-bearing for every deployment and expensive to ' +
      'reverse — the whole module-pack design exists so that a new sector is a ' +
      'new folder rather than a rewrite. Getting one wrong forecloses that.',
    tools: null,
    body: [
      'Read `docs/implementation/ENTERPRISE-SCALE.md`, `MULTI-SECTOR.md` and',
      '`RETAIL-ERP.md` (the document of record where the last two overlap) before',
      'proposing anything.',
      '',
      'Hold the line on the rules that make this codebase extensible:',
      '  · Every module is independent of every other module. No direct import,',
      '    except a named `KNOWN_MODULE_COUPLINGS` entry for a same-transaction',
      '    write. Everything else is a domain event or an extension point.',
      '  · Core may never import a pack; a pack may never import another pack.',
      '  · Extension points, not conditionals. There is no `if (sector === …)`.',
      '  · Adding a sector adds a folder. It never edits a core module.',
      '  · One writer per invariant.',
      '',
      'Flexibility, resilience and innovation outrank local tidiness. When they',
      'trade off against a shortcut that ships faster today, they win, and the',
      'plan says so explicitly.',
      '',
      'Record the decision in `docs/implementation/DECISIONS.md` with its context,',
      'options, reasoning and consequences. Do not reopen a settled decision',
      'without new evidence.',
    ],
  },
  {
    agent: 'security',
    model: 'opus',
    effort: 'max',
    job: 'Access control, isolation and money',
    when:
      'permissions, authentication, tenant or branch isolation, payment and ' +
      'refund paths, anything handling secrets',
    why:
      'This is the one category where being wrong is a breach rather than a bug, ' +
      'and where the cost of the most capable model is trivially justified. ' +
      'A missing @RequirePermission does not fail a test; it just quietly works ' +
      'for the wrong person.',
    tools: null,
    body: [
      'Security is enforced SERVER-SIDE. A client-side restriction is not',
      'authorization, and a UI permission check is a convenience on top of a',
      'server check that must already exist.',
      '',
      '`JwtAuthGuard` and `PermissionGuard` are global, so a route with NO',
      '`@RequirePermission` is authenticated-but-unrestricted — which `CLAUDE.md`',
      'calls "almost never intended". `docs/index/cross/routes.md` lists every',
      'route with the rule that actually guards it, and flags undecorated ones.',
      '',
      'A permission is not shipped until it reaches a real grant a live user',
      'holds. `docs/index/cross/permissions.md` maps each key to the routes that',
      'enforce it, the UI that checks it, and the roles seeded with it — a key',
      'granted to no role is scaffolding, not access control.',
      '',
      'Review: permission enforcement, tenant and branch isolation, input',
      'validation, output encoding, SQL injection, XSS, CSRF, file uploads,',
      'secrets, rate limiting, error exposure and logging privacy. Never log a',
      'password, token or secret. When two fixes are possible, take the safer one.',
    ],
  },
];

/** The advisory hook only speaks up for jobs where the wrong choice is costly. */
export const ADVISORY_SIGNALS = [
  { agent: 'security', pattern: 'permission|auth|token|secret|isolation|payment|refund|credential|vulnerab|injection|csrf|xss' },
  { agent: 'schema', pattern: 'migration|prisma|schema|column|database table|db schema' },
  { agent: 'architect', pattern: 'architect|module boundar|module pack|extension point|decisions\\.md|new module|new sector|coupling' },
];

export const MODEL_ORDER = ['haiku', 'sonnet', 'opus'];
export const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];
