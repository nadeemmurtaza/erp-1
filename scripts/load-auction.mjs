#!/usr/bin/env node
/**
 * The hot-lot load test of launchpad-apps/234-auction-app.md §6 and §16.11:
 * "50 accepted bids/second on one lot with p95 < 300 ms".
 *
 * It drives a RUNNING api (and the database and Redis behind it), as a client
 * would, from its own process, so the generator does not share a event loop
 * with the server it measures:
 *
 *   1. an admin makes one auction with one lot and opens it, with a gentle bid
 *      rule (0.1% steps) so a thousand bids stay far below the price ceiling;
 *   2. `--bidders` customers register, so no bidder is over its own rate limit;
 *   3. `--watchers` anonymous clients open the lot's live stream;
 *   4. for `--seconds`, bids go out at `--rate` a second on a fixed schedule
 *      (open loop: a slow answer does not slow the next bid down), each from
 *      the next bidder in turn, each a little above the highest price seen;
 *   5. it reports what was accepted, the latency of a bid, and the delay
 *      between a bid being accepted and each watcher being told, then asks the
 *      admin API whether the lot's hash chain still verifies.
 *
 * It needs the api run with `NODE_ENV=test`, which switches off the per-address
 * request throttle (a single address would otherwise be held to 60 bids a
 * minute, as it should be) and nothing else. It also needs `DATABASE_URL`, to
 * open the auction and set its bid rule the way the e2e specs do, and to run on
 * the SAME HOST as the api and the database: the fan-out delay is measured
 * between the database's clock and this process's, which is only a delay when
 * they are one clock.
 *
 *   NODE_ENV=test node apps/api/dist/main.js            # in one shell
 *   LOAD_ADMIN_IDENTIFIER=… LOAD_ADMIN_PASSWORD=… DATABASE_URL=… \
 *     node scripts/load-auction.mjs --seconds=20 --rate=50 --bidders=200 --watchers=200
 *
 * Exit status is 1 when the accepted rate is under 90% of `--rate`, the fan-out
 * p95 is over `--target-p95-ms`, a bid took a server error, the chain does not
 * verify, or the lot's count of bids is not the number accepted.
 *
 * It creates test records (an auction titled "[load test] …", its lot, its
 * bids and `--bidders` customers) and leaves them in place, closed: nothing is
 * deleted (CLAUDE.md, "No deletion of any kind"). Run it against a development
 * database.
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);
const API = (args.api ?? process.env.API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const SECONDS = Number(args.seconds ?? 20);
const RATE = Number(args.rate ?? 50);
const BIDDERS = Number(args.bidders ?? 200);
const WATCHERS = Number(args.watchers ?? 200);
const TARGET_P95_MS = Number(args['target-p95-ms'] ?? 300);
/**
 * How far above the highest price already seen or offered each bid goes. A bid is
 * built from what the generator has OFFERED, not only from what it has had
 * answered: otherwise every bid sent in the round trip after an accepted one
 * would offer the same stale price and be refused, and the accepted rate would
 * measure the generator's round trip (about one bid per round trip) rather than
 * the server. 0.3% is three of the 0.1% steps this lot's rule allows.
 */
const MARGIN = 1.003;
const START_PRICE_MINOR = 1_000_000;
/** Every offer is 0.3% above the last, so the price grows 0.3% a bid: 6 000 bids is a factor of about 6.5 × 10^7, far inside the 10^15 ceiling; more is refused up front. */
const MAX_BIDS = 6_000;

const adminIdentifier = process.env.LOAD_ADMIN_IDENTIFIER;
const adminPassword = process.env.LOAD_ADMIN_PASSWORD;
if (!adminIdentifier || !adminPassword || !process.env.DATABASE_URL) {
  console.error('Set LOAD_ADMIN_IDENTIFIER, LOAD_ADMIN_PASSWORD and DATABASE_URL. See the header of this file.');
  process.exit(2);
}

const { PrismaClient } = require('../apps/api/src/generated/prisma');
const prisma = new PrismaClient();

async function call(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: leave it null.
  }
  return { status: response.status, json };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function summarise(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

/** Runs `work(item)` over `items`, `limit` at a time. */
async function pool(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index], index);
      }
    }),
  );
  return results;
}

