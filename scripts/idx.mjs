#!/usr/bin/env node
/**
 * Query the repository index from the command line.
 *
 * WHY THIS EXISTS. `docs/index/` answered "where do I look" but left a second
 * problem behind: the pages are big. Answering "what guards
 * POST /admin/inventory/:id/adjust" meant opening cross/routes.md — 45 KB,
 * about 12,500 tokens — to read one line worth about 30. The index already
 * holds the answer; there was simply no way to ask it for only the answer.
 *
 * This is that way. Same data, read from docs/index/index.json, printed as the
 * handful of lines that answer the question. index.json itself is ~236,000
 * tokens and can never be opened in a context window — through this command it
 * stops being a file anybody reads and becomes the database behind a cheap
 * lookup.
 *
 *   pnpm idx route POST /admin/inventory     what guards an endpoint
 *   pnpm idx perm inventory.manage           a permission, end to end
 *   pnpm idx model Order                     a table's fields
 *   pnpm idx event order.placed              who publishes, who subscribes
 *   pnpm idx sym OrdersService               where a symbol is defined
 *   pnpm idx file orders.service             a file's role and exports
 *   pnpm idx screen /admin/orders            which file serves a URL
 *   pnpm idx module inventory                one module at a glance
 *   pnpm idx show <file> [symbol]            print a symbol, not the whole file
 *   pnpm idx where "abandoned cart"          fuzzy, across everything
 *
 * Zero dependencies, like the generator — it has to work in a checkout with no
 * node_modules.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const INDEX = join(ROOT, 'docs', 'index', 'index.json');

/** Results are capped: an unbounded match list re-creates the problem this solves. */
const LIMIT = Number(process.env.IDX_LIMIT ?? 12);

if (!existsSync(INDEX)) {
  console.error('No index found. Run `pnpm index` first.');
  process.exit(1);
}
const db = JSON.parse(readFileSync(INDEX, 'utf8'));

const norm = (s) => String(s ?? '').toLowerCase();
const hit = (haystack, needle) => norm(haystack).includes(norm(needle));
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/** Prints at most LIMIT rows and says honestly how many were left out. */
function emit(rows, label) {
  if (rows.length === 0) {
    console.log(`no ${label} matched`);
    return;
  }
  for (const r of rows.slice(0, LIMIT)) console.log(r);
  if (rows.length > LIMIT) {
    console.log(dim(`… ${rows.length - LIMIT} more (IDX_LIMIT=${rows.length} to see all)`));
  }
}

/**
 * Finds a class method or nested function by name and returns its line span.
 *
 * Brace-counting, not parsing — it is quote- and comment-aware enough not to
 * be fooled by a `{` inside a string, and where it is unsure it over-runs
 * rather than truncating, because a few extra lines cost far less than a
 * silently cut-off function body.
 */
function findMember(lines, name) {
  const decl = new RegExp(`^\\s{2,}(?:(?:public|private|protected|static|readonly|async|get|set)\\s+)*\\*?\\s*${name}\\s*(?:<[^>]*>)?\\s*\\(`);
  for (let i = 0; i < lines.length; i += 1) {
    if (!decl.test(lines[i])) continue;

    // Walk to the opening brace of the body, then match it.
    let depth = 0, started = false, quote = '', lineComment = false, blockComment = false;
    for (let j = i; j < lines.length; j += 1) {
      const line = lines[j];
      lineComment = false;
      for (let k = 0; k < line.length; k += 1) {
        const c = line[k], next = line[k + 1];
        if (lineComment) break;
        if (blockComment) { if (c === '*' && next === '/') { blockComment = false; k += 1; } continue; }
        if (quote) {
          if (c === '\\') { k += 1; continue; }
          if (c === quote) quote = '';
          continue;
        }
        if (c === '/' && next === '/') { lineComment = true; break; }
        if (c === '/' && next === '*') { blockComment = true; k += 1; continue; }
        if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
        if (c === '{') { depth += 1; started = true; continue; }
        if (c === '}') {
          depth -= 1;
          if (started && depth === 0) return { start: i + 1, end: j + 1 };
        }
      }
      // A declaration with no body within ~200 lines is a false match.
      if (j - i > 200) break;
    }
  }
  return null;
}

