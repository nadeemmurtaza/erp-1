import { CircuitOpenError } from './circuit-breaker';
import { CircuitBreakerService } from './circuit-breaker.service';

function fail(message = 'boom'): Promise<never> {
  return Promise.reject(new Error(message));
}

describe('CircuitBreakerService — WO-38.2', () => {
  let breaker: CircuitBreakerService;

  beforeEach(() => {
    breaker = new CircuitBreakerService();
  });

  it('starts CLOSED and lets calls through', async () => {
    const result = await breaker.execute('test.key', async () => 'ok');
    expect(result).toBe('ok');
    expect(breaker.getSnapshot('test.key').state).toBe('CLOSED');
  });

  it('opens after the configured failure threshold and fails fast without calling fn() again', async () => {
    breaker.configure('test.key', { failureThreshold: 3, cooldownMs: 60_000 });
    const fn = jest.fn(() => fail());

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute('test.key', fn)).rejects.toThrow('boom');
    }
    expect(breaker.getSnapshot('test.key').state).toBe('OPEN');
    expect(fn).toHaveBeenCalledTimes(3);

    // A 4th call must fail fast on CircuitOpenError, never reaching fn().
    await expect(breaker.execute('test.key', fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not open before the threshold is reached', async () => {
    breaker.configure('test.key', { failureThreshold: 5, cooldownMs: 60_000 });
    for (let i = 0; i < 4; i++) {
      await expect(breaker.execute('test.key', () => fail())).rejects.toThrow('boom');
    }
    expect(breaker.getSnapshot('test.key').state).toBe('CLOSED');
  });

  it('a success resets the failure count', async () => {
    breaker.configure('test.key', { failureThreshold: 3, cooldownMs: 60_000 });
    await expect(breaker.execute('test.key', () => fail())).rejects.toThrow();
    await expect(breaker.execute('test.key', () => fail())).rejects.toThrow();
    await breaker.execute('test.key', async () => 'ok');
    expect(breaker.getSnapshot('test.key').failureCount).toBe(0);

    // Two more failures should not open it — the reset above means this is only failure 1 and 2 again.
    await expect(breaker.execute('test.key', () => fail())).rejects.toThrow();
    await expect(breaker.execute('test.key', () => fail())).rejects.toThrow();
    expect(breaker.getSnapshot('test.key').state).toBe('CLOSED');
  });

  it('allows exactly one trial call once the cooldown elapses (HALF_OPEN), and closes on success', async () => {
    jest.useFakeTimers();
    try {
      breaker.configure('test.key', { failureThreshold: 1, cooldownMs: 1_000 });
      await expect(breaker.execute('test.key', () => fail())).rejects.toThrow();
      expect(breaker.getSnapshot('test.key').state).toBe('OPEN');

      // Still within cooldown: fails fast.
      await expect(breaker.execute('test.key', () => fail())).rejects.toBeInstanceOf(CircuitOpenError);

      jest.advanceTimersByTime(1_001);

      // Cooldown elapsed: the next call is a real trial call.
      const trial = jest.fn(async () => 'recovered');
      const result = await breaker.execute('test.key', trial);
      expect(result).toBe('recovered');
      expect(trial).toHaveBeenCalledTimes(1);
      expect(breaker.getSnapshot('test.key').state).toBe('CLOSED');
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-opens immediately if the HALF_OPEN trial call fails', async () => {
    jest.useFakeTimers();
    try {
      breaker.configure('test.key', { failureThreshold: 1, cooldownMs: 1_000 });
      await expect(breaker.execute('test.key', () => fail())).rejects.toThrow();
      jest.advanceTimersByTime(1_001);
      await expect(breaker.execute('test.key', () => fail('still down'))).rejects.toThrow('still down');
      expect(breaker.getSnapshot('test.key').state).toBe('OPEN');
    } finally {
      jest.useRealTimers();
    }
  });

  it('tracks circuits independently by key', async () => {
    breaker.configure('a', { failureThreshold: 1, cooldownMs: 60_000 });
    breaker.configure('b', { failureThreshold: 1, cooldownMs: 60_000 });
    await expect(breaker.execute('a', () => fail())).rejects.toThrow();
    expect(breaker.getSnapshot('a').state).toBe('OPEN');
    expect(breaker.getSnapshot('b').state).toBe('CLOSED');
  });

  describe('simulate() — dry run against a supplied call history', () => {
    it('is a pure function: same input, same output, no mutation of live circuit state', () => {
      const history = [
        { occurredAt: new Date('2026-08-01T00:00:00Z'), succeeded: false },
        { occurredAt: new Date('2026-08-01T00:00:01Z'), succeeded: false },
        { occurredAt: new Date('2026-08-01T00:00:02Z'), succeeded: false },
      ];
      const options = { failureThreshold: 3, cooldownMs: 60_000 };

      const first = breaker.simulate(history, options);
      const second = breaker.simulate(history, options);
      expect(first).toEqual(second);
      // Never touched live state under any key derived from this call.
      expect(breaker.listSnapshots()).toEqual([]);
    });

    it('reports the exact moment a threshold would have tripped', () => {
      const result = breaker.simulate(
        [
          { occurredAt: new Date('2026-08-01T00:00:00Z'), succeeded: false },
          { occurredAt: new Date('2026-08-01T00:00:01Z'), succeeded: false },
          { occurredAt: new Date('2026-08-01T00:00:02Z'), succeeded: false },
        ],
        { failureThreshold: 3, cooldownMs: 60_000 },
      );
      expect(result.wouldHaveTripped).toBe(true);
      expect(result.transitions).toEqual([{ at: '2026-08-01T00:00:02.000Z', action: 'OPEN' }]);
    });

    it('reports no trip for a threshold high enough that ordinary variance never crosses it', () => {
      const result = breaker.simulate(
        [
          { occurredAt: new Date('2026-08-01T00:00:00Z'), succeeded: false },
          { occurredAt: new Date('2026-08-01T00:00:01Z'), succeeded: true },
          { occurredAt: new Date('2026-08-01T00:00:02Z'), succeeded: false },
        ],
        { failureThreshold: 5, cooldownMs: 60_000 },
      );
      expect(result.wouldHaveTripped).toBe(false);
      expect(result.transitions).toEqual([]);
    });
  });
});
