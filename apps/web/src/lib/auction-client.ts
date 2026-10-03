'use client';

import { API_URL, request } from './api-client';
import { customerFetch, getCustomerToken } from './customer-client';
import type { LiveBid, PublicLot, PublicLotSummary, ViewerLotState } from './auction-live';

/**
 * The storefront's calls to the Auction API (launchpad-apps/234-auction-app.md
 * §11). Reading a lot or the list needs no sign-in and goes through the plain
 * `request`; what a viewer is to a lot, a bid and a maximum are a signed-in
 * customer's and go through `customerFetch`, which refreshes an expiring session
 * once and clears a dead one.
 */

export type PublicLotState = 'live' | 'upcoming' | 'ended';

export interface PublicLotPage {
  data: PublicLotSummary[];
  meta: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
  /** The database clock, for correcting the countdowns on the page for a wrong device clock. */
  serverTime: string;
}

export function fetchPublicLots(query: { state: PublicLotState; q?: string; page?: number; pageSize?: number }): Promise<PublicLotPage> {
  return request<PublicLotPage>('/auctions/public/lots', { query, fallbackMessage: 'Could not load the lots' });
}

export function fetchPublicLot(lotId: string): Promise<PublicLot> {
  return request<PublicLot>(`/auctions/public/lots/${encodeURIComponent(lotId)}`, { fallbackMessage: 'Could not load this lot' });
}

/** Where the live stream for a lot is. Public: no token goes with it, and an `EventSource` could not carry one. */
export function lotStreamUrl(lotId: string): string {
  return `${API_URL}/auctions/public/lots/${encodeURIComponent(lotId)}/stream`;
}

/** Whether a customer session exists on this device. A page asks it before it asks the API who the viewer is. */
export function hasCustomerSession(): boolean {
  return getCustomerToken() !== null;
}

export function fetchViewerState(lotId: string): Promise<ViewerLotState> {
  return customerFetch<ViewerLotState>(`/auctions/lots/${encodeURIComponent(lotId)}/me`);
}

export interface AcceptedBid {
  bid: LiveBid & { id: string; lotId: string };
  /** True when this request key had already been accepted and nothing new was written. */
  replayed: boolean;
  /** The system's own bid straight after this one, for someone whose standing maximum outranks it. */
  autoBid: (LiveBid & { id: string; lotId: string }) | null;
  lot: {
    lotId: string;
    currentBidMinor: number | null;
    bidSeq: number;
    minimumNextBidMinor: number;
    endsAt: string;
    leading: boolean;
  };
}

export function placeBid(lotId: string, amountMinor: number, idempotencyKey: string): Promise<AcceptedBid> {
  return customerFetch<AcceptedBid>(`/auctions/lots/${encodeURIComponent(lotId)}/bids`, {
    method: 'POST',
    body: { amountMinor, idempotencyKey },
  });
}

export interface ProxyResult {
  /** The caller's own standing maximum, or null when they have none. */
  maxMinor: number | null;
  /** The bid the system placed for the bidder straight away, if their maximum outranked the standing price. */
  autoBid: (LiveBid & { id: string; lotId: string }) | null;
  lot: AcceptedBid['lot'];
}

export function setProxyBid(lotId: string, maxMinor: number): Promise<ProxyResult> {
  return customerFetch<ProxyResult>(`/auctions/lots/${encodeURIComponent(lotId)}/proxy`, { method: 'PUT', body: { maxMinor } });
}

export function fetchProxyBid(lotId: string): Promise<{ maxMinor: number | null }> {
  return customerFetch<{ maxMinor: number | null }>(`/auctions/lots/${encodeURIComponent(lotId)}/proxy`);
}
