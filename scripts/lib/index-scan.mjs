/**
 * Scanners for the repository index.
 *
 * Everything the index knows is READ OUT OF THE CODE, never typed by hand — a
 * hand-maintained map of a 114k-line repo is wrong within a week, and a wrong
 * map is worse than none because it is trusted. `scripts/build-index.mjs`
 * renders what this file extracts.
 *
 * Deliberately zero-dependency (no ts-morph, no @babel/parser) for two
 * reasons: it runs inside a git pre-commit hook, where `node_modules` may not
 * be installed and a two-second budget is the difference between a hook people
 * keep and a hook people pass `--no-verify` to; and an index needs POINTERS,
 * not semantics — "OrdersService.create is at orders.service.ts:210" is worth
 * the same whether a parser or a regex found the line.
 *
 * The trade-off is stated so nobody mistakes it for precision: these are
 * line-scanners. They can miss an exotic declaration and they do not resolve
 * types. Where a scanner cannot be sure, it says so in the output rather than
 * guessing. The authority on what the code does is still the code; this is the
 * map that tells you which 200 lines of it to open.
 */
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, basename, dirname, sep } from 'node:path';

/* ── reading ───────────────────────────────────────────────────────────── */

/**
 * Reads a source file as text.
 *
 * `product-admin.service.ts` carries a deliberate NUL byte inside a template
 * literal (a composite-key separator), which makes `file` and `grep` call it
 * binary. Stripping control characters here keeps one real source file from
 * falling out of the index over one byte.
 */
export function readText(root, rel) {
  try {
    return readFileSync(join(root, rel), 'utf8').replace(/\u0000/g, '␀');
  } catch {
    return '';
  }
}

/** Every file git tracks, which is exactly the set the index is responsible for. */
export function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
}

/* ── comment-aware helpers ─────────────────────────────────────────────── */

/**
 * The first sentence of the JSDoc/line comment immediately above `lineIdx`.
 *
 * This is what turns a file list into an index: a path tells you a file
 * exists, its own first doc line tells you whether it is the one you want.
 */
export function docAbove(lines, lineIdx) {
  let i = lineIdx - 1;
  while (i >= 0 && lines[i].trim() === '') i -= 1;
  // decorators and modifiers sit between the doc block and the declaration
  while (i >= 0 && /^\s*(@\w|export |declare |abstract )/.test(lines[i]) && !/\*\//.test(lines[i])) i -= 1;
  if (i < 0) return '';

  const collected = [];
  if (/\*\//.test(lines[i])) {
    while (i >= 0) {
      collected.unshift(lines[i]);
      if (/\/\*\*?/.test(lines[i])) break;
      i -= 1;
    }
  } else if (/^\s*\/{2,3}/.test(lines[i])) {
    while (i >= 0 && /^\s*\/{2,3}/.test(lines[i])) {
      collected.unshift(lines[i]);
      i -= 1;
    }
  } else {
    return '';
  }

  const text = collected
    .join(' ')
    .replace(/\/\*\*?|\*\/|^\s*\*\s?|\/{2,3}/g, ' ')
    .replace(/\s*\*\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = text.split(/(?<=[.?!])\s/)[0] ?? text;
  return clip(sentence, 200);
}

/** The file's own top-of-file doc block — its one-line reason to exist. */
export function fileDoc(source) {
  const m = source.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (m) {
    const text = m[1].replace(/^\s*\*\s?/gm, ' ').replace(/\s+/g, ' ').trim();
    return clip(text.split(/(?<=[.?!])\s/)[0] ?? text, 220);
  }
  const line = source.match(/^\s*\/\/\s?(.+)$/m);
  if (line && source.indexOf(line[0]) < 200) return clip(line[1].trim(), 220);
  return '';
}

/**
 * The value of a quoted string that starts at `after`, honouring the opening
 * quote character.
 *
 * `[^'"`]*` is the obvious pattern and it is wrong the moment a double-quoted
 * string contains an apostrophe — `"A SKU's full supply-chain status"` came out
 * as `A SKU` and `"Edit each role's granted permissions"` as `Edit each role`.
 * Both are real strings in this repository, and both were silently truncated in
 * the first build of this index.
 */
export function quotedAfter(source, pattern) {
  const m = source.match(pattern);
  if (!m) return '';
  const rest = source.slice(m.index + m[0].length);
  const quote = rest[0];
  if (!['"', "'", '`'].includes(quote)) return '';
  let out = '';
  for (let i = 1; i < rest.length; i += 1) {
    const c = rest[i];
    if (c === '\\') { out += rest[i + 1] ?? ''; i += 1; continue; }
    if (c === quote) return out;
    if (c === '\n' && quote !== '`') return out;
    out += c;
  }
  return out;
}

export function clip(text, max) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Markdown table cells cannot contain a raw pipe or newline. */
export function cell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/* ── TypeScript symbol scanning ────────────────────────────────────────── */

const SYMBOL_PATTERNS = [
  [/^export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class'],
  [/^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'function'],
  [/^export\s+interface\s+([A-Za-z_$][\w$]*)/, 'interface'],
  [/^export\s+type\s+([A-Za-z_$][\w$]*)/, 'type'],
  [/^export\s+enum\s+([A-Za-z_$][\w$]*)/, 'enum'],
  [/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, 'const'],
  [/^export\s+declare\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/, 'declare'],
  [/^export\s+default\s+(?:async\s+)?function\s*([A-Za-z_$][\w$]*)?/, 'default'],
  [/^export\s+default\s+class\s+([A-Za-z_$][\w$]*)?/, 'default'],
];

/**
 * Exported symbols of a .ts/.tsx file, with the line to jump to.
 *
 * Only top-level exports (column 0) are collected on purpose. A nested
 * `export` inside a namespace is not something a reader navigates to by name,
 * and including them buries the file's actual public surface.
 */
export function scanSymbols(source) {
  const lines = source.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    if (!line.startsWith('export')) return;
    if (/^export\s*\{/.test(line) || /^export\s+\*/.test(line)) return; // re-exports, handled below
    for (const [re, kind] of SYMBOL_PATTERNS) {
      const m = line.match(re);
      if (m) {
        const name = m[1] ?? 'default';
        out.push({ name, kind, line: i + 1, doc: docAbove(lines, i) });
        return;
      }
    }
  });
  return out;
}

/** `export { a, b } from './x'` and `export * from './x'` — a barrel's contents. */
export function scanReExports(source) {
  const out = [];
  const named = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = named.exec(source))) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean);
    out.push({ from: m[2], names });
  }
  const star = /export\s+\*\s+from\s*['"]([^'"]+)['"]/g;
  while ((m = star.exec(source))) out.push({ from: m[1], names: ['*'] });
  return out;
}