/** One anonymous watcher on the lot's stream: every `lot` event with the time this process saw it. */
function watch(lotId) {
  const seen = [];
  let open = false;
  const request = http.get(`${API}/auctions/public/lots/${lotId}/stream`, { headers: { Accept: 'text/event-stream' }, agent: false }, (response) => {
    open = response.statusCode === 200;
    response.setEncoding('utf8');
    let buffer = '';
    response.on('data', (chunk) => {
      const at = Date.now();
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame.split('\n').find((line) => line.startsWith('data: '));
        if (frame.includes('event: lot') && data) seen.push({ bidSeq: JSON.parse(data.slice(6)).bidSeq, at });
      }
    });
  });
  request.on('error', () => undefined);
  return { seen, isOpen: () => open, close: () => request.destroy() };
}

/** The first event at or past `seq`, by binary search: events arrive in order of bidSeq. */
function firstAtOrPast(seen, seq) {
  let low = 0;
  let high = seen.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (seen[mid].bidSeq >= seq) {
      found = mid;
      high = mid - 1;
    } else low = mid + 1;
  }
  return found === -1 ? null : seen[found];
}

async function main() {
  console.log(`Target: ${RATE} bids/s for ${SECONDS} s on one lot, ${BIDDERS} bidders, ${WATCHERS} watchers, against ${API}`);

  const login = await call('/auth/login', { method: 'POST', body: { identifier: adminIdentifier, password: adminPassword } });
  if (login.status !== 201 && login.status !== 200) throw new Error(`admin login failed: ${login.status}`);
  const admin = login.json.accessToken;

  const hour = 3_600_000;
  const auction = (
    await call('/admin/auctions', {
      method: 'POST',
      token: admin,
      body: { title: `[load test] ${new Date().toISOString()}`, startsAt: new Date(Date.now() + 24 * hour).toISOString(), endsAt: new Date(Date.now() + 48 * hour).toISOString() },
    })
  ).json;
  const lot = (await call(`/admin/auctions/${auction.id}/lots`, { method: 'POST', token: admin, body: { title: 'Load-test lot', startPriceMinor: START_PRICE_MINOR } })).json;
  await call(`/admin/auctions/${auction.id}/schedule`, { method: 'POST', token: admin });
  await prisma.auction.update({
    where: { id: auction.id },
    data: {
      status: 'OPEN',
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + hour),
      bidRules: { incrementBps: 10, minStepMinor: 1, antiSnipeWindowMs: 120_000, antiSnipeExtendMs: 120_000, maxExtensionMs: 1_800_000 },
    },
  });
  await prisma.auctionLot.update({ where: { id: lot.id }, data: { status: 'OPEN' } });

  process.stdout.write(`Registering ${BIDDERS} bidders… `);
  const stamp = Date.now();
  const bidders = (
    await pool(Array.from({ length: BIDDERS }, (_, i) => i), 8, async (i) => {
      const result = await call('/auth/register', {
        method: 'POST',
        body: { email: `load-${stamp}-${i}@example.com`, password: `Load-test-${stamp}-pw`, firstName: 'Load', lastName: `Bidder ${i}` },
      });
      return result.json?.accessToken ?? null;
    })
  ).filter(Boolean);
  console.log(`${bidders.length} ready`);
  if (bidders.length < BIDDERS * 0.9) throw new Error('could not register enough bidders; is the api running with NODE_ENV=test?');

  const watchers = Array.from({ length: WATCHERS }, () => watch(lot.id));
  await sleep(1_500);
  const connected = watchers.filter((w) => w.isOpen()).length;
  console.log(`${connected} of ${WATCHERS} watchers connected`);

  // The run: an open-loop schedule of bids.
  const total = Math.round(SECONDS * RATE);
  if (total > MAX_BIDS) throw new Error(`--seconds × --rate is ${total} bids; the price would outgrow the ceiling above ${MAX_BIDS}`);
  const interval = 1_000 / RATE;
  let highestKnown = START_PRICE_MINOR;
  let lastOffered = 0;
  const outcomes = { accepted: 0, tooLow: 0, leading: 0, rateLimited: 0, closed: 0, serverError: 0, other: 0 };
  const latencies = [];
  const accepted = []; // { seq, acceptedAtMs }
  const inFlight = [];
  const startedAt = Date.now();

  for (let i = 0; i < total; i++) {
    const wait = startedAt + i * interval - Date.now();
    if (wait > 0) await sleep(wait);
    const token = bidders[i % bidders.length];
    const amountMinor = i === 0 ? START_PRICE_MINOR : Math.ceil(Math.max(highestKnown, lastOffered) * MARGIN);
    lastOffered = amountMinor;
    const sent = Date.now();
    inFlight.push(
      call(`/auctions/lots/${lot.id}/bids`, { method: 'POST', token, body: { amountMinor, idempotencyKey: `load-${stamp}-${i}` } }).then(({ status, json }) => {
        latencies.push(Date.now() - sent);
        if (status === 201 || status === 200) {
          outcomes.accepted += 1;
          highestKnown = Math.max(highestKnown, json.lot.currentBidMinor ?? 0);
          accepted.push({ seq: json.bid.seq, acceptedAtMs: Date.parse(json.bid.acceptedAt) });
        } else if (json?.code === 'BID_TOO_LOW' || json?.code === 'LOT_CHANGED') outcomes.tooLow += 1;
        else if (json?.code === 'ALREADY_LEADING') outcomes.leading += 1;
        else if (status === 429) outcomes.rateLimited += 1;
        else if (json?.code === 'LOT_NOT_OPEN' || json?.code === 'AUCTION_ENDED') outcomes.closed += 1;
        else if (status >= 500) outcomes.serverError += 1;
        else outcomes.other += 1;
      }),
    );
  }
  await Promise.all(inFlight);
  const elapsedS = (Date.now() - startedAt) / 1_000;
  await sleep(1_000); // let the last conflated events flush

  // Fan-out: for each accepted bid, how long until each watcher had an event at or past its seq.
  const fanOut = [];
  let missed = 0;
  for (const watcher of watchers.filter((w) => w.isOpen())) {
    for (const bid of accepted) {
      const event = firstAtOrPast(watcher.seen, bid.seq);
      if (event) fanOut.push(Math.max(0, event.at - bid.acceptedAtMs));
      else missed += 1;
    }
  }
  const finalSeqs = watchers.filter((w) => w.isOpen()).map((w) => w.seen.at(-1)?.bidSeq ?? 0);
  watchers.forEach((w) => w.close());

  const verdict = (await call(`/admin/auctions/${auction.id}/lots/${lot.id}/bids/verify`, { token: admin })).json;
  const lotRow = await prisma.auctionLot.findUnique({ where: { id: lot.id }, select: { bidSeq: true } });
  const bidRows = await prisma.bid.count({ where: { lotId: lot.id } });

  // Leave the records, closed.
  await prisma.auctionLot.update({ where: { id: lot.id }, data: { status: 'CLOSED' } });
  await prisma.auction.update({ where: { id: auction.id }, data: { status: 'CLOSED' } });
  await prisma.$disconnect();

  const bidLatency = summarise(latencies);
  const fan = summarise(fanOut);
  const acceptedPerSecond = outcomes.accepted / elapsedS;
  const report = {
    target: { ratePerSecond: RATE, seconds: SECONDS, bidders: bidders.length, watchers: connected },
    elapsedSeconds: Number(elapsedS.toFixed(2)),
    attempted: total,
    outcomes,
    acceptedPerSecond: Number(acceptedPerSecond.toFixed(1)),
    bidLatencyMs: bidLatency,
    fanOutDelayMs: fan,
    fanOutNeverReached: missed,
    watchersAtFinalBid: `${finalSeqs.filter((seq) => seq === lotRow.bidSeq).length} of ${finalSeqs.length}`,
    lot: { bidSeq: lotRow.bidSeq, bidRows, chainValid: verdict?.valid === true },
  };
  console.log(JSON.stringify(report, null, 2));

  const failures = [];
  if (acceptedPerSecond < RATE * 0.9) failures.push(`accepted ${acceptedPerSecond.toFixed(1)}/s is under 90% of ${RATE}/s`);
  if (fan.p95 === null || fan.p95 > TARGET_P95_MS) failures.push(`fan-out p95 ${fan.p95} ms is over ${TARGET_P95_MS} ms`);
  if (outcomes.serverError > 0) failures.push(`${outcomes.serverError} bids took a server error`);
  if (verdict?.valid !== true) failures.push('the hash chain does not verify');
  if (lotRow.bidSeq !== bidRows) failures.push(`lot.bidSeq ${lotRow.bidSeq} is not the ${bidRows} bids in the ledger`);
  if (failures.length) {
    console.error(`\nFAILED:\n - ${failures.join('\n - ')}`);
    process.exit(1);
  }
  console.log('\nPASSED');
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
