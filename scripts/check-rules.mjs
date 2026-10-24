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

/**
 * Read a file with its line endings normalised to LF.
 *
 * Every pattern below is written against `\n`. A checkout made on Windows with
 * `core.autocrlf=true` hands them `\r\n` instead, so `^---\n` never matches and
 * a `paths:` block that is plainly in the file is reported as missing — all ten
 * rule files at once, with the message telling you to add frontmatter they
 * already have. That is a failure of who checked the repository out, not of
 * what is in it. `.gitattributes` already pins the generated files to LF for
 * this same reason; the rule files are hand-edited, so the checker absorbs the
 * difference instead of constraining how they are stored.
 */
const readText = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

if (!existsSync(RULES_DIR)) {
  console.log('No .claude/rules/ directory — nothing to check.');
  process.exit(0);
}

const problems = [];
const claude = readText(CLAUDE_MD);
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
  const body = readText(join(RULES_DIR, file));

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

  // 4b. balanced code fences.
  //
  // The extraction that created these files found a section's end by scanning
  // for the next heading, and was not fence-aware — the ADR template contains
  // a literal `## Decision` inside a code block, so decisions.md was cut at
  // the opening fence and CLAUDE.md kept the rest as orphaned headings outside
  // any fence. No rule text was lost, but the section was broken in both files
  // and nothing noticed. An odd number of fences is the cheap signal for that
  // whole class of truncation.
  const fences = (body.match(/^```/gm) ?? []).length;
  if (fences % 2 !== 0) {
    problems.push(`${rel}\n    has ${fences} code fences — an odd number means one is unclosed, so the\n    file is truncated or a fenced block leaked out of it.`);
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

/*
 * 5. Skills are well formed, and every design law a rule or a skill cites exists.
 *
 * `.claude/skills/*` are procedures an agent follows (the UX engine: ux-design,
 * ux-audit, ux-review, restyle; and feature-scope, which moved out of CLAUDE.md so it
 * loads only when a named feature is scoped), and `.claude/rules/*` and the skills both cite
 * the numbered laws in `docs/design/` by ID, because an ID is how a finding is
 * made checkable. A law that is renamed or never written leaves a citation that
 * teaches an agent a rule that is not there, and nothing else would notice. So
 * the set of IDs is read from the chapters' own `### XXX-N · Name` headings, the
 * set of prefixes is derived from those (no list to keep in step), and a cited
 * ID that is not among them fails.
 */
const SKILLS_DIR = join(ROOT, '.claude', 'skills');
const skillDirs = existsSync(SKILLS_DIR)
  ? readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  : [];

// A pointer in CLAUDE.md to a skill that does not exist is a method nobody can load.
for (const m of readText(join(ROOT, 'CLAUDE.md')).matchAll(/\.claude\/skills\/([\w-]+)\/SKILL\.md/g)) {
  if (!skillDirs.includes(m[1])) {
    problems.push(`CLAUDE.md\n    points at .claude/skills/${m[1]}/SKILL.md, which does not exist.`);
  }
}

const lawIds = new Set();
for (const rel of tracked.filter((t) => t.startsWith('docs/design/') && t.endsWith('.md'))) {
  for (const m of readText(join(ROOT, rel)).matchAll(/^### ([A-Z]{3}-\d+[a-z]?) · /gm)) lawIds.add(m[1]);
}
const lawPrefixes = [...new Set([...lawIds].map((id) => id.split('-')[0]))];
const lawCitation = lawPrefixes.length > 0 ? new RegExp(`\\b(?:${lawPrefixes.join('|')})-\\d+[a-z]?\\b`, 'g') : null;

const cited = [];
for (const file of files) cited.push({ rel: `.claude/rules/${file}`, text: readText(join(RULES_DIR, file)) });

for (const dir of skillDirs) {
  const rel = `.claude/skills/${dir}/SKILL.md`;
  if (!existsSync(join(ROOT, rel))) {
    problems.push(`.claude/skills/${dir}/\n    has no SKILL.md, so nothing loads it.`);
    continue;
  }
  const text = readText(join(ROOT, rel));
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const name = fm?.[1].match(/^name:\s*(.+?)\s*$/m)?.[1];
  const description = fm?.[1].match(/^description:\s*(.+?)\s*$/m)?.[1];
  if (!fm || name !== dir) {
    problems.push(`${rel}\n    its frontmatter 'name' is ${name ? `"${name}"` : 'missing'}; it must equal the directory, "${dir}".`);
  }
  if (!description) {
    problems.push(`${rel}\n    has no 'description:'. The description is how an agent decides to use the skill.`);
  } else if (description.length > 1024) {
    problems.push(`${rel}\n    its description is ${description.length} characters; 1024 is the most a skill can carry.`);
  }
  if (((text.match(/^```/gm) ?? []).length) % 2 !== 0) {
    problems.push(`${rel}\n    has an odd number of code fences, so it is truncated or a block leaked out of it.`);
  }
  cited.push({ rel, text });
}

let citations = 0;
if (lawCitation) {
  for (const { rel, text } of cited) {
    text.split('\n').forEach((line, index) => {
      for (const id of line.match(lawCitation) ?? []) {
        citations += 1;
        if (!lawIds.has(id)) {
          problems.push(`${rel}:${index + 1}\n    cites ${id}, but docs/design/ has no law with that ID (renamed, or never written).`);
        }
      }
    });
  }
}

if (problems.length) {
  console.error('\nRule index drift:\n');
  for (const p of problems) console.error(`  ${p}\n`);
  console.error('CLAUDE.md and .claude/rules/ must agree. Fix one or the other.\n');
  process.exit(1);
}

const scoped = files.length;
console.log(
  `Rules OK (${scoped} scoped rule file(s), all indexed in CLAUDE.md, all globs live; ` +
    `${skillDirs.length} skill(s) well formed; ${citations} law citation(s), all resolve to one of ${lawIds.size} laws)`,
);
