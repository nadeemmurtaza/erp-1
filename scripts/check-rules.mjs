#!/usr/bin/env node
/**
 * Keeps the rule index and the rule files from drifting apart.
 *
 * Some rules live in `.claude/rules/` with a `paths:` block so they load only
 * when a file they govern is opened, rather than sitting in CLAUDE.md's context
 * on every session. That saves a real amount of context and makes a rule arrive
 * when it is most likely to be followed — but it introduces a failure mode
 * CLAUDE.md alone never had: a rule can become unreachable without anyone
 * noticing. A scoped rule with a typo in its glob, or a file nobody links to,
 * is a rule that has quietly stopped applying.
 *
 * So the index in CLAUDE.md is treated as a contract with the directory:
 *
 *   1. Every `.claude/rules/*.md` is listed in CLAUDE.md's rule index.
 *   2. Every file the index lists exists.
 *   3. Every scoped rule declares at least one `paths:` glob, and every glob
 *      matches at least one tracked file — a glob that matches nothing is a
 *      rule that never loads.
 *   4. Every rule file says it is binding, so nobody reads a scoped rule as a
 *      suggestion.
 *
 * Run by `pnpm lint` and by `pnpm check`.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve('.');
const RULES_DIR = join(ROOT, '.claude', 'rules');
const CLAUDE_MD = join(ROOT, 'CLAUDE.md');

if (!existsSync(RULES_DIR)) {
  console.log('No .claude/rules/ directory — nothing to check.');
  process.exit(0);
}

const problems = [];
const claude = readFileSync(CLAUDE_MD, 'utf8');
const files = readdirSync(RULES_DIR).filter((f) => f.endsWith('.md')).sort();

if (files.length === 0) {
  console.log('No rule files — nothing to check.');
  process.exit(0);
}

/** Tracked files, so a glob can be checked against something real. */
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  .toString('utf8').split('\n').filter(Boolean);

/** Minimal glob → RegExp, enough for the patterns `paths:` actually uses. */
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      // `**/` may match zero directories, so the slash is part of the option.
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      continue;
    }
    if (c === '*') { re += '[^/]*'; continue; }
    if (c === '?') { re += '[^/]'; continue; }
    if ('.+^${}()|[]\\'.includes(c)) { re += `\\${c}`; continue; }
    re += c;
  }
  return new RegExp(`^${re}$`);
}

for (const file of files) {
  const rel = `.claude/rules/${file}`;
  const body = readFileSync(join(RULES_DIR, file), 'utf8');

  // 1. listed in CLAUDE.md
  if (!claude.includes(rel)) {
    problems.push(`${rel}\n    exists but CLAUDE.md's rule index does not list it — a rule nobody\n    is pointed at is a rule that stops being applied.`);
  }

  // 3. paths present and non-empty
  const fm = body.match(/^---\n([\s\S]*?)\n---/);
  const globs = fm ? [...fm[1].matchAll(/^\s*-\s*["']?([^"'\n]+)["']?\s*$/gm)].map((m) => m[1].trim()) : [];
  if (!fm || !/paths:/.test(fm[1])) {
    // A rule with no paths loads unconditionally; that is legal, but say so
    // out loud rather than letting it happen by a forgotten frontmatter block.
    if (!/loads unconditionally/i.test(body)) {
      problems.push(`${rel}\n    has no 'paths:' frontmatter, so it loads on EVERY session like CLAUDE.md\n    itself. If that is intended, say "loads unconditionally" in the file.`);
    }
  } else if (globs.length === 0) {
    problems.push(`${rel}\n    declares 'paths:' with no patterns under it — it will never load.`);
  } else {
    const dead = globs.filter((g) => !tracked.some((t) => globToRe(g).test(t)));
    if (dead.length === globs.length) {
      problems.push(`${rel}\n    none of its path patterns match any tracked file, so it can never load:\n      ${dead.join('\n      ')}`);
    } else if (dead.length) {
      problems.push(`${rel}\n    path pattern(s) match no tracked file (typo, or the code moved):\n      ${dead.join('\n      ')}`);
    }
  }

  // 4. states its force
  if (!/BINDING|binding/.test(body)) {
    problems.push(`${rel}\n    does not say it is binding. A scoped rule reads as advice unless it says\n    otherwise — state it, so the scoping is not mistaken for optionality.`);
  }
}

// 2. every listed file exists
for (const m of claude.matchAll(/`\.claude\/rules\/([\w.-]+\.md)`/g)) {
  if (!files.includes(m[1])) {
    problems.push(`.claude/rules/${m[1]}\n    listed in CLAUDE.md's rule index but the file does not exist.`);
  }
}

if (problems.length) {
  console.error('\nRule index drift:\n');
  for (const p of problems) console.error(`  ${p}\n`);
  console.error('CLAUDE.md and .claude/rules/ must agree. Fix one or the other.\n');
  process.exit(1);
}

const scoped = files.length;
console.log(`Rules OK (${scoped} scoped rule file(s), all indexed in CLAUDE.md, all globs live)`);