/**
 * Picks the file a partial path means.
 *
 * A plain "first substring match" resolves `inventory.service` to
 * `inventory.service.spec.ts`, because the spec's path contains the query too.
 * Ranking by how exactly the BASENAME matches, and pushing test files down,
 * makes the obvious query resolve to the obvious file — a partial path is
 * shorthand for the implementation, not its spec, unless the query says spec.
 */
function resolveFile(query) {
  const wantsSpec = /spec|test/.test(norm(query));
  const base = (p) => p.split('/').pop();
  const scored = db.files
    .filter((f) => hit(f.path, query))
    .map((f) => {
      const b = norm(base(f.path));
      const q = norm(query);
      let score = 0;
      if (f.path === query) score = 100;
      else if (b === q) score = 90;
      else if (b.replace(/\.(ts|tsx|mjs|js)$/, '') === q) score = 80;
      else if (b.startsWith(q)) score = 60;
      else score = 20;
      if (!wantsSpec && /\.(spec|e2e-spec)\./.test(b)) score -= 50;
      return { f, score };
    })
    .sort((a, b2) => b2.score - a.score || a.f.path.length - b2.f.path.length);
  return scored[0]?.f;
}

/* ── commands ──────────────────────────────────────────────────────────── */

const commands = {
  route(args) {
    const terms = args.filter(Boolean);
    const rows = db.routes.filter((r) => terms.every((t) => hit(`${r.method} ${r.path}`, t)));
    emit(
      rows.map((r) => {
        const access = r.permissions.length
          ? r.permissions.join(' | ')
          : r.public ? 'PUBLIC' : r.authOnly ? 'signed-in' : '** UNDECORATED **';
        return `${r.method.padEnd(6)} ${r.path}\n       ${dim(access)}  ${dim(`${r.file}:${r.line}`)}`;
      }),
      'routes',
    );
  },

  perm(args) {
    const rows = db.permissions.filter((p) => args.every((t) => hit(`${p.key} ${p.label}`, t)));
    emit(
      rows.map((p) => {
        const roles = (p.roles ?? []).join(', ');
        return [
          `${bold(p.key)}  ${dim(`[${p.sensitivity}]`)}`,
          `  ${p.label}`,
          `  enforces ${p.routes.length} route(s)${p.routes.length ? `: ${p.routes.slice(0, 4).join(', ')}${p.routes.length > 4 ? ' …' : ''}` : ' ** nothing **'}`,
          `  ui call sites: ${p.uiSites}   seeded to a role: ${p.inSeed ? 'yes' : '** no **'}${roles ? ` (${roles})` : ''}`,
        ].join('\n');
      }),
      'permissions',
    );
  },

  model(args) {
    const rows = db.models.filter((m) => args.every((t) => hit(m.name, t)));
    emit(
      rows.map((m) => {
        const fields = m.fields
          .map((f) => `${f.name}:${f.type}${f.id ? ' @id' : ''}${f.unique ? ' @unique' : ''}`)
          .join('  ');
        return [
          `${bold(m.name)}  ${dim(`${m.file}:${m.line}`)}`,
          m.doc ? `  ${m.doc}` : '',
          `  ${fields}`,
          m.indexes.length ? dim(`  ${m.indexes.join(' ')}`) : '',
        ].filter(Boolean).join('\n');
      }),
      'models',
    );
  },

  event(args) {
    const rows = db.events.filter((e) => args.every((t) => hit(`${e.name} ${e.symbol}`, t)));
    emit(
      rows.map((e) => [
        `${bold(e.name)}  ${dim(e.symbol)}`,
        e.doc ? `  ${e.doc}` : '',
        `  published by: ${e.publishers.length ? e.publishers.join(', ') : '** nothing **'}`,
        `  subscribed by: ${e.subscribers.length ? e.subscribers.join(', ') : '(nothing)'}`,
      ].filter(Boolean).join('\n'),
      ),
      'events',
    );
  },

  sym(args) {
    const rows = [];
    for (const f of db.files) {
      for (const s of f.symbols ?? []) {
        if (args.every((t) => hit(s.name, t))) {
          rows.push(`${bold(s.name)} ${dim(`(${s.kind})`)}  ${f.path}:${s.line}`);
        }
      }
    }
    emit(rows, 'symbols');
  },

  file(args) {
    const lead = args.length === 1 ? resolveFile(args[0]) : null;
    const rest = db.files.filter((f) => args.every((t) => hit(f.path, t)) && f !== lead);
    const rows = (lead ? [lead, ...rest] : rest);
    emit(
      rows.map((f) => [
        `${bold(f.path)}  ${dim(`${f.kind}, ${f.lines} lines`)}`,
        f.doc ? `  ${f.doc}` : '',
        (f.symbols ?? []).length
          ? `  exports: ${f.symbols.map((s) => `${s.name}:${s.line}`).join('  ')}`
          : '',
      ].filter(Boolean).join('\n')),
      'files',
    );
  },

  screen(args) {
    const rows = db.screens.filter((s) => args.every((t) => hit(`${s.url} ${s.file}`, t)));
    emit(
      rows.map((s) => `${s.url}  ${dim(`[${s.app}/${s.kind}${s.client ? ', client' : ''}]`)}\n       ${dim(s.file)}`),
      'screens',
    );
  },

  module(args) {
    const rows = db.apiModules.filter((m) => args.every((t) => hit(m.name, t)));
    emit(
      rows.map((m) => {
        const routes = db.routes.filter((r) => r.module === m.name);
        const models = db.models.filter((x) => x.file.endsWith(`/${m.name}.prisma`));
        const events = db.events.filter(
          (e) => [...e.publishers, ...e.subscribers].some((s) => s.includes(`/modules/${m.name}/`)),
        );
        return [
          `${bold(m.name)}  ${dim(`pack ${m.pack}${m.alwaysOn ? ', always on' : ''}`)}`,
          `  ${m.files.length} files · ${routes.length} routes · ${models.length} tables · ${events.length} events`,
          models.length ? `  tables: ${models.map((x) => x.name).join(', ')}` : '',
          `  page: ${m.page}`,
        ].filter(Boolean).join('\n');
      }),
      'modules',
    );
  },

  /**
   * Prints one symbol's source instead of the whole file.
   *
   * The index has recorded every symbol's line number since it was built and
   * nothing used them. Reading `orders.service.ts` to see one method costs
   * ~11,400 tokens; the method itself is a couple of hundred.
   */
  show(args) {
    const [target, symbol] = args;
    if (!target) return console.error('usage: idx show <file> [symbol]');

    const file = resolveFile(target);
    if (!file) return console.error(`no file matched "${target}"`);

    const source = readFileSync(join(ROOT, file.path), 'utf8').split('\n');
    if (!symbol) {
      console.log(`${bold(file.path)}  ${dim(`${file.kind}, ${file.lines} lines`)}`);
      if (file.doc) console.log(`  ${file.doc}`);
      for (const s of file.symbols ?? []) console.log(`  ${s.line.toString().padStart(5)}  ${s.kind.padEnd(10)} ${s.name}`);
      return;
    }

    const sym = (file.symbols ?? []).find((s) => norm(s.name) === norm(symbol))
      ?? (file.symbols ?? []).find((s) => hit(s.name, symbol));

    if (!sym) {
      // Not a top-level export — try a method inside a class. The index
      // records only top-level symbols on purpose (indexing every method would
      // multiply index.json several times over for something a brace scan can
      // find on demand), but "show me move()" is exactly the case worth
      // serving: it is the difference between 200 tokens and the whole file.
      const member = findMember(source, symbol);
      if (!member) return console.error(`no symbol or method "${symbol}" in ${file.path}`);
      console.log(dim(`${file.path}:${member.start}-${member.end}  (method)`));
      console.log(source.slice(member.start - 1, member.end).join('\n'));
      return;
    }

    // The next top-level symbol bounds this one. Without a parser that is the
    // honest boundary — it can over-run by a few lines, never under-run.
    const after = (file.symbols ?? [])
      .map((s) => s.line)
      .filter((l) => l > sym.line)
      .sort((a, b) => a - b)[0];
    const end = after ? after - 1 : source.length;

    console.log(dim(`${file.path}:${sym.line}-${end}`));
    console.log(source.slice(sym.line - 1, end).join('\n'));
  },

  where(args) {
    const q = args.join(' ');
    if (!q) return console.error('usage: idx where <text>');
    const found = [];
    for (const r of db.routes) if (hit(`${r.path} ${r.summary}`, q)) found.push(`route   ${r.method} ${r.path}  ${dim(r.file)}`);
    for (const p of db.permissions) if (hit(`${p.key} ${p.label}`, q)) found.push(`perm    ${p.key}  ${dim(p.label)}`);
    for (const m of db.models) if (hit(`${m.name} ${m.doc}`, q)) found.push(`model   ${m.name}  ${dim(m.file)}`);
    for (const e of db.events) if (hit(`${e.name} ${e.doc}`, q)) found.push(`event   ${e.name}`);
    for (const s of db.screens) if (hit(s.url, q)) found.push(`screen  ${s.url}  ${dim(s.file)}`);
    for (const f of db.files) if (hit(f.path, q) || hit(f.doc, q)) found.push(`file    ${f.path}`);
    emit(found, 'entries');
  },

  /**
   * Search every rule, scoped or not.
   *
   * A scoped rule only enters context when a matching file is opened, which is
   * the point — but it also means an agent can be unaware a rule exists while
   * planning the work it governs. This makes all of them reachable by hand.
   */
  rule(args) {
    const q = args.join(' ');
    const sources = [
      { file: 'CLAUDE.md', scope: 'always' },
      ...(db.files ?? [])
        .filter((f) => f.path.startsWith('.claude/rules/'))
        .map((f) => ({ file: f.path, scope: 'scoped' })),
    ];
    const rows = [];
    for (const src of sources) {
      let text;
      try { text = readFileSync(join(ROOT, src.file), 'utf8'); } catch { continue; }
      const lines = text.split('\n');
      const paths = (text.match(/^---\n([\s\S]*?)\n---/) ?? [])[1];
      const globs = paths ? [...paths.matchAll(/^\s*-\s*["']?([^"'\n]+)["']?/gm)].map((m) => m[1]) : [];
      let heading = '';
      lines.forEach((line, i) => {
        if (/^#{1,4} /.test(line)) heading = line.replace(/^#+ /, '');
        if (!q || hit(line, q)) {
          if (/^#{1,4} /.test(line) || (q && hit(line, q) && line.trim().length > 3)) {
            rows.push(
              `${dim(`${src.file}:${i + 1}`)}${globs.length ? dim(` [loads on ${globs[0]}${globs.length > 1 ? ` +${globs.length - 1}` : ''}]` ) : dim(' [always]')}\n  ${heading !== line.replace(/^#+ /, '') ? dim(`${heading} → `) : ''}${line.trim()}`,
            );
          }
        }
      });
    }
    emit(rows, 'rules');
  },

  stats() {
    for (const [k, v] of Object.entries(db.totals)) {
      console.log(`  ${k.padEnd(14)} ${String(v).padStart(7)}`);
    }
    const d = db.schemaMigrationDrift;
    if (d) {
      const n = d.missingTables.length + d.missingColumns.length + d.missingEnums.length + (d.missingEnumValues?.length ?? 0);
      console.log(`  ${'schema drift'.padEnd(14)} ${String(n).padStart(7)}${n ? '  ** see docs/index/cross/migrations.md **' : ''}`);
    }
  },
};

/* ── dispatch ──────────────────────────────────────────────────────────── */

const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`Query the repository index. Cheaper than opening an index page, which
is itself far cheaper than grepping the repository.

  idx route POST /admin/inventory     what guards an endpoint
  idx perm inventory.manage           a permission: routes, UI, roles
  idx model Order                     a table's fields
  idx event order.placed              publishers and subscribers
  idx sym OrdersService               where a symbol is defined
  idx file orders.service             a file's role and its exports
  idx screen /admin/orders            which file serves a URL
  idx module inventory                one module at a glance
  idx show <file> [symbol]            print a symbol, not the whole file
  idx where "abandoned cart"          fuzzy, across everything
  idx rule borders                    search every rule, scoped or not
  idx stats                           totals, and any schema drift

Results cap at ${LIMIT}; set IDX_LIMIT to raise it.
Full pages, when you genuinely need one: docs/index/README.md`);
  process.exit(0);
}

const run = commands[cmd];
if (!run) {
  console.error(`unknown command "${cmd}" — try \`idx help\``);
  process.exit(1);
}
run(args);