/** Local (relative and workspace) imports — the file's real dependency edges. */
export function scanImports(source) {
  const out = new Set();
  const re = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source))) out.add(m[1]);
  return [...out];
}

/* ── NestJS: controllers, routes, permissions ──────────────────────────── */

const HTTP_DECORATORS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options', 'All'];

/**
 * Every HTTP endpoint a controller file declares, with the access rule that
 * actually guards it.
 *
 * The access rule is the point. `JwtAuthGuard` is global, so a route with no
 * decorator is authenticated-but-unrestricted — which CLAUDE.md calls "almost
 * never intended". Surfacing the resolved rule per route turns that from
 * something you find by reading 57 controllers into something you find by
 * reading one table.
 */
export function scanController(source, rel) {
  const lines = source.split('\n');
  const controllers = [];
  let current = null;

  // decorators accumulated since the last declaration
  let pending = { permissions: [], public: false, authOnly: false, summary: '', http: [], deprecated: false };
  const resetPending = () => {
    pending = { permissions: [], public: false, authOnly: false, summary: '', http: [], deprecated: false };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    const perm = trimmed.match(/^@RequirePermission\(([^)]*)\)/);
    if (perm) {
      pending.permissions.push(
        ...[...perm[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]),
      );
      continue;
    }
    if (/^@Public\(\)/.test(trimmed)) { pending.public = true; continue; }
    if (/^@AuthenticatedOnly\(\)/.test(trimmed)) { pending.authOnly = true; continue; }

    if (/^@ApiOperation\(\{\s*summary:/.test(trimmed)) {
      pending.summary = quotedAfter(trimmed, /^@ApiOperation\(\{\s*summary:\s*/);
      continue;
    }

    const verb = trimmed.match(new RegExp(`^@(${HTTP_DECORATORS.join('|')})\\(\\s*(?:['"]([^'"]*)['"])?`));
    if (verb) { pending.http.push({ method: verb[1].toUpperCase(), path: verb[2] ?? '' }); continue; }

    const ctrl = trimmed.match(/^@Controller\(\s*(?:['"]([^'"]*)['"])?/);
    if (ctrl) {
      // The class declaration follows, possibly after more decorators.
      let j = i + 1;
      const held = { ...pending, permissions: [...pending.permissions] };
      const extra = { permissions: [], public: false, authOnly: false };
      while (j < lines.length && !/^\s*(export\s+)?class\s/.test(lines[j])) {
        const t = lines[j].trim();
        const p = t.match(/^@RequirePermission\(([^)]*)\)/);
        if (p) extra.permissions.push(...[...p[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]));
        if (/^@Public\(\)/.test(t)) extra.public = true;
        if (/^@AuthenticatedOnly\(\)/.test(t)) extra.authOnly = true;
        j += 1;
      }
      const nameMatch = lines[j]?.match(/class\s+([A-Za-z_$][\w$]*)/);
      current = {
        file: rel,
        class: nameMatch ? nameMatch[1] : '(anonymous)',
        line: j + 1,
        base: (ctrl[1] ?? '').replace(/^\/+|\/+$/g, ''),
        classPermissions: [...held.permissions, ...extra.permissions],
        classPublic: held.public || extra.public,
        classAuthOnly: held.authOnly || extra.authOnly,
        doc: docAbove(lines, j),
        routes: [],
      };
      controllers.push(current);
      i = j;
      resetPending();
      continue;
    }

    // A method declaration closes whatever decorators were pending.
    if (current && pending.http.length > 0) {
      const method = trimmed.match(/^(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
      if (method && !trimmed.startsWith('@') && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
        for (const h of pending.http) {
          current.routes.push({
            method: h.method,
            path: joinRoute(current.base, h.path),
            handler: method[1],
            line: i + 1,
            summary: pending.summary || docAbove(lines, i),
            permissions: pending.permissions.length ? pending.permissions : current.classPermissions,
            permissionSource: pending.permissions.length ? 'method' : (current.classPermissions.length ? 'class' : 'none'),
            public: pending.public || current.classPublic,
            authOnly: pending.authOnly || current.classAuthOnly,
          });
        }
        resetPending();
      }
    }
  }
  return controllers;
}

export function joinRoute(base, path) {
  const parts = [base, path].filter((p) => p !== undefined && p !== null && p !== '');
  const joined = parts.join('/').replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return `/${joined.replace(/^\/+/, '')}`;
}

/** How a route is guarded, in the words a reader needs. */
export function accessOf(route) {
  if (route.permissions.length) return route.permissions.join(' | ');
  if (route.public) return 'PUBLIC';
  if (route.authOnly) return 'any signed-in user';
  return 'UNDECORATED (authenticated, unrestricted)';
}

/** A NestJS `@Module({...})` wiring block. */
export function scanNestModule(source, rel) {
  const m = source.match(/@Module\(\{([\s\S]*?)\}\s*\)\s*export\s+class\s+([A-Za-z_$][\w$]*)/);
  if (!m) return null;
  const body = m[1];
  const list = (key) => {
    const arr = body.match(new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
    if (!arr) return [];
    return arr[1]
      .split(',')
      .map((s) => s.replace(/\/\/.*$/gm, '').trim())
      .filter((s) => s && /^[A-Za-z_$]/.test(s))
      .map((s) => s.split(/[.(]/)[0]);
  };
  return {
    file: rel,
    class: m[2],
    imports: list('imports'),
    controllers: list('controllers'),
    providers: list('providers'),
    exports: list('exports'),
  };
}

/* ── domain events and scheduled work ──────────────────────────────────── */

/** The event catalogue itself: `Name: 'event.name'` inside `DomainEvent`. */
export function scanEventCatalog(source) {
  const block = balancedLiteral(source, /export const DomainEvent\s*=\s*\{/, '{', '}');
  if (!block) return [];
  const lines = block.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*['"]([^'"]+)['"]/);
    if (m) out.push({ symbol: m[1], name: m[2], doc: docAbove(lines, i) });
  });
  return out;
}

/** Subscribers (`@OnDomainEvent`) and publishers (every other `DomainEvent.X`). */
export function scanEventUsage(source, rel) {
  const lines = source.split('\n');
  const subscribes = [];
  const references = [];
  lines.forEach((line, i) => {
    const sub = line.match(/@OnDomainEvent\(\s*DomainEvent\.([A-Za-z_$][\w$]*)/);
    if (sub) {
      let j = i + 1;
      while (j < lines.length && /^\s*@/.test(lines[j])) j += 1;
      const handler = lines[j]?.match(/(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
      subscribes.push({ symbol: sub[1], file: rel, line: i + 1, handler: handler ? handler[1] : '?' });
      return;
    }
    for (const m of line.matchAll(/DomainEvent\.([A-Za-z_$][\w$]*)/g)) {
      references.push({ symbol: m[1], file: rel, line: i + 1 });
    }
  });
  return { subscribes, references };
}

/**
 * A named `Record<XStatus, XStatus[]>` constant — this repository's own
 * explicit, checked-before-every-write state-transition table
 * (architecture-patterns/106-finite-state-machines-registry.md, WO-106.1).
 * Matches only this one literal shape. A status enum whose transitions are
 * instead enforced by scattered inline checks per method (no single named
 * table) is real but outside what a line-based scanner can detect — the
 * generated page says so rather than claiming a completeness it cannot have.
 */
export function scanStateMachines(source, rel) {
  const lines = source.split('\n');
  const out = [];
  // The type param must itself look like a status/state enum (PascalCase,
  // ending in "Status" or "State") — Record<string, string[]> and similar
  // generic maps share the identical Record<X, X[]> shape but are not a
  // state machine, and would otherwise be indistinguishable false positives.
  const declPattern = /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*:\s*Record<\s*([A-Z][\w$]*(?:Status|State))\s*,\s*\2\[\]\s*>\s*=\s*\{/;
  lines.forEach((line, i) => {
    const m = line.match(declPattern);
    if (!m) return;
    const [, name, typeParam] = m;
    let depth = 0;
    let started = false;
    const bodyLines = [];
    for (let j = i; j < lines.length; j += 1) {
      const current = lines[j];
      for (const c of current) {
        if (c === '{') { depth += 1; started = true; }
        else if (c === '}') depth -= 1;
      }
      bodyLines.push(current);
      if (started && depth === 0) break;
    }
    out.push({ name, typeParam, file: rel, line: i + 1, body: bodyLines.join('\n'), doc: docAbove(lines, i) });
  });
  return out;
}

/** `@Cron('expr')` — the background work nothing in the UI reveals. */
export function scanCron(source, rel) {
  const lines = source.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/@Cron\(\s*(?:CronExpression\.([A-Z_]+)|['"]([^'"]+)['"])/);
    if (!m) return;
    let j = i + 1;
    while (j < lines.length && /^\s*@/.test(lines[j])) j += 1;
    const handler = lines[j]?.match(/(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
    out.push({
      schedule: m[1] ?? m[2],
      file: rel,
      line: i + 1,
      handler: handler ? handler[1] : '?',
      doc: docAbove(lines, i),
    });
  });
  return out;
}

/* ── Prisma ────────────────────────────────────────────────────────────── */

/**
 * Models and enums of one `.prisma` file, with every field.
 *
 * Fields are included in full rather than summarised because the data model is
 * the one place where "roughly" is useless: the question an agent brings here
 * is "does this table have a locationId", and half an answer sends it to the
 * file anyway.
 */
export function scanPrisma(source, rel) {
  const lines = source.split('\n');
  const models = [];
  const enums = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const model = line.match(/^model\s+([A-Za-z_][\w]*)\s*\{/);
    const enumDecl = line.match(/^enum\s+([A-Za-z_][\w]*)\s*\{/);
    if (model || enumDecl) {
      const name = (model ?? enumDecl)[1];
      const doc = docAbove(lines, i);
      const startLine = i + 1;
      const body = [];
      i += 1;
      while (i < lines.length && !/^\}/.test(lines[i])) { body.push(lines[i]); i += 1; }
      if (model) {
        const fields = [];
        const indexes = [];
        for (const raw of body) {
          const t = raw.trim();
          if (!t || t.startsWith('//')) continue;
          if (t.startsWith('@@')) { indexes.push(t.replace(/\s+/g, ' ')); continue; }
          const f = t.match(/^([A-Za-z_][\w]*)\s+(\S+)(.*)$/);
          if (!f) continue;
          const attrs = f[3].trim();
          fields.push({
            name: f[1],
            type: f[2],
            optional: f[2].endsWith('?'),
            list: f[2].endsWith('[]'),
            relation: /@relation/.test(attrs),
            id: /@id\b/.test(attrs),
            unique: /@unique\b/.test(attrs),
            attrs: clip(attrs.replace(/\/\/.*$/, ''), 120),
            note: (raw.match(/\/\/\s*(.+)$/) ?? [])[1]?.trim() ?? '',
          });
        }
        // `@@map("x")` renames the physical table; the drift check compares
        // against the real name, not the model name.
        const mapped = indexes.map((i) => i.match(/^@@map\("([^"]+)"\)/)).find(Boolean);
        models.push({ name, file: rel, line: startLine, doc, fields, indexes, tableMap: mapped ? mapped[1] : name });
      } else {
        const values = body
          .map((b) => b.replace(/\/\/.*$/, '').trim())
          .filter((b) => b && /^[A-Za-z_]/.test(b));
        const notes = {};
        for (const raw of body) {
          const m = raw.match(/^\s*([A-Za-z_][\w]*)\s*\/\/\s*(.+)$/);
          if (m) notes[m[1]] = m[2].trim();
        }
        enums.push({ name, file: rel, line: startLine, doc, values, notes });
      }
    }
    i += 1;
  }
  return { models, enums };
}

/** One migration folder: when it ran, what it was for, what it touched. */
export function scanMigration(root, rel) {
  const dir = dirname(rel);
  const folder = basename(dir);
  const stamp = folder.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_(.+)$/);
  const sql = readText(root, rel);
  const touched = new Set();
  for (const m of sql.matchAll(/(?:CREATE TABLE|ALTER TABLE|DROP TABLE)\s+(?:IF NOT EXISTS\s+)?"?([\w."]+)"?/gi)) {
    touched.add(m[1].replace(/"/g, '').split('.').pop());
  }
  const kinds = new Set();
  for (const m of sql.matchAll(/^\s*(CREATE TABLE|ALTER TABLE|CREATE INDEX|CREATE UNIQUE INDEX|DROP TABLE|CREATE TYPE|ALTER TYPE|DROP COLUMN|UPDATE|INSERT)/gim)) {
    kinds.add(m[1].toUpperCase());
  }
  return {
    folder,
    file: rel,
    date: stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}` : '',
    slug: stamp ? stamp[7] : folder,
    statements: sql.split(';').filter((s) => s.trim()).length,
    kinds: [...kinds],
    tables: [...touched].sort(),
  };
}

/* ── permissions ───────────────────────────────────────────────────────── */

/**
 * The source of the bracketed literal that follows `declaration`, matched by
 * counting brackets rather than by looking for a closing line.
 *
 * `PERMISSION_CATALOG` ends with `] as const;`, not `];`. A regex that stops at
 * the first `\n];` therefore ran PAST the catalogue into the next declaration
 * and produced a permission list that was both too long and subtly wrong. A
 * bracket counter cannot make that mistake, and every registry in this
 * repository is read through it for the same reason.
 */
export function balancedLiteral(source, declarationPattern, open = '[', close = ']') {
  const decl = source.match(declarationPattern);
  if (!decl) return '';
  const from = source.indexOf(open, decl.index + decl[0].length - 1);
  if (from < 0) return '';
  let depth = 0, quote = '', escaped = false, line = false, comment = false;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (line) { if (c === '\n') line = false; continue; }
    if (comment) { if (c === '*' && source[i + 1] === '/') { comment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && source[i + 1] === '/') { line = true; i += 1; continue; }
    if (c === '/' && source[i + 1] === '*') { comment = true; i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === open) depth += 1;
    else if (c === close) { depth -= 1; if (depth === 0) return source.slice(from + 1, i); }
  }
  return '';
}

/**
 * Splits `{...}, {...}` object literals at depth 1, quote-aware.
 *
 * A single regex with `[\s\S]*?` between the fields silently BRIDGES two
 * entries whenever one of them orders its fields differently — it matched 33 of
 * this file's 51 permissions before this existed, and a permission index that
 * is two-thirds complete is worse than none, because nothing about it looks
 * wrong. Counting braces cannot bridge.
 */
export function splitObjectLiterals(block) {
  const out = [];
  let depth = 0, start = -1, quote = '', escaped = false, line = false, comment = false;
  for (let i = 0; i < block.length; i += 1) {
    const c = block[i];
    if (line) { if (c === '\n') line = false; continue; }
    if (comment) { if (c === '*' && block[i + 1] === '/') { comment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && block[i + 1] === '/') { line = true; i += 1; continue; }
    if (c === '/' && block[i + 1] === '*') { comment = true; i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') { if (depth === 0) start = i; depth += 1; continue; }
    if (c === '}') { depth -= 1; if (depth === 0 && start >= 0) { out.push(block.slice(start, i + 1)); start = -1; } }
  }
  return out;
}

/** The value of a `field: 'literal'` property, whatever order the fields are in. */
function prop(objectSource, name) {
  return quotedAfter(objectSource, new RegExp(`\\b${name}\\s*:\\s*`));
}

/** `PERMISSION_CATALOG` — the compile-time list every guard is checked against. */
export function scanPermissionCatalog(source) {
  const block = balancedLiteral(source, /export const PERMISSION_CATALOG[^=]*=\s*\[/);
  if (!block) return [];
  return splitObjectLiterals(block)
    .map((o) => ({
      key: prop(o, 'key'),
      label: prop(o, 'label'),
      category: prop(o, 'category'),
      sensitivity: prop(o, 'sensitivity'),
    }))
    .filter((p) => p.key);
}

/**
 * `ROLE_PERMISSION_SEED` — which role is granted what at seed time.
 *
 * This is the answer to "does a live user actually hold this permission", which
 * is a different question from "does the permission exist" and the one CLAUDE.md
 * calls out as a real trap: a key in the catalogue that reaches no role is
 * scaffolding, not access control.
 */
export function scanRoleSeed(source) {
  const block = balancedLiteral(source, /export const ROLE_PERMISSION_SEED[^=]*=\s*\{/, '{', '}');
  if (!block) return {};
  const out = {};
  const re = /([A-Z_]+)\s*:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = re.exec(block))) {
    out[m[1]] = [...m[2].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  }
  return out;
}

/* ── Next.js app router ────────────────────────────────────────────────── */

/**
 * The URL a `page.tsx` / `route.ts` actually serves.
 *
 * Route groups `(admin)` vanish from the URL, `[id]` stays as a parameter —
 * getting this wrong is why "which file serves /admin/orders" is a question
 * people grep for repeatedly.
 */
export function appRouterPath(rel, appDirPrefix) {
  const withoutPrefix = rel.slice(appDirPrefix.length).replace(/^\/+/, '');
  const segments = withoutPrefix.split('/');
  segments.pop(); // page.tsx / route.ts / layout.tsx
  const url = segments
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    .filter((s) => !s.startsWith('@'))
    .join('/');
  return `/${url}`;
}

export function routeKind(file) {
  const base = basename(file);
  if (base.startsWith('page.')) return 'page';
  if (base.startsWith('route.')) return 'handler';
  if (base.startsWith('layout.')) return 'layout';
  if (base.startsWith('error.')) return 'error';
  if (base.startsWith('not-found.')) return 'not-found';
  if (base.startsWith('global-error.')) return 'global-error';
  if (base.startsWith('loading.')) return 'loading';
  if (base.startsWith('template.')) return 'template';
  if (base.startsWith('default.')) return 'default';
  return '';
}

/** `'use client'` decides where a component can run — worth one column. */
export function isClientComponent(source) {
  return /^\s*['"]use client['"]/m.test(source.slice(0, 400));
}

/* ── tests ─────────────────────────────────────────────────────────────── */

/** Top-level `describe(...)` titles — what a spec file claims to cover. */
export function scanDescribes(source) {
  const out = [];
  for (const m of source.matchAll(/^\s*describe(?:\.\w+)?\(\s*['"`]([^'"`]+)/gm)) out.push(m[1]);
  for (const m of source.matchAll(/^\s*describe\(\s*([A-Za-z_$][\w$]*)\.name/gm)) out.push(`${m[1]} (class)`);
  return [...new Set(out)];
}

/** Every `it(...)` title — the behaviours actually pinned down. */
export function scanTestNames(source) {
  const out = [];
  for (const m of source.matchAll(/^\s*(?:it|test)(?:\.\w+)?\(\s*['"`]([^'"`]+)/gm)) out.push(m[1]);
  return out;
}

/* ── markdown ──────────────────────────────────────────────────────────── */

/** A doc's heading outline — enough to route a question to the right section. */
export function scanHeadings(source, maxDepth = 2) {
  const out = [];
  let inFence = false;
  source.split('\n').forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m && m[1].length <= maxDepth) out.push({ depth: m[1].length, text: m[2].trim(), line: i + 1 });
  });
  return out;
}

/* ── classification ────────────────────────────────────────────────────── */

/** What kind of thing a file is, from the conventions this repo actually uses. */
export function classify(rel) {
  const base = basename(rel);
  const ext = extname(rel);
  if (/\.e2e-spec\.ts$/.test(base)) return 'e2e test';
  if (/\.spec\.tsx?$/.test(base)) return 'unit test';
  if (/\.controller\.ts$/.test(base)) return 'controller';
  if (/\.service\.ts$/.test(base)) return 'service';
  if (/\.module\.ts$/.test(base)) return 'nest module';
  if (/\.(listener|subscriber)\.ts$/.test(base)) return 'event subscriber';
  if (/\.cron\.ts$/.test(base)) return 'scheduled job';
  if (/\.guard\.ts$/.test(base)) return 'guard';
  if (/\.strategy\.ts$/.test(base)) return 'auth strategy';
  if (/\.dto\.ts$/.test(base) || rel.includes('/dto/')) return 'dto';
  if (/\.registry\.ts$/.test(base)) return 'registry';
  if (/\.(agent|dispatcher|channel|driver)\.ts$/.test(base)) return base.match(/\.(\w+)\.ts$/)[1];
  if (/\.prisma$/.test(base)) return 'prisma schema';
  if (/migration\.sql$/.test(base)) return 'migration';
  if (/^page\.tsx?$/.test(base)) return 'page';
  if (/^layout\.tsx?$/.test(base)) return 'layout';
  if (/^route\.ts$/.test(base)) return 'route handler';
  if (/^(error|global-error|not-found|loading)\.tsx?$/.test(base)) return base.replace(/\.tsx?$/, '');
  if (rel.includes('/components/')) return 'component';
  if (rel.includes('/hooks/')) return 'hook';
  if (rel.includes('/lib/') || rel.includes('/utils/')) return 'utility';
  if (rel.includes('/constants/')) return 'constants';
  if (rel.includes('/types/')) return 'types';
  if (rel.includes('/config/')) return 'config';
  if (ext === '.md') return 'doc';
  if (ext === '.json') return 'json';
  if (ext === '.mjs' || ext === '.js') return 'script';
  if (ext === '.tsx') return 'react';
  if (ext === '.ts') return 'module';
  if (ext === '.sql') return 'sql';
  if (ext === '.yml' || ext === '.yaml') return 'yaml';
  if (ext === '.svg' || ext === '.png' || ext === '.ico') return 'asset';
  if (ext === '.css') return 'stylesheet';
  return ext.replace('.', '') || 'file';
}

export { join, basename, dirname, extname, sep, statSync };

/* ── schema vs. migrations ─────────────────────────────────────────────── */

/**
 * The tables and columns the committed migrations actually create.
 *
 * Migrations here are hand-written and forward-only, which means nothing
 * mechanically guarantees that a model added to a `.prisma` file ever got a
 * migration. When it does not, everything still typechecks and lints — Prisma
 * generates a client from the schema, not from the database — and the failure
 * only appears when somebody builds a database from the committed migrations
 * and it is missing a column. Reading both sides turns that into a fact the
 * index can state.
 */
/**
 * Splits SQL into statements, ignoring semicolons inside strings, identifiers,
 * dollar-quoted bodies and comments, and strips the comments.
 *
 * Prisma writes a block-comment `Warnings:` preamble at the top of some
 * migrations.
 * A splitter that only strips `--` lines leaves that block glued to the first
 * real statement, which then fails to match `^ALTER TABLE` — and five columns
 * that a migration does add get reported as missing. Silent under-matching is
 * the failure mode to design against here, because it produces confident,
 * wrong output rather than an error.
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let buf = '';
  let quote = '';        // ' or " when inside one
  let dollarTag = null;  // $tag$ … $tag$
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    const next = sql[i + 1];

    if (lineComment) { if (c === '\n') { lineComment = false; buf += '\n'; } continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (dollarTag) {
      buf += c;
      if (sql.startsWith(dollarTag, i)) { buf += dollarTag.slice(1); i += dollarTag.length - 1; dollarTag = null; }
      continue;
    }
    if (quote) {
      buf += c;
      if (c === quote) {
        if (next === quote) { buf += next; i += 1; }  // escaped '' or ""
        else quote = '';
      }
      continue;
    }

    if (c === '-' && next === '-') { lineComment = true; i += 1; continue; }
    if (c === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (c === "'" || c === '"') { quote = c; buf += c; continue; }
    const dollar = sql.slice(i).match(/^\$[A-Za-z_]*\$/);
    if (dollar) { dollarTag = dollar[0]; buf += dollarTag; i += dollarTag.length - 1; continue; }

    if (c === ';') { if (buf.trim()) statements.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) statements.push(buf.trim());
  return statements;
}

export function scanMigrationSql(sqlTexts) {
  const tables = new Map(); // table -> Set(column)
  const enums = new Map();  // enum  -> Set(value)
  const bare = (name) => name.replace(/"/g, '').split('.').pop();
  const add = (table, column) => {
    if (!tables.has(table)) tables.set(table, new Set());
    if (column) tables.get(table).add(column);
  };

  for (const sql of sqlTexts) {
    // Statements are applied IN ORDER, not grouped by kind. A migration that
    // does `DROP TABLE "X"; CREATE TABLE "X" (…)` — this repository has one,
    // rebuilding ReplicationCursor with a new primary key — ends with the table
    // present. Running every DROP after every CREATE would conclude it was
    // deleted, and report a table that exists as missing. A wrong drift report
    // is worse than none: it sends somebody to write a migration for a table
    // that is already there.
    for (const stmt of splitSqlStatements(sql)) {

      let m;
      if ((m = stmt.match(/^CREATE\s+TYPE\s+("?[\w."]+"?)\s+AS\s+ENUM\s*\(([\s\S]*)\)\s*$/i))) {
        enums.set(bare(m[1]), new Set([...m[2].matchAll(/'([^']*)'/g)].map((v) => v[1])));
        continue;
      }
      if ((m = stmt.match(/^CREATE\s+TYPE\s+("?[\w."]+"?)/i))) { enums.set(bare(m[1]), new Set()); continue; }
      // `ALTER TYPE x ADD VALUE 'y'` is how a value joins an existing enum.
      if ((m = stmt.match(/^ALTER\s+TYPE\s+("?[\w."]+"?)\s+ADD\s+VALUE\s+(?:IF NOT EXISTS\s+)?'([^']*)'/i))) {
        const name = bare(m[1]);
        if (!enums.has(name)) enums.set(name, new Set());
        enums.get(name).add(m[2]);
        continue;
      }
      if ((m = stmt.match(/^DROP\s+TYPE\s+(?:IF EXISTS\s+)?("?[\w."]+"?)/i))) { enums.delete(bare(m[1])); continue; }
      if ((m = stmt.match(/^ALTER\s+TYPE\s+("?[\w."]+"?)\s+RENAME\s+TO\s+("?[\w."]+"?)/i))) {
        const from = bare(m[1]);
        enums.set(bare(m[2]), enums.get(from) ?? new Set());
        enums.delete(from);
        continue;
      }

      if ((m = stmt.match(/^CREATE\s+TABLE\s+(?:IF NOT EXISTS\s+)?("?[\w."]+"?)\s*\(([\s\S]*)\)\s*$/i))) {
        const table = bare(m[1]);
        tables.set(table, new Set());
        for (const line of m[2].split('\n')) {
          const col = line.trim().match(/^"([^"]+)"\s+\S/);
          if (col) add(table, col[1]);
        }
        continue;
      }
      if ((m = stmt.match(/^DROP\s+TABLE\s+(?:IF EXISTS\s+)?("?[\w."]+"?)/i))) { tables.delete(bare(m[1])); continue; }

      if ((m = stmt.match(/^ALTER\s+TABLE\s+(?:IF EXISTS\s+)?(?:ONLY\s+)?("?[\w."]+"?)([\s\S]*)$/i))) {
        const table = bare(m[1]);
        const body = m[2];
        const renameTable = body.match(/^\s*RENAME\s+TO\s+("?[\w."]+"?)/i);
        if (renameTable) {
          const to = bare(renameTable[1]);
          if (tables.has(table)) { tables.set(to, tables.get(table)); tables.delete(table); }
          continue;
        }
        for (const c of body.matchAll(/ADD\s+COLUMN\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/gi)) add(table, c[1]);
        for (const c of body.matchAll(/RENAME\s+COLUMN\s+"([^"]+)"\s+TO\s+"([^"]+)"/gi)) {
          tables.get(table)?.delete(c[1]);
          add(table, c[2]);
        }
        for (const c of body.matchAll(/DROP\s+COLUMN\s+(?:IF EXISTS\s+)?"([^"]+)"/gi)) tables.get(table)?.delete(c[1]);
      }
    }
  }
  return { tables, enums };
}

/**
 * Which models, fields and enums the schema declares that no migration builds.
 *
 * Only physical columns are compared: a relation object field and a list field
 * are not columns, and reporting them would bury the real findings in noise.
 * `@map` is honoured, since that is the actual column name.
 */
export function schemaMigrationDrift(models, enums, built) {
  const modelNames = new Set(models.map((m) => m.name));
  const tableOf = (m) => (m.tableMap ?? m.name);
  const missingTables = [];
  const missingColumns = [];

  for (const model of models) {
    const table = tableOf(model);
    if (!built.tables.has(table)) { missingTables.push({ model: model.name, table, file: model.file, line: model.line }); continue; }
    const columns = built.tables.get(table);
    for (const f of model.fields) {
      if (f.list || f.relation) continue;
      const base = f.type.replace(/[?[\]]/g, '');
      if (modelNames.has(base)) continue;
      const column = (f.attrs.match(/@map\("([^"]+)"\)/) ?? [])[1] ?? f.name;
      if (!columns.has(column)) {
        missingColumns.push({ model: model.name, table, field: f.name, column, type: f.type, file: model.file, line: model.line });
      }
    }
  }

  const missingEnums = enums
    .filter((e) => !built.enums.has(e.name))
    .map((e) => ({ enum: e.name, file: e.file, line: e.line }));

  // A value added to an existing enum needs its own `ALTER TYPE … ADD VALUE`.
  // Forgetting one is invisible until a write uses it: the schema typechecks,
  // Prisma generates the value into its client, and Postgres rejects the
  // INSERT at runtime. `StockMovementReason` was carrying four such values.
  const missingEnumValues = [];
  for (const e of enums) {
    const have = built.enums.get(e.name);
    if (!have) continue; // whole enum already reported above
    for (const value of e.values) {
      if (!have.has(value)) {
        missingEnumValues.push({ enum: e.name, value, file: e.file, line: e.line });
      }
    }
  }

  return { missingTables, missingColumns, missingEnums, missingEnumValues };
}
