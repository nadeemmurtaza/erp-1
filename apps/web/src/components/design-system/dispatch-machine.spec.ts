import {
  FAILURE_COPY,
  INITIAL_DISPATCH,
  UNDO_WINDOW_MS,
  dispatchBadge,
  dispatchReducer,
  idempotencyKey,
  type DispatchEvent,
  type DispatchState,
} from './dispatch-machine';

const run = (events: DispatchEvent[], from: DispatchState = INITIAL_DISPATCH) => events.reduce(dispatchReducer, from);

describe('dispatchReducer: the forward path', () => {
  it('accepts a send into the undo window, before anything has left', () => {
    expect(run([{ type: 'send' }])).toEqual({ phase: 'undoable', intent: 1 });
  });

  it('hands the job over when the window closes, then records the delivery', () => {
    expect(run([{ type: 'send' }, { type: 'window-elapsed' }])).toEqual({ phase: 'inflight', intent: 1, attempt: 1 });
    expect(run([{ type: 'send' }, { type: 'window-elapsed' }, { type: 'delivered' }])).toEqual({
      phase: 'sent',
      intent: 1,
      attempt: 1,
    });
  });

  it('keeps the undo window a whole, positive number of milliseconds', () => {
    expect(Number.isInteger(UNDO_WINDOW_MS)).toBe(true);
    expect(UNDO_WINDOW_MS).toBe(5000);
  });
});

describe('dispatchReducer: undo', () => {
  it('cancels inside the window and returns to draft', () => {
    expect(run([{ type: 'send' }, { type: 'undo' }])).toEqual({ phase: 'draft', lastIntent: 1 });
  });

  it('is refused once the mail service has the job', () => {
    const inflight = run([{ type: 'send' }, { type: 'window-elapsed' }]);
    expect(dispatchReducer(inflight, { type: 'undo' })).toBe(inflight);
  });

  it('spends the cancelled intent, so sending again is a new request with a new key', () => {
    const first = run([{ type: 'send' }]);
    const again = run([{ type: 'send' }, { type: 'undo' }, { type: 'send' }]);
    expect(idempotencyKey('inv-1', first)).toBe('inv-1:send:1');
    expect(idempotencyKey('inv-1', again)).toBe('inv-1:send:2');
  });
});

describe('dispatchReducer: failure and its remedies', () => {
  const failed = (kind: 'bounced' | 'unavailable') =>
    run([{ type: 'send' }, { type: 'window-elapsed' }, { type: 'rejected', kind }]);

  it('lands in failed with the reason, never silently back in draft', () => {
    expect(failed('bounced')).toEqual({ phase: 'failed', intent: 1, attempt: 1, kind: 'bounced' });
  });

  it('retries an outage with the same intent, so the key does not change', () => {
    const before = failed('unavailable');
    const after = dispatchReducer(before, { type: 'retry' });
    expect(after).toEqual({ phase: 'inflight', intent: 1, attempt: 2 });
    expect(idempotencyKey('inv-1', after)).toBe(idempotencyKey('inv-1', before));
  });

  it('refuses to retry a bounce as it stands, because it would bounce again', () => {
    const bounced = failed('bounced');
    expect(dispatchReducer(bounced, { type: 'retry' })).toBe(bounced);
  });

  it('returns to draft on edit, with the failed intent spent', () => {
    expect(dispatchReducer(failed('bounced'), { type: 'edit' })).toEqual({ phase: 'draft', lastIntent: 1 });
  });

  it('can fail again after a retry and keeps counting attempts', () => {
    const second = run(
      [{ type: 'retry' }, { type: 'rejected', kind: 'unavailable' }, { type: 'retry' }],
      failed('unavailable'),
    );
    expect(second).toEqual({ phase: 'inflight', intent: 1, attempt: 3 });
  });
});

describe('dispatchReducer: the second copy of every event', () => {
  it('ignores a double click on Send', () => {
    const sending = run([{ type: 'send' }]);
    expect(dispatchReducer(sending, { type: 'send' })).toBe(sending);
  });

  it('ignores a late timer or a late webhook in the wrong state', () => {
    expect(dispatchReducer(INITIAL_DISPATCH, { type: 'window-elapsed' })).toBe(INITIAL_DISPATCH);
    expect(dispatchReducer(INITIAL_DISPATCH, { type: 'delivered' })).toBe(INITIAL_DISPATCH);
    expect(dispatchReducer(INITIAL_DISPATCH, { type: 'rejected', kind: 'bounced' })).toBe(INITIAL_DISPATCH);
    const undoable = run([{ type: 'send' }]);
    expect(dispatchReducer(undoable, { type: 'delivered' })).toBe(undoable);
  });

  it('treats sent as final: a second delivery or a new send changes nothing', () => {
    const sent = run([{ type: 'send' }, { type: 'window-elapsed' }, { type: 'delivered' }]);
    for (const event of [
      { type: 'send' },
      { type: 'delivered' },
      { type: 'undo' },
      { type: 'retry' },
    ] as DispatchEvent[]) {
      expect(dispatchReducer(sent, event)).toBe(sent);
    }
  });
});

describe('idempotencyKey', () => {
  it('has no key before anything is sent', () => {
    expect(idempotencyKey('inv-1', INITIAL_DISPATCH)).toBeNull();
  });

  it('differs between invoices that share an intent number', () => {
    const sending = run([{ type: 'send' }]);
    expect(idempotencyKey('inv-1', sending)).not.toBe(idempotencyKey('inv-2', sending));
  });
});

describe('what the screen may say', () => {
  it('gives every phase a word, and Sending only while the job has not been taken', () => {
    expect(dispatchBadge(INITIAL_DISPATCH).label).toBe('Draft');
    expect(dispatchBadge(run([{ type: 'send' }])).label).toBe('Sending');
    expect(dispatchBadge(run([{ type: 'send' }, { type: 'window-elapsed' }])).label).toBe('Sending');
    expect(dispatchBadge(run([{ type: 'send' }, { type: 'window-elapsed' }, { type: 'delivered' }])).label).toBe(
      'Sent',
    );
  });

  it('never claims "Delivered" or "Dispatched", which nothing here can know', () => {
    const labels = (['draft', 'undoable', 'inflight', 'sent', 'failed'] as const).map((phase) => {
      const state: DispatchState =
        phase === 'draft'
          ? INITIAL_DISPATCH
          : phase === 'undoable'
            ? { phase, intent: 1 }
            : phase === 'failed'
              ? { phase, intent: 1, attempt: 1, kind: 'bounced' }
              : { phase, intent: 1, attempt: 1 };
      return dispatchBadge(state).label;
    });
    expect(labels.join(' ')).not.toMatch(/deliver|dispatch/i);
  });

  it('writes a failure as what happened, why, and the next step, and the action matches the cause', () => {
    for (const copy of Object.values(FAILURE_COPY)) {
      expect(copy.what.length).toBeGreaterThan(0);
      expect(copy.why.length).toBeGreaterThan(0);
      expect(copy.next).not.toMatch(/later|something went wrong/i);
    }
    expect(FAILURE_COPY.bounced.action).toBe('edit');
    expect(FAILURE_COPY.unavailable.action).toBe('retry');
  });
});
