/**
 * The static analysis behind `event-contracts.spec.ts` (WO-38.5).
 *
 * `check-module-boundaries.mjs`'s own header says it plainly for that
 * script and it is just as true here: this is character-based scanning,
 * not a type checker. It is deliberately narrow — proving one specific,
 * real gap: a subscriber method's declared payload parameter type is never
 * checked by the compiler against `DomainEventPayloads[K]`, because
 * `@OnDomainEvent` (`on-domain-event.decorator.ts`) is a plain
 * `@nestjs/event-emitter` `@OnEvent` wrapper with no generic binding to the
 * event name it is given. A subscriber that declares its own narrower
 * inline type (`crm/order.subscriber.ts`'s `onStatusChanged(payload: {
 * orderId: string })`) or reads a field that no longer exists on the real
 * payload gets no compiler error today. This module extracts, from the
 * real source tree, (a) each event's canonical field set and (b) each
 * `@OnDomainEvent` handler's own assumed fields — both the ones its
 * declared parameter type names and the ones its body actually reads off
 * the parameter (including inside a template literal's `${...}`
 * interpolation, e.g. `posting-rules.subscriber.ts`'s
 * `` `${payload.billId}:${payload.paidAt}` `` sourceRef) — so
 * `event-contracts.spec.ts` can assert (b) is always a subset of (a).
 */

export interface PayloadShape {
  /** Null when the event's own `DomainEventPayloads` entry could not be resolved (see `PayloadParseResult.unresolved`). */
  fields: Set<string> | null;
}

export interface PayloadParseResult {
  /** Event key (e.g. "OrderPlaced") -> its canonical field set. */
  shapes: Map<string, PayloadShape>;
  /** Event keys whose `DomainEventPayloads` entry names a type this module could not find or parse — a limit of this scanner, not a contract violation. */
  unresolved: string[];
}

export interface HandlerInfo {
  file: string;
  eventKey: string;
  methodName: string;
  /** Null when the parameter type is an inline object literal (fields already captured in `declaredFields`). */
  declaredTypeName: string | null;
  /** Null when the declared type is a named reference. */
  declaredFields: Set<string> | null;
  accessedFields: Set<string>;
}

/**
 * Replaces every comment and every plain string's contents with spaces,
 * keeping length and newlines identical to `source` (so indices still line
 * up for slicing). A template literal's static text is masked the same
 * way, but a `${...}` interpolation's own code is kept verbatim (braces
 * included, so nested interpolation still balances) — real code often
 * reads `payload.x` there, and this scanner must not blind itself to it.
 */
