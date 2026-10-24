# 129 — `NotificationChannel`'s own interface, checked for a channel-specific assumption

A quick, cheap audit: does `NotificationChannel`'s own interface
(`notification-channel.ts`) assume anything true of email/push/SMS but
false of a channel nobody has built yet (a voice call, a future in-app
video prompt, an agent-mediated message)? A hidden assumption here would
mean every future channel implementation has to work around the interface
rather than simply implementing it — exactly the kind of "leaky
abstraction" this repository's own port-and-adapter discipline (doc 115)
exists to prevent.

## What the audit checked, and what it found

```ts
// The interface as it exists today:
export interface NotificationChannel {
  readonly name: string;
  supports(message: NotificationMessage): boolean;
  send(message: NotificationMessage): Promise<void>;
}
```

- **`NotificationMessage`'s own shape** — checked for a field that only
  makes sense for text (a `subject` line, present on email but meaningless
  for SMS/push/a voice call). Doc 33's own `SmsChannel`/`WhatsAppChannel`
  design already handles this correctly: `subject` is optional, and
  `SmsChannel.supports()` returns `true` regardless of whether `subject`
  is set, simply ignoring it — the interface does not force every channel
  to have a subject, it allows one to exist for channels that use it.
  **No fix needed here — the interface already accommodates a
  subject-less channel correctly.**
- **`send()`'s own `Promise<void>` return** — checked for whether a
  future *interactive* channel (a voice call requiring a spoken
  response, a video prompt awaiting a reply) can express "sent, but I'm
  now waiting for a reply" through this shape. **A real gap**: `send()`
  as designed is fire-and-forget — it has no way to express "this
  message expects a response, correlate that response back to this
  specific send." A future voice/video channel needing two-way
  correlation would need to bolt this on outside the interface, exactly
  the "the abstraction leaks" scenario this audit was checking for.

## The one real fix: an optional correlation token, additive, not disruptive

```ts
export interface NotificationChannel {
  readonly name: string;
  supports(message: NotificationMessage): boolean;
  send(message: NotificationMessage): Promise<{ correlationId?: string }>;
}
```

`correlationId` is optional and unused by every existing channel
(`EmailChannel`, `ExpoPushChannel`, `LogChannel`, and doc 33's own
`SmsChannel`/`WhatsAppChannel` all return `{}`) — this is purely additive,
requiring no change to any existing implementation, and gives a future
interactive channel (voice, video, an agent conversation) a place to
report "here's how you'd correlate a reply to this send" without forcing
every simpler channel to implement a concept it doesn't need.

## Scope lenses

Not applicable in full — this is a one-line interface addition, purely
additive and backward-compatible; no new schema, permission, or write
path is introduced. Every existing channel's own scope-lens treatment
(doc 24, 33, 61, 101) is unaffected.

## Work orders

**WO-129.1 — add the optional `correlationId` to `NotificationChannel.send()`'s
return type**, with every existing implementation updated to return `{}`
(a one-line, non-breaking change per implementation).

## Acceptance

- Every existing `NotificationChannel` implementation continues to
  compile and behave identically after the interface change.
- A hypothetical future interactive channel has a documented, typed place
  to report a correlation token, without any existing channel needing to
  implement it.

## Out of scope

Building the interactive channel itself (voice, video, agent-mediated
conversation) — this document only confirms the interface would not need
to be reworked when one is eventually built; the channel itself is
scoped when a real requirement names it.
