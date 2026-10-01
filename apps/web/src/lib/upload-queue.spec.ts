import {
  EMPTY_UPLOADS,
  ETA_MIN_SAMPLE_MS,
  MAX_CONCURRENT_UPLOADS,
  SPEED_WINDOW_MS,
  activeCount,
  allSucceeded,
  isProcessing,
  outcomeAnnouncement,
  percentOf,
  startable,
  summarize,
  uploadReducer,
  type UploadAction,
  type UploadItem,
  type UploadState,
} from './upload-queue';

const MB = 1024 * 1024;

function run(actions: UploadAction[], from: UploadState = EMPTY_UPLOADS): UploadState {
  return actions.reduce(uploadReducer, from);
}

const entry = (id: string, size = 5 * MB) => ({ id, name: `${id}.png`, size });

/** `count` queued lanes a..e, each 5 MB. */
function queued(count: number): UploadState {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count);
  return run([{ type: 'add', entries: ids.map((id) => entry(id)) }]);
}

function item(state: UploadState, id: string): UploadItem {
  const found = state.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no lane ${id}`);
  return found;
}

const statuses = (state: UploadState) => state.map((candidate) => candidate.status);

describe('add', () => {
  it('adds a lane per file, queued, in order, with nothing sent yet', () => {
    const state = queued(2);
    expect(statuses(state)).toEqual(['queued', 'queued']);
    expect(state.map((s) => s.id)).toEqual(['a', 'b']);
    expect(item(state, 'a')).toMatchObject({
      loaded: 0,
      total: 5 * MB,
      speed: 0,
      eta: null,
      error: null,
      measured: false,
    });
  });

  it('turns a refused file into a rejected lane carrying its sentence, which never starts', () => {
    const state = run([
      {
        type: 'add',
        entries: [entry('a'), { ...entry('b'), refusal: 'b.png is empty. Choose a file that has something in it.' }],
      },
    ]);
    expect(statuses(state)).toEqual(['queued', 'rejected']);
    expect(item(state, 'b').error).toBe('b.png is empty. Choose a file that has something in it.');
    expect(startable(state)).toEqual(['a']);
  });

  it('is a no-op for an empty batch', () => {
    expect(uploadReducer(EMPTY_UPLOADS, { type: 'add', entries: [] })).toBe(EMPTY_UPLOADS);
  });

  it('appends to lanes already there without reordering them', () => {
    const state = run([{ type: 'add', entries: [entry('c')] }], queued(2));
    expect(state.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('concurrency', () => {
  it('never has more than three in flight, and the reason is the number', () => {
    expect(MAX_CONCURRENT_UPLOADS).toBe(3);
    let state = queued(5);
    expect(startable(state)).toEqual(['a', 'b', 'c']);
    state = run(
      ['a', 'b', 'c', 'd'].map((id): UploadAction => ({ type: 'start', id, now: 0 })),
      state,
    );
    expect(statuses(state)).toEqual(['uploading', 'uploading', 'uploading', 'queued', 'queued']);
  });

  it('serves the queue in order as lanes finish', () => {
    let state = run(
      ['a', 'b', 'c'].map((id): UploadAction => ({ type: 'start', id, now: 0 })),
      queued(5),
    );
    expect(startable(state)).toEqual([]);
    state = run([{ type: 'done', id: 'b' }], state);
    expect(startable(state)).toEqual(['d']);
    state = run(
      [
        { type: 'fail', id: 'a', message: 'x' },
        { type: 'done', id: 'c' },
      ],
      state,
    );
    expect(startable(state)).toEqual(['d', 'e']);
  });

  it('starts a lane only from queued', () => {
    const started = run([{ type: 'start', id: 'a', now: 0 }], queued(1));
    expect(uploadReducer(started, { type: 'start', id: 'a', now: 50 })).toBe(started);
  });
});

describe('speed and time left', () => {
  const started = (total = 10 * MB) =>
    run([
      { type: 'add', entries: [entry('a', total)] },
      { type: 'start', id: 'a', now: 0 },
    ]);

  it('measures bytes per second from the samples', () => {
    const state = run([{ type: 'progress', id: 'a', loaded: 1 * MB, total: 10 * MB, now: 500 }], started());
    expect(item(state, 'a').speed).toBeCloseTo(2 * MB, 0);
  });

  it('shows no time left until the samples span a second (UPL-2), then shows it', () => {
    expect(ETA_MIN_SAMPLE_MS).toBe(1000);
    const early = run([{ type: 'progress', id: 'a', loaded: 1 * MB, total: 10 * MB, now: 999 }], started());
    expect(item(early, 'a').speed).toBeGreaterThan(0);
    expect(item(early, 'a').eta).toBeNull();

    const later = run([{ type: 'progress', id: 'a', loaded: 2 * MB, total: 10 * MB, now: 1000 }], started());
    // 2 MB in 1 s: 8 MB left is 4 s.
    expect(item(later, 'a').eta).toBeCloseTo(4, 5);
  });

  it('has no time left at a standstill, however long it has been going', () => {
    const state = run([{ type: 'progress', id: 'a', loaded: 0, total: 10 * MB, now: 1500 }], started());
    expect(item(state, 'a').speed).toBe(0);
    expect(item(state, 'a').eta).toBeNull();
  });

  it('slides the window: only the last 3 000 ms count', () => {
    expect(SPEED_WINDOW_MS).toBe(3000);
    // 1 MB/s for two seconds, then 3 MB/s.
    const state = run(
      [
        { type: 'progress', id: 'a', loaded: 1 * MB, total: 100 * MB, now: 1000 },
        { type: 'progress', id: 'a', loaded: 2 * MB, total: 100 * MB, now: 2000 },
        { type: 'progress', id: 'a', loaded: 5 * MB, total: 100 * MB, now: 3000 },
        { type: 'progress', id: 'a', loaded: 8 * MB, total: 100 * MB, now: 4000 },
        { type: 'progress', id: 'a', loaded: 11 * MB, total: 100 * MB, now: 5000 },
      ],
      started(100 * MB),
    );
    // The window at t=5000 starts at the sample from t=2000 (2 MB): 9 MB over 3 s.
    expect(item(state, 'a').speed).toBeCloseTo(3 * MB, 0);
    expect(item(state, 'a').samples[0]).toEqual({ at: 2000, loaded: 2 * MB });
  });

  it('keeps a sample exactly 3 000 ms old and drops one 3 001 ms old (the boundary)', () => {
    const state = run(
      [
        { type: 'progress', id: 'a', loaded: 1 * MB, total: 100 * MB, now: 1 },
        { type: 'progress', id: 'a', loaded: 2 * MB, total: 100 * MB, now: 3000 },
      ],
      started(100 * MB),
    );
    expect(item(state, 'a').samples[0]).toEqual({ at: 0, loaded: 0 });
    const next = run([{ type: 'progress', id: 'a', loaded: 3 * MB, total: 100 * MB, now: 3001 }], state);
    expect(item(next, 'a').samples[0]).toEqual({ at: 1, loaded: 1 * MB });
  });

  it('lets a quiet link slow to zero on the clock, never frozen at its last burst (UPL-2: they stop together)', () => {
    let state = run([{ type: 'progress', id: 'a', loaded: 2 * MB, total: 10 * MB, now: 1000 }], started());
    const burst = item(state, 'a').speed;
    state = run([{ type: 'tick', now: 2500 }], state);
    expect(item(state, 'a').speed).toBeLessThan(burst);
    expect(item(state, 'a').speed).toBeGreaterThan(0);
    state = run([{ type: 'tick', now: 5000 }], state);
    expect(item(state, 'a')).toMatchObject({ speed: 0, eta: null });
  });

  it('returns the same state on a tick that changes nothing', () => {
    const state = started();
    // Just started: no sample span yet, nothing to repaint.
    expect(uploadReducer(state, { type: 'tick', now: 0 })).toBe(state);
  });

  it('does not tick a lane that is not uploading', () => {
    const state = queued(1);
    expect(uploadReducer(state, { type: 'tick', now: 9000 })).toBe(state);
  });

  it('forgets the old samples when the request starts over (a 401 refresh re-sends the body)', () => {
    let state = run([{ type: 'progress', id: 'a', loaded: 8 * MB, total: 10 * MB, now: 1000 }], started());
    state = run([{ type: 'progress', id: 'a', loaded: 0.1 * MB, total: 10 * MB, now: 1200 }], state);
    expect(item(state, 'a').samples).toEqual([{ at: 1200, loaded: 0.1 * MB }]);
    expect(item(state, 'a').speed).toBe(0);
    expect(item(state, 'a').loaded).toBeCloseTo(0.1 * MB, 0);
  });

  it('holds loaded inside 0..total whatever the browser reports', () => {
    const over = run([{ type: 'progress', id: 'a', loaded: 99 * MB, total: 10 * MB, now: 100 }], started());
    expect(item(over, 'a').loaded).toBe(10 * MB);
    const under = run([{ type: 'progress', id: 'a', loaded: -5, total: 10 * MB, now: 100 }], started());
    expect(item(under, 'a').loaded).toBe(0);
    const nan = run([{ type: 'progress', id: 'a', loaded: Number.NaN, total: 10 * MB, now: 100 }], started());
    expect(item(nan, 'a').loaded).toBe(0);
  });

  it('adopts the browser total (the file plus its form) as the length of the bar', () => {
    const state = run([{ type: 'progress', id: 'a', loaded: 1000, total: 10 * MB + 300, now: 100 }], started());
    expect(item(state, 'a')).toMatchObject({ total: 10 * MB + 300, measured: true, size: 10 * MB });
  });

  it('draws no number and promises no time for a transfer that reports no total (UPL-2, COG-10)', () => {
    const state = run(
      [
        { type: 'progress', id: 'a', loaded: 1 * MB, total: 0, now: 500 },
        { type: 'progress', id: 'a', loaded: 3 * MB, total: 0, now: 2500 },
      ],
      started(),
    );
    expect(item(state, 'a')).toMatchObject({ measured: false, eta: null });
    expect(percentOf(item(state, 'a'))).toBe(0);
  });

  it('ignores a late event from a canceled lane', () => {
    const canceled = run([{ type: 'cancel', id: 'a' }], started());
    expect(uploadReducer(canceled, { type: 'progress', id: 'a', loaded: 5 * MB, total: 10 * MB, now: 900 })).toBe(
      canceled,
    );
  });
});

describe('percentOf and isProcessing', () => {
  const uploading = (loaded: number, total = 1000): UploadItem => ({
    ...item(queued(1), 'a'),
    status: 'uploading',
    measured: true,
    loaded,
    total,
  });

  it('floors, so 99.9% is 99', () => {
    expect(percentOf(uploading(999))).toBe(99);
    expect(percentOf(uploading(425))).toBe(42);
    expect(percentOf(uploading(0))).toBe(0);
  });

  it('holds at 99 while the server has the last byte and has not answered', () => {
    expect(percentOf(uploading(1000))).toBe(99);
    expect(isProcessing(uploading(1000))).toBe(true);
    expect(isProcessing(uploading(999))).toBe(false);
  });

  it('is 100 only once the lane is done', () => {
    const done = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'done', id: 'a' },
      ],
      queued(1),
    );
    expect(percentOf(item(done, 'a'))).toBe(100);
  });
});

describe('failure is per file (UPL-5)', () => {
  it('fails the third of five and leaves the other four to finish untouched', () => {
    const five = run(
      ['a', 'b', 'c'].map((id): UploadAction => ({ type: 'start', id, now: 0 })),
      queued(5),
    );
    const before = Object.fromEntries(five.map((s) => [s.id, s]));
    const failed = run([{ type: 'fail', id: 'c', message: 'The server closed the connection.' }], five);

    expect(item(failed, 'c')).toMatchObject({ status: 'failed', error: 'The server closed the connection.' });
    // The other lanes are the same objects: nothing about them changed.
    for (const id of ['a', 'b', 'd', 'e']) expect(item(failed, id)).toBe(before[id]);

    // The queue moves on past the failure: the next waiting lane starts.
    expect(startable(failed)).toEqual(['d']);
    const finished = run(
      [
        { type: 'start', id: 'd', now: 10 },
        { type: 'done', id: 'a' },
        { type: 'done', id: 'b' },
        { type: 'start', id: 'e', now: 11 },
        { type: 'done', id: 'd' },
        { type: 'done', id: 'e' },
      ],
      failed,
    );
    expect(statuses(finished)).toEqual(['done', 'done', 'failed', 'done', 'done']);
    expect(summarize(finished).text).toBe('4 of 5 · 1 failed');
  });

  it('retries one lane back to queued with everything reset, touching no other lane', () => {
    const state = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'start', id: 'b', now: 0 },
        { type: 'progress', id: 'b', loaded: 3 * MB, total: 5 * MB, now: 1000 },
        { type: 'fail', id: 'b', message: 'Network down' },
      ],
      queued(3),
    );
    const others = [item(state, 'a'), item(state, 'c')];
    const retried = run([{ type: 'retry', id: 'b' }], state);

    expect(item(retried, 'b')).toMatchObject({
      status: 'queued',
      loaded: 0,
      total: 5 * MB,
      measured: false,
      speed: 0,
      eta: null,
      error: null,
      retries: 1,
      samples: [],
    });
    expect(item(retried, 'a')).toBe(others[0]);
    expect(item(retried, 'c')).toBe(others[1]);
  });

  it('retries a canceled lane too, and counts the attempts', () => {
    let state = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'cancel', id: 'a' },
        { type: 'retry', id: 'a' },
      ],
      queued(1),
    );
    expect(item(state, 'a')).toMatchObject({ status: 'queued', retries: 1 });
    state = run(
      [
        { type: 'start', id: 'a', now: 5 },
        { type: 'fail', id: 'a', message: 'x' },
        { type: 'retry', id: 'a' },
      ],
      state,
    );
    expect(item(state, 'a').retries).toBe(2);
  });

  it('has nothing to retry for a refused, finished or waiting lane', () => {
    const refused = run([{ type: 'add', entries: [{ ...entry('r'), refusal: 'no' }] }]);
    expect(uploadReducer(refused, { type: 'retry', id: 'r' })).toBe(refused);
    const done = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'done', id: 'a' },
      ],
      queued(1),
    );
    expect(uploadReducer(done, { type: 'retry', id: 'a' })).toBe(done);
    const waiting = queued(1);
    expect(uploadReducer(waiting, { type: 'retry', id: 'a' })).toBe(waiting);
  });

  it('keeps the failure reason on the lane and clears it on retry', () => {
    const failed = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'fail', id: 'a', message: 'Too big for the server.' },
      ],
      queued(1),
    );
    expect(item(failed, 'a').error).toBe('Too big for the server.');
    expect(item(uploadReducer(failed, { type: 'retry', id: 'a' }), 'a').error).toBeNull();
  });

  it('ignores a failure for a lane that is not uploading', () => {
    const waiting = queued(1);
    expect(uploadReducer(waiting, { type: 'fail', id: 'a', message: 'x' })).toBe(waiting);
    const canceled = run([{ type: 'cancel', id: 'a' }], waiting);
    expect(uploadReducer(canceled, { type: 'fail', id: 'a', message: 'aborted' })).toBe(canceled);
  });

  it('ignores an action for a lane that does not exist', () => {
    const state = queued(2);
    expect(uploadReducer(state, { type: 'fail', id: 'zzz', message: 'x' })).toBe(state);
    expect(uploadReducer(state, { type: 'cancel', id: 'zzz' })).toBe(state);
  });
});

describe('cancel', () => {
  it('cancels a waiting lane and an uploading lane, alone', () => {
    const state = run([{ type: 'start', id: 'a', now: 0 }], queued(3));
    const canceled = run(
      [
        { type: 'cancel', id: 'a' },
        { type: 'cancel', id: 'c' },
      ],
      state,
    );
    expect(statuses(canceled)).toEqual(['canceled', 'queued', 'canceled']);
    expect(item(canceled, 'a')).toMatchObject({ speed: 0, eta: null, error: null });
    expect(startable(canceled)).toEqual(['b']);
  });

  it('cannot cancel what is finished, failed or refused', () => {
    const done = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'done', id: 'a' },
      ],
      queued(1),
    );
    expect(uploadReducer(done, { type: 'cancel', id: 'a' })).toBe(done);
    const failed = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'fail', id: 'a', message: 'x' },
      ],
      queued(1),
    );
    expect(uploadReducer(failed, { type: 'cancel', id: 'a' })).toBe(failed);
  });

  it('records a file that landed in the instant it was canceled as done, because it did land', () => {
    const state = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'cancel', id: 'a' },
        { type: 'done', id: 'a' },
      ],
      queued(1),
    );
    expect(item(state, 'a').status).toBe('done');
  });

  it('does not finish a lane that never started', () => {
    const waiting = queued(1);
    expect(uploadReducer(waiting, { type: 'done', id: 'a' })).toBe(waiting);
  });
});

describe('clear', () => {
  const mixed = () =>
    run(
      [
        { type: 'add', entries: [{ ...entry('r'), refusal: 'refused' }] },
        { type: 'start', id: 'a', now: 0 },
        { type: 'start', id: 'b', now: 0 },
        { type: 'start', id: 'c', now: 0 },
        { type: 'done', id: 'a' },
        { type: 'fail', id: 'b', message: 'x' },
      ],
      queued(4),
    );

  it('clears only the finished lanes with "done"', () => {
    expect(mixed().map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'r']);
    expect(run([{ type: 'clear', scope: 'done' }], mixed()).map((s) => s.id)).toEqual(['b', 'c', 'd', 'r']);
  });

  it('clears everything that has stopped with "settled", and never a lane still going', () => {
    expect(run([{ type: 'clear', scope: 'settled' }], mixed()).map((s) => s.id)).toEqual(['c', 'd']);
  });

  it('returns the same state when there is nothing to clear', () => {
    const state = queued(2);
    expect(uploadReducer(state, { type: 'clear', scope: 'settled' })).toBe(state);
  });
});

describe('summarize', () => {
  const lanes = (...order: Array<'done' | 'failed' | 'canceled' | 'uploading' | 'queued' | 'rejected'>): UploadState =>
    order.map((status, index): UploadItem => ({
      ...item(queued(1), 'a'),
      id: `i${index}`,
      name: `i${index}.png`,
      status,
    }));

  it('says nothing for an empty queue', () => {
    expect(summarize(EMPTY_UPLOADS)).toMatchObject({ text: '', tone: 'neutral', total: 0 });
  });

  it('says "Uploading 3 files" while nothing has landed and nothing has gone wrong', () => {
    expect(summarize(lanes('uploading', 'uploading', 'queued')).text).toBe('Uploading 3 files');
    expect(summarize(lanes('uploading')).text).toBe('Uploading 1 file');
  });

  it('says "2 of 5 · 1 failed" in numbers, as the others are still going', () => {
    const summary = summarize(lanes('done', 'done', 'failed', 'uploading', 'queued'));
    expect(summary.text).toBe('2 of 5 · 1 failed');
    expect(summary.tone).toBe('negative');
    expect(summary.active).toBe(2);
  });

  it('switches to the fraction once something has landed, with no problem to list', () => {
    expect(summarize(lanes('done', 'uploading', 'queued')).text).toBe('1 of 3');
    expect(summarize(lanes('done', 'uploading', 'queued')).tone).toBe('neutral');
  });

  it('says "5 uploaded", positively, when every lane landed', () => {
    const summary = summarize(lanes('done', 'done', 'done', 'done', 'done'));
    expect(summary).toMatchObject({ text: '5 uploaded', tone: 'positive' });
    expect(summarize(lanes('done')).text).toBe('1 uploaded');
  });

  it('lists failed, canceled and refused in that order', () => {
    expect(summarize(lanes('done', 'failed', 'canceled', 'rejected')).text).toBe(
      '1 of 4 · 1 failed · 1 canceled · 1 refused',
    );
  });

  it('keeps a lane that failed on a finished batch negative, and a canceled-only one neutral', () => {
    expect(summarize(lanes('failed', 'failed')).text).toBe('0 of 2 · 2 failed');
    expect(summarize(lanes('canceled', 'canceled'))).toMatchObject({ text: '0 of 2 · 2 canceled', tone: 'neutral' });
    expect(summarize(lanes('rejected'))).toMatchObject({ text: '0 of 1 · 1 refused', tone: 'negative' });
  });
});

describe('outcomeAnnouncement', () => {
  const settled = (...order: Array<'done' | 'failed' | 'canceled' | 'rejected'>): UploadState =>
    order.map((status, index): UploadItem => ({ ...item(queued(1), 'a'), id: `i${index}`, status }));

  it('is silent while anything is waiting or going, so a percentage is never spoken', () => {
    const going = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'progress', id: 'a', loaded: 1 * MB, total: 5 * MB, now: 500 },
      ],
      queued(2),
    );
    expect(outcomeAnnouncement(going)).toBe('');
    expect(outcomeAnnouncement(EMPTY_UPLOADS)).toBe('');
  });

  it('announces all done once', () => {
    expect(outcomeAnnouncement(settled('done', 'done', 'done'))).toBe('All 3 uploads finished.');
    expect(outcomeAnnouncement(settled('done'))).toBe('Upload finished.');
  });

  it('announces what failed in numbers', () => {
    expect(outcomeAnnouncement(settled('done', 'done', 'failed', 'done', 'done'))).toBe(
      'Uploads finished: 4 of 5 uploaded, 1 failed.',
    );
    expect(outcomeAnnouncement(settled('failed', 'canceled', 'rejected'))).toBe(
      'Uploads finished: 0 of 3 uploaded, 1 failed, 1 canceled, 1 refused.',
    );
  });
});

describe('allSucceeded, activeCount and hasActive', () => {
  it('is true only when every lane is done, and never for an empty queue', () => {
    expect(allSucceeded(EMPTY_UPLOADS)).toBe(false);
    const done = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'done', id: 'a' },
      ],
      queued(1),
    );
    expect(allSucceeded(done)).toBe(true);
    const mixed = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'done', id: 'a' },
      ],
      queued(2),
    );
    expect(allSucceeded(mixed)).toBe(false);
  });

  it('counts the lanes holding a place: waiting or in flight', () => {
    const state = run(
      [
        { type: 'start', id: 'a', now: 0 },
        { type: 'start', id: 'b', now: 0 },
        { type: 'fail', id: 'b', message: 'x' },
      ],
      queued(3),
    );
    expect(activeCount(state)).toBe(2);
  });
});