export function maskSource(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];

    if (c === '/' && c2 === '/') {
      while (i < n && source[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }

    if (c === '/' && c2 === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      out += ' ';
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        out += ' ';
        i++;
      }
      continue;
    }

    if (c === '`') {
      out += ' ';
      i++;
      while (i < n && source[i] !== '`') {
        if (source[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          out += '${';
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            out += source[i];
            i++;
          }
          continue;
        }
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        out += ' ';
        i++;
      }
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

/** Finds the index of the matching close for the open bracket at `openIndex` in `masked` (open/close e.g. '{'/'}' or '('/')'), scanning `masked` so a bracket inside a comment or string never miscounts. */
function findMatchingClose(masked: string, openIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i++) {
    if (masked[i] === open) depth++;
    else if (masked[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced "${open}${close}" starting at index ${openIndex}`);
}

/** Extracts top-level field names from an object-literal-shaped type body (already brace-stripped: no leading/trailing `{`/`}`). One field per `;`- or newline-separated declaration — every payload interface in this codebase is flat, with no nested multi-field object type sharing a line. */
function parseFieldNamesFromTypeBody(body: string): Set<string> {
  const fields = new Set<string>();
  const parts = body.split(/;|\n/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\??\s*:/);
    if (match) fields.add(match[1]);
  }
  return fields;
}

/**
 * Parses `export const DomainEvent = { ... } as const;` into key -> string
 * value ("OrderPlaced" -> "order.placed"), in declaration order.
 */
export function parseDomainEventKeys(rawSource: string): Map<string, string> {
  const masked = maskSource(rawSource);
  const startMarker = 'export const DomainEvent = {';
  const start = masked.indexOf(startMarker);
  if (start === -1) throw new Error('Could not find "export const DomainEvent = {" in domain-events.ts');
  const openBrace = start + startMarker.length - 1;
  const close = findMatchingClose(masked, openBrace, '{', '}');
  const body = rawSource.slice(openBrace + 1, close);

  const keys = new Map<string, string>();
  const lineRe = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*'([^']+)'\s*,?\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(body))) {
    keys.set(match[1], match[2]);
  }
  return keys;
}

/** Finds `export interface <name> { ... }` in `rawSource` (matched against its masked form) and returns its top-level field names, or null if not found. */
export function findNamedInterfaceFields(rawSource: string, typeName: string): Set<string> | null {
  const masked = maskSource(rawSource);
  const marker = `export interface ${typeName} {`;
  const start = masked.indexOf(marker);
  if (start === -1) return null;
  const openBrace = start + marker.length - 1;
  const close = findMatchingClose(masked, openBrace, '{', '}');
  return parseFieldNamesFromTypeBody(rawSource.slice(openBrace + 1, close));
}

/**
 * Parses `export interface DomainEventPayloads { [DomainEvent.X]: Type; ... }`
 * — each entry is one line, either a named type reference or an inline
 * object literal (every entry in this codebase today is one or the other,
 * never a computed type like `Pick<...>`/`Omit<...>`/a union).
 */
export function parsePayloadShapes(rawSource: string): PayloadParseResult {
  const masked = maskSource(rawSource);
  const marker = 'export interface DomainEventPayloads {';
  const start = masked.indexOf(marker);
  if (start === -1) throw new Error('Could not find "export interface DomainEventPayloads {" in domain-events.ts');
  const openBrace = start + marker.length - 1;
  const close = findMatchingClose(masked, openBrace, '{', '}');
  const body = rawSource.slice(openBrace + 1, close);

  const shapes = new Map<string, PayloadShape>();
  const unresolved: string[] = [];

  const entryRe = /\[DomainEvent\.([A-Za-z_$][A-Za-z0-9_$]*)\]\s*:\s*(\{[^}]*\}|[A-Za-z_$][A-Za-z0-9_$]*)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(body))) {
    const [, eventKey, typeText] = match;
    if (typeText.trim().startsWith('{')) {
      const inner = typeText.trim().slice(1, -1);
      shapes.set(eventKey, { fields: parseFieldNamesFromTypeBody(inner) });
    } else {
      const fields = findNamedInterfaceFields(rawSource, typeText.trim());
      if (fields) {
        shapes.set(eventKey, { fields });
      } else {
        shapes.set(eventKey, { fields: null });
        unresolved.push(eventKey);
      }
    }
  }

  return { shapes, unresolved };
}

/** Every field a handler body reads off its own payload parameter: `payload.x` (anywhere, including inside a template literal's `${...}`, which `maskSource` keeps live) and `const { a, b } = payload`. */
export function extractAccessedFields(maskedBody: string, paramName: string): Set<string> {
  const fields = new Set<string>();

  const dotRe = new RegExp(`\\b${paramName}\\.([A-Za-z_$][A-Za-z0-9_$]*)`, 'g');
  let match: RegExpExecArray | null;
  while ((match = dotRe.exec(maskedBody))) fields.add(match[1]);

  const destructureRe = new RegExp(`\\{([^}]*)\\}\\s*=\\s*${paramName}\\b`, 'g');
  while ((match = destructureRe.exec(maskedBody))) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().split(':')[0].split('=')[0].trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) fields.add(name);
    }
  }

  return fields;
}

/**
 * Finds every `@OnDomainEvent(DomainEvent.X)`-decorated method in
 * `rawSource` and extracts its event key, its declared parameter type
 * (name or inline fields) and every field its body reads off that
 * parameter.
 *
 * Assumes this codebase's own uniform shape (confirmed by inspection of
 * every current subscriber): exactly one parameter, named `payload`,
 * declared either as a named type or an inline object type — never a
 * destructured parameter pattern. A handler that breaks this shape is
 * skipped (not a false failure) — `checkContracts()`'s own handler count
 * makes a silently-skipped handler visible rather than invisible.
 */
export function parseHandlers(file: string, rawSource: string): HandlerInfo[] {
  const masked = maskSource(rawSource);
  const handlers: HandlerInfo[] = [];
  const decoratorRe = /@OnDomainEvent\(DomainEvent\.([A-Za-z_$][A-Za-z0-9_$]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = decoratorRe.exec(masked))) {
    const eventKey = match[1];
    const afterDecorator = match.index + match[0].length;

    const openParen = masked.indexOf('(', afterDecorator);
    if (openParen === -1) continue;
    const closeParen = findMatchingClose(masked, openParen, '(', ')');
    const paramsText = rawSource.slice(openParen + 1, closeParen).trim();

    const paramMatch = paramsText.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*([\s\S]+)$/);
    if (!paramMatch) continue; // no typed single parameter named X: Y — not this codebase's shape, skip rather than guess
    const [, paramName, typeTextRaw] = paramMatch;

    const bodyOpenBrace = masked.indexOf('{', closeParen);
    if (bodyOpenBrace === -1) continue;
    const bodyClose = findMatchingClose(masked, bodyOpenBrace, '{', '}');
    const maskedBody = masked.slice(bodyOpenBrace + 1, bodyClose);

    const trimmedType = typeTextRaw.trim().replace(/,\s*$/, '');
    const isInline = trimmedType.startsWith('{');
    const declaredFields = isInline ? parseFieldNamesFromTypeBody(trimmedType.slice(1, -1)) : null;
    const declaredTypeName = isInline ? null : trimmedType;

    const methodNameMatch = masked.slice(0, openParen).match(/([A-Za-z_$][A-Za-z0-9_$]*)\s*$/);

    handlers.push({
      file,
      eventKey,
      methodName: methodNameMatch ? methodNameMatch[1] : '(unknown)',
      declaredTypeName,
      declaredFields,
      accessedFields: extractAccessedFields(maskedBody, paramName),
    });
  }

  return handlers;
}

export interface ContractViolation {
  file: string;
  methodName: string;
  eventKey: string;
  message: string;
}

export interface ContractCheckResult {
  handlerCount: number;
  skippedFiles: string[];
  unresolvedEvents: string[];
  violations: ContractViolation[];
}

/**
 * The check itself: every handler's declared inline fields, and every
 * field its body actually reads off `payload`, must be a subset of the
 * real event's canonical field set.
 */
export function checkContracts(
  domainEventsSource: string,
  handlerFiles: Array<{ file: string; source: string }>,
): ContractCheckResult {
  const eventKeys = parseDomainEventKeys(domainEventsSource);
  const { shapes, unresolved } = parsePayloadShapes(domainEventsSource);

  const violations: ContractViolation[] = [];
  const skippedFiles: string[] = [];
  let handlerCount = 0;

  for (const { file, source } of handlerFiles) {
    const handlers = parseHandlers(file, source);
    if (handlers.length === 0) {
      skippedFiles.push(file);
      continue;
    }

    for (const handler of handlers) {
      handlerCount++;

      if (!eventKeys.has(handler.eventKey)) {
        violations.push({
          file,
          methodName: handler.methodName,
          eventKey: handler.eventKey,
          message: `subscribes to DomainEvent.${handler.eventKey}, which does not exist in the catalogue`,
        });
        continue;
      }

      const shape = shapes.get(handler.eventKey);
      if (!shape || !shape.fields) continue; // unresolved canonical shape — reported separately, not a per-handler violation

      const canonical = shape.fields;

      if (handler.declaredFields) {
        for (const field of handler.declaredFields) {
          if (!canonical.has(field)) {
            violations.push({
              file,
              methodName: handler.methodName,
              eventKey: handler.eventKey,
              message: `declares field "${field}" on its inline payload type, but the real DomainEvent.${handler.eventKey} payload has no such field`,
            });
          }
        }
      }

      for (const field of handler.accessedFields) {
        if (!canonical.has(field)) {
          violations.push({
            file,
            methodName: handler.methodName,
            eventKey: handler.eventKey,
            message: `reads "payload.${field}", but the real DomainEvent.${handler.eventKey} payload has no such field`,
          });
        }
      }
    }
  }

  return { handlerCount, skippedFiles, unresolvedEvents: unresolved, violations };
}
