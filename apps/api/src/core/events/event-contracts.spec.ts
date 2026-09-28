import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  checkContracts,
  extractAccessedFields,
  maskSource,
  parseDomainEventKeys,
  parseHandlers,
  parsePayloadShapes,
} from './contract-analyzer';

const SRC_ROOT = join(__dirname, '..', '..'); // apps/api/src
const DOMAIN_EVENTS_PATH = join(__dirname, 'domain-events.ts');

/** Every `.ts` file under `src` that is not a spec, a `.d.ts`, or generated Prisma output. */
function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'generated' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function loadHandlerFiles(): Array<{ file: string; source: string }> {
  return walkSourceFiles(SRC_ROOT)
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    // `maskSource` before matching, so a file that only MENTIONS
    // "@OnDomainEvent(" in a comment (this analyzer's own header, or
    // `task-event-intake.service.ts`'s doc comment explaining why it does
    // NOT use the decorator) is never mistaken for a real handler file.
    .filter(({ source }) => maskSource(source).includes('@OnDomainEvent('));
}

/**
 * 38-resilience-engineering.md §5, WO-38.5.
 *
 * `check-module-boundaries.mjs` already guarantees module A cannot import
 * module B's internals. It does not guarantee A's domain-event payload
 * shape stays compatible with what B's subscriber destructures — this is
 * the missing half. One table-driven check over every `@OnDomainEvent`
 * handler in the real source tree beats 69 hand-written files (doc 38's
 * own explicit "use your judgment" on this), because the actual assertion
 * is the same for every handler: whatever fields it declares or reads off
 * `payload` must be a subset of the real event's canonical payload —
 * checked once, against the whole tree, on every `pnpm test` run.
 */
describe('Domain event contracts — WO-38.5', () => {
  const domainEventsSource = readFileSync(DOMAIN_EVENTS_PATH, 'utf8');
  const handlerFiles = loadHandlerFiles();

  it('found at least one @OnDomainEvent handler file to check (a suite that silently checks nothing is worse than no suite)', () => {
    expect(handlerFiles.length).toBeGreaterThan(20);
  });

  it('every DomainEvent key has a resolvable canonical payload shape (catalogue completeness, not a per-handler concern)', () => {
    const eventKeys = parseDomainEventKeys(domainEventsSource);
    const { shapes, unresolved } = parsePayloadShapes(domainEventsSource);

    expect(unresolved).toEqual([]);
    for (const key of eventKeys.keys()) {
      expect(shapes.has(key)).toBe(true);
    }
  });

  it('every @OnDomainEvent handler in the real source tree only assumes fields the real payload actually has', () => {
    const result = checkContracts(domainEventsSource, handlerFiles);

    if (result.violations.length > 0) {
      const report = result.violations
        .map((v) => `  ${relative(SRC_ROOT, v.file)} :: ${v.methodName}() — ${v.message}`)
        .join('\n');
      throw new Error(
        `${result.violations.length} domain-event contract violation(s) found:\n${report}\n\n` +
          'A subscriber assumes a field the publisher\'s real payload does not have — either the ' +
          'payload shape in domain-events.ts changed with no matching subscriber update, or the ' +
          'subscriber\'s own declared type has drifted from it. See architecture-patterns/' +
          '131-versioned-domain-events.md for how to change a payload shape safely.',
      );
    }

    // A meaningful number of handlers were actually checked, not zero (a
    // parser bug that silently matches nothing would otherwise report a
    // trivially "passing" suite).
    expect(result.handlerCount).toBeGreaterThan(60);
  });

  it('reports which handler files were scanned but matched no handler (parser-shape visibility, not a failure) — the count should be small relative to files scanned', () => {
    const result = checkContracts(domainEventsSource, handlerFiles);
    // Every file in `handlerFiles` was selected BECAUSE it contains the
    // literal text "@OnDomainEvent(" — a file landing in `skippedFiles`
    // means parseHandlers found that text but could not parse a full
    // handler around it (e.g. a genuinely new signature shape). None do
    // today; a future one should be visible here, not silently absorbed.
    expect(result.skippedFiles).toEqual([]);
  });
});

/**
 * The parsing primitives, proven against small synthetic fixtures — this
 * is what proves the checker actually catches a broken shape (not just
 * that it passes against today's already-consistent tree). Doc 38's own
 * acceptance criterion ("changing a domain event's payload shape with no
 * corresponding subscriber update fails CI") is exercised here permanently,
 * in addition to being proven once, live, against the real tree during
 * this work order's own verification (see the PR/status blockquote).
 */
