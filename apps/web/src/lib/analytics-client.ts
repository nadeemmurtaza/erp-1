import { API_URL } from './api';
import { STORAGE_KEYS } from '@/constants/storage';

/**
 * First-party, anonymous analytics beacon.
 *
 * `sessionId` is a random opaque string kept in localStorage — never tied to
 * a customer account, email, or phone number, and never joined to one
 * anywhere in this module. Every call here is fire-and-forget: nothing is
 * ever awaited by a caller, and no failure here is allowed to throw into, or
 * reject a promise the caller observes — a tracking outage must never touch
 * the shopping experience it is watching.
 */

const SESSION_KEY = STORAGE_KEYS.analytics.session;

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for runtimes without crypto.randomUUID. Not cryptographically
  // strong, but this only needs to be an opaque bucket key, not a secret.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** Reads (or mints and persists) this browser's opaque analytics session id. */
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';

  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Storage disabled (private browsing, quota, etc.) — fall back to a
    // per-call id rather than letting analytics break the page.
    return randomId();
  }
}

export type TrackedEventType = 'page_view' | 'add_to_cart' | 'checkout_started';

interface TrackEventInput {
  path?: string;
  referrer?: string;
  utmSource?: string;
  meta?: Record<string, unknown>;
}

/**
 * Fires one tracking event. Never awaited by callers, never throws, never
 * rejects visibly — every failure mode (no window, storage disabled, network
 * error, endpoint down) is swallowed here.
 */
export function trackEvent(type: TrackedEventType, extra: TrackEventInput = {}): void {
  try {
    if (typeof window === 'undefined') return;

    const sessionId = getSessionId();
    if (!sessionId) return;

    const body = JSON.stringify({ type, sessionId, ...extra });
    const url = `${API_URL}/track/event`;

    // sendBeacon is the right fit for a fire-and-forget call that must
    // survive the page unloading (e.g. right after checkout_started, as the
    // customer submits the order form) — the browser guarantees delivery
    // without keeping the page alive for it.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (sent) return;
    }

    // Fallback where sendBeacon is unavailable or declined the payload:
    // fetch with keepalive so the request can still complete past unload.
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Swallowed — see module doc: a tracking failure must never surface.
    });
  } catch {
    // Swallowed — see module doc: a tracking failure must never surface.
  }
}
