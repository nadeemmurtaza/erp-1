# 08 · Governance

Who may add to this system, how a thing gets named, and how something leaves
without breaking the screens that still use it.

Status: **partly enforced.** The rule layer under `.claude/rules/` has a real
drift guard — `node scripts/check-rules.mjs`, run by `pnpm lint` — so a rule
cannot silently disappear. Nothing yet enforces the naming or deprecation
conventions below; they are review's job until a script exists.

## Why a design system needs governance at all

Without it, a design system becomes a museum: a page of components nobody
adds to, beside an application full of one-off markup that does the same job.
That is not a hypothetical here. The primitives in `apps/web/src/components/ui`
are real and used; the patterns and templates above them are precedent only,
because there was never a stated way to promote one. This chapter is that way.

## Naming

One concept, one name, everywhere — the terminology table in
[06 · Content](06-content.md) governs the words a user reads, and this
governs the words a developer types. When they can be the same word, they are.

| Thing | Convention | Example |
|---|---|---|
| Primitive component | `PascalCase`, the noun alone | `DataTable`, `EmptyState` |
| Component with a job | `PascalCase`, noun qualified by its job | `StatusBadge`, `RangePicker` |
| File | `kebab-case.tsx`, matching the export | `status-badge.tsx` |
| Prop that toggles | positive `boolean`, no `no`/`disable` prefix | `dismissible`, not `noDismiss` |
| Prop that varies appearance | `variant` | `variant="destructive"` |
| Prop that varies scale | `size` | `size="sm"` |
| Token | `group.role.step`, never a literal value | `space.4`, not `space.16px` |
| CSS class we own | Tailwind utilities first; a named class only for a repeated composition | |

**A name states what a thing is, never what it looks like.** `PrimaryButton`
survives a rebrand; `BlueButton` does not — and Law 1 already forbids the
literal that name implies.

## What belongs in the system, and what does not

A thing is promoted up the ladder in [03 · Components](03-components.md)
when it passes **the rule of three**: the same solution has been written three
times, in three places, by intent rather than by copy-paste accident. Two is
a coincidence; three is a pattern.

Promotion is not automatic. Before adding a rung, answer the question
`CLAUDE.md` already asks of every abstraction — *what real boundary justifies
its existence?* A component that wraps one other component and renames two
props is not a boundary.

**What never enters the system:**

- anything brand-specific — that is `packages/shared/src/brand.ts`, Law 1;
- anything sector-specific — that is a module pack, not a component;
- a component with more than one job — Law 5 applies to components too;
- a speculative variant nobody has asked for — `CLAUDE.md`'s
  *No speculative functionality* is not suspended inside `components/ui`.

## Contribution

Changing the design system is a change to every screen that uses it, so it
follows the same operating sequence as any other change here
(*Understand → Inspect → Plan → Document → Implement → Verify → Review →
Report*), with three additions specific to shared UI:

1. **Check every consumer first.** `pnpm idx sym <Component>` and
   `docs/index/cross/components.md` say who imports it. `CLAUDE.md` forbids
   modifying a shared component without checking every consumer — this is
   how you check.
2. **Document before you implement** when the change alters a contract:
   a prop's meaning, a default, a state's behaviour, a token's value. The
   chapter is the document of record; update it in the same commit.
3. **A token change is an architectural change.** Adding a token group
   (spacing, size, shadow, z-index, motion — all still unbuilt, see
   [01 · Foundations](01-foundations.md)) gets an entry in
   `docs/implementation/DECISIONS.md` under the protocol in
   `.claude/rules/decisions.md`. Changing an existing token's *value* does
   not; changing what the token *means* does.

## Versioning

The design system is not published, so it has no semantic version of its own.
It versions by commit, alongside the code it governs, and that is deliberate:
a token file and the components reading it can never be one release apart.

What it does have is a **contract boundary**. Inside
`apps/web/src/components/ui` and `packages/shared`, a change is one of:

| Change | Requires |
|---|---|
| Additive — a new prop with a default, a new variant | nothing beyond the normal gates |
| Behavioural — a default changes, a state renders differently | every consumer checked, chapter updated |
| Breaking — a prop removed or renamed, a component removed | the deprecation path below, never a direct removal |

## Deprecation

Nothing shared is deleted in the commit that stops using it. The sequence:

1. **Mark it.** A `@deprecated` JSDoc tag on the export naming the
   replacement and the reason. This is the machine-visible part — an editor
   strikes it through, so the next person does not reach for it.
2. **Migrate every consumer.** Found the same way as above. The index page
   is the checklist.
3. **Remove it**, in its own commit, with a diff that touches only the
   removal. A removal mixed into a feature commit cannot be reverted alone.

A deprecated thing that has sat marked and unmigrated for a long time is not
governance, it is debt with a label. If migration is not going to happen,
un-deprecate it and say why — the tag must mean something.

**Two exceptions that are not deprecations:** a rule moving between
`CLAUDE.md` and `.claude/rules/` is a relocation, guarded by
`check-rules.mjs`, and loses nothing; a page under `docs/index/` disappearing
is generator output, not a decision.

## Change approval

Proportional to blast radius, not to diff size:

| Scope of change | Decided by |
|---|---|
| One page's own markup | the author |
| A component used in one area | the author, consumers checked |
| A primitive, or anything in `packages/shared` | reviewed by someone who did not write it |
| A token group, or a rule added to `.claude/rules/` | recorded in `DECISIONS.md` |
| Anything that appears to contradict one of the seven laws | it does not get approved; the change is wrong, or the law is being amended deliberately and separately |

## Keeping this system honest

The failure mode of a design system is drift between what it claims and what
the code does — the reason every chapter here opens with a measured status
line rather than an aspiration. Two mechanisms hold that:

- `docs/index/cross/design-system.md` is **generated** from the code by
  `scripts/build-index.mjs`. It counts primitives, tokens, motion usage,
  `aria-*` attributes and `prefers-reduced-motion` blocks. When a figure in a
  chapter disagrees with that page, the chapter is stale — fix the chapter.
- `node scripts/check-rules.mjs` fails the build if a rule file exists that
  `CLAUDE.md`'s rule index does not list, or a listed file that does not
  exist. The design system's own binding subset cannot go missing unnoticed.

Neither checks prose. A chapter that quietly becomes untrue is caught by a
person, which is why the status lines are specific enough to falsify.