describe('contract-analyzer — unit fixtures', () => {
  const FIXTURE_EVENTS_SOURCE = `
export const DomainEvent = {
  Widget: 'widget.changed',
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];

export interface WidgetPayload {
  widgetId: string;
  count: number;
}

export interface DomainEventPayloads {
  [DomainEvent.Widget]: WidgetPayload;
}
`;

  it('parses event keys and canonical payload fields from a small fixture', () => {
    const keys = parseDomainEventKeys(FIXTURE_EVENTS_SOURCE);
    expect(keys.get('Widget')).toBe('widget.changed');

    const { shapes, unresolved } = parsePayloadShapes(FIXTURE_EVENTS_SOURCE);
    expect(unresolved).toEqual([]);
    expect(shapes.get('Widget')?.fields).toEqual(new Set(['widgetId', 'count']));
  });

  it('passes a handler whose fields are a real subset of the payload', () => {
    const handlerSource = `
@Injectable()
class WidgetListener {
  @OnDomainEvent(DomainEvent.Widget)
  async onWidgetChanged(payload: WidgetPayload): Promise<void> {
    this.log(payload.widgetId);
  }
}
`;
    const result = checkContracts(FIXTURE_EVENTS_SOURCE, [{ file: 'widget.listener.ts', source: handlerSource }]);
    expect(result.violations).toEqual([]);
    expect(result.handlerCount).toBe(1);
  });

  it('fails a handler that reads a field the real payload does not have — the exact regression this suite exists to catch', () => {
    const handlerSource = `
@Injectable()
class WidgetListener {
  @OnDomainEvent(DomainEvent.Widget)
  async onWidgetChanged(payload: WidgetPayload): Promise<void> {
    this.log(payload.renamedId);
  }
}
`;
    const result = checkContracts(FIXTURE_EVENTS_SOURCE, [{ file: 'widget.listener.ts', source: handlerSource }]);
    expect(result.violations).toEqual([
      {
        file: 'widget.listener.ts',
        methodName: 'onWidgetChanged',
        eventKey: 'Widget',
        message: 'reads "payload.renamedId", but the real DomainEvent.Widget payload has no such field',
      },
    ]);
  });

  it('fails a handler whose own inline payload type declares a field the real payload does not have', () => {
    const handlerSource = `
@Injectable()
class WidgetListener {
  @OnDomainEvent(DomainEvent.Widget)
  async onWidgetChanged(payload: { widgetId: string; extra: string }): Promise<void> {
    this.log(payload.widgetId);
  }
}
`;
    const result = checkContracts(FIXTURE_EVENTS_SOURCE, [{ file: 'widget.listener.ts', source: handlerSource }]);
    expect(result.violations).toEqual([
      {
        file: 'widget.listener.ts',
        methodName: 'onWidgetChanged',
        eventKey: 'Widget',
        message:
          'declares field "extra" on its inline payload type, but the real DomainEvent.Widget payload has no such field',
      },
    ]);
  });

  it('still catches a field access inside a template literal interpolation, same as `posting-rules.subscriber.ts`\'s own sourceRef construction', () => {
    const handlerSource = `
@Injectable()
class WidgetListener {
  @OnDomainEvent(DomainEvent.Widget)
  async onWidgetChanged(payload: WidgetPayload): Promise<void> {
    const sourceRef = \`\${payload.widgetId}:\${payload.missingField}\`;
    this.log(sourceRef);
  }
}
`;
    const result = checkContracts(FIXTURE_EVENTS_SOURCE, [{ file: 'widget.listener.ts', source: handlerSource }]);
    expect(result.violations).toEqual([
      {
        file: 'widget.listener.ts',
        methodName: 'onWidgetChanged',
        eventKey: 'Widget',
        message: 'reads "payload.missingField", but the real DomainEvent.Widget payload has no such field',
      },
    ]);
  });

  it('never mistakes a brace inside a comment or a string for real code structure', () => {
    const handlerSource = `
@Injectable()
class WidgetListener {
  // a comment with a stray brace: {"a": "b"}
  /** another one: { not real code } */
  @OnDomainEvent(DomainEvent.Widget)
  async onWidgetChanged(payload: WidgetPayload): Promise<void> {
    const label = 'also a stray brace: {oops}';
    this.log(payload.widgetId, label);
  }
}
`;
    const result = checkContracts(FIXTURE_EVENTS_SOURCE, [{ file: 'widget.listener.ts', source: handlerSource }]);
    expect(result.violations).toEqual([]);
    expect(result.handlerCount).toBe(1);
  });

  it('maskSource keeps length identical (indices stay valid) while blanking comments and plain strings', () => {
    const source = "const x = 'hello'; // comment\n/* block */ const y = `a${x}b`;";
    const masked = maskSource(source);
    expect(masked.length).toBe(source.length);
    expect(masked).not.toContain('hello');
    expect(masked).not.toContain('comment');
    expect(masked).toContain('${x}'); // interpolation code stays live
  });

  it('extractAccessedFields finds both dotted access and destructuring', () => {
    const fields = extractAccessedFields('const { a, b: renamed, c = 1 } = payload; payload.d;', 'payload');
    expect(fields).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('parseHandlers skips a shape it does not recognize rather than guessing', () => {
    const handlerSource = `
class Weird {
  @OnDomainEvent(DomainEvent.Widget)
  async onWidgetChanged({ widgetId }: WidgetPayload): Promise<void> {
    this.log(widgetId);
  }
}
`;
    // Destructured-parameter handlers are not this codebase's shape (none
    // exist today — see contract-analyzer.ts's own header) and are
    // deliberately skipped rather than mis-parsed.
    expect(parseHandlers('weird.ts', handlerSource)).toEqual([]);
  });
});
