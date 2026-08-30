#!/usr/bin/env node
/**
 * Checks everything that decides whether our mail reaches the inbox.
 *
 *   node scripts/check-email-dns.mjs yaseen.pk 203.0.113.45
 *   node scripts/check-email-dns.mjs yaseen.pk 203.0.113.45 --selector=mail
 *
 * Run it from the VPS. Two of the checks — outbound port 25 and the blocklist
 * lookup — only tell the truth from the machine that will actually send.
 *
 * Authentication does not win the inbox on its own; it makes you eligible for
 * it, and reputation decides the rest. But every failure below is a reason
 * Gmail bins the mail outright, so this has to come back clean before there is
 * any point looking at reputation.
 *
 * Exit code is the number of failures, so CI or a cron can gate on it.
 */
import { promises as dns } from 'node:dns';
import net from 'node:net';
import process from 'node:process';

const args = process.argv.slice(2);
const domain = args.find((a) => !a.startsWith('-'));
const ip = args.filter((a) => !a.startsWith('-'))[1];
const selector = (args.find((a) => a.startsWith('--selector=')) ?? '--selector=mail').split(
  '=',
)[1];
const mailHost = (
  args.find((a) => a.startsWith('--host=')) ?? `--host=mail.${domain}`
).split('=')[1];

if (!domain) {
  console.error(
    'usage: node scripts/check-email-dns.mjs <domain> [public-ip] [--selector=mail] [--host=mail.<domain>]',
  );
  process.exit(2);
}

const results = [];
const record = (level, name, detail, fix) =>
  results.push({ level, name, detail, fix });
const pass = (name, detail) => record('PASS', name, detail);
const warn = (name, detail, fix) => record('WARN', name, detail, fix);
const fail = (name, detail, fix) => record('FAIL', name, detail, fix);

/** TXT records arrive split into 255-byte chunks; rejoin before matching. */
async function txt(name) {
  try {
    return (await dns.resolveTxt(name)).map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

async function checkSendingHost() {
  try {
    const addresses = await dns.resolve4(mailHost);
    pass('A record', `${mailHost} -> ${addresses.join(', ')}`);
    if (ip && !addresses.includes(ip)) {
      fail(
        'A record',
        `${mailHost} resolves to ${addresses.join(', ')}, not ${ip}`,
        `Point ${mailHost} at ${ip}.`,
      );
    }
    return addresses[0];
  } catch {
    fail(
      'A record',
      `${mailHost} does not resolve`,
      `Add an A record for ${mailHost} pointing at the VPS.`,
    );
    return null;
  }
}

/**
 * Reverse DNS. Receivers check that the reverse name resolves forward to the
 * same address, and a mismatch is one of the most common reasons a self-hosted
 * server is rejected before the message body is even read.
 */
async function checkPtr(address) {
  const target = ip ?? address;
  if (!target) return;

  let names = [];
  try {
    names = await dns.reverse(target);
  } catch {
    fail(
      'PTR',
      `${target} has no reverse DNS`,
      `Set the PTR for ${target} to ${mailHost}. This is in the VPS provider's control panel, not your DNS host.`,
    );
    return;
  }

  if (names.includes(mailHost)) {
    pass('PTR', `${target} -> ${mailHost}`);
  } else {
    fail(
      'PTR',
      `${target} reverses to ${names.join(', ')}, not ${mailHost}`,
      `Set the PTR to ${mailHost} in the VPS provider's control panel.`,
    );
  }
}

/**
 * MX records — how the rest of the internet delivers mail *to* us.
 *
 * Only meaningful once we accept mail. A send-only server needs no MX, but
 * without one there is nowhere for a customer's reply to an order
 * confirmation to land, and nowhere for DMARC reports to be sent.
 */
async function checkMx() {
  let records = [];
  try {
    records = await dns.resolveMx(domain);
  } catch {
    /* handled below */
  }

  if (records.length === 0) {
    fail(
      'MX',
      `no MX record on ${domain}`,
      `Add MX ${domain} -> ${mailHost} (priority 10). Without it nobody can reply to your order mail, and DMARC reports have nowhere to go.`,
    );
    return;
  }

  const hosts = records
    .sort((a, b) => a.priority - b.priority)
    .map((r) => `${r.exchange} (${r.priority})`);
  pass('MX', hosts.join(', '));

  if (!records.some((r) => r.exchange.replace(/\.$/, '') === mailHost)) {
    warn(
      'MX',
      `none of them is ${mailHost}`,
      `Mail for ${domain} is being delivered somewhere else. Fine if that is deliberate — otherwise point MX at ${mailHost}.`,
    );
  }
}

async function checkSpf(address) {
  const records = (await txt(domain)).filter((r) => r.toLowerCase().startsWith('v=spf1'));

  if (records.length === 0) {
    fail(
      'SPF',
      `no SPF record on ${domain}`,
      `Add TXT ${domain} = "v=spf1 mx a ip4:${ip ?? 'YOUR_IP'} -all"`,
    );
    return;
  }
  if (records.length > 1) {
    fail(
      'SPF',
      `${records.length} SPF records — more than one is a permanent error, and receivers treat it as no SPF at all`,
      'Merge them into a single TXT record.',
    );
    return;
  }

  const spf = records[0];
  pass('SPF', spf);

  const target = ip ?? address;
  if (target && !spf.includes(target) && !/\ba\b|\bmx\b/.test(spf)) {
    fail(
      'SPF',
      `does not authorise ${target}`,
      `Add ip4:${target} to the SPF record, or an "a" / "mx" mechanism that covers it.`,
    );
  }
  if (!/[~-]all\s*$/.test(spf.trim())) {
    warn(
      'SPF',
      'does not end in -all or ~all',
      'End the record with -all once you are confident nothing else sends as this domain. "+all" or a missing "all" authorises the entire internet and is worse than having no SPF.',
    );
  }
}

async function checkDkim() {
  const name = `${selector}._domainkey.${domain}`;
  const records = await txt(name);

  if (records.length === 0) {
    fail(
      'DKIM',
      `no key at ${name}`,
      `Read the public key out of the mail container and publish it:\n       docker compose -f docker-compose.mail.yml exec smtp cat /etc/opendkim/keys/${domain}/${selector}.txt`,
    );
    return;
  }

  const key = records[0];
  if (!/p=[A-Za-z0-9+/=]{100,}/.test(key)) {
    fail(
      'DKIM',
      `the record at ${name} has no usable public key`,
      'The p= value is empty or truncated. Republish it as one unbroken string.',
    );
    return;
  }
  pass('DKIM', `${name} (${/k=rsa/.test(key) ? 'rsa' : 'key'} published)`);
}

async function checkDmarc() {
  const records = (await txt(`_dmarc.${domain}`)).filter((r) =>
    r.toLowerCase().startsWith('v=dmarc1'),
  );

  if (records.length === 0) {
    fail(
      'DMARC',
      `no DMARC record on _dmarc.${domain}`,
      `Add TXT _dmarc.${domain} = "v=DMARC1; p=none; rua=mailto:dmarc@${domain}"\n       Gmail and Yahoo have required this from bulk senders since February 2024.`,
    );
    return;
  }

  const dmarc = records[0];
  pass('DMARC', dmarc);

  if (!/rua=/.test(dmarc)) {
    warn(
      'DMARC',
      'no rua= reporting address',
      'Without it you never find out which mail is failing authentication.',
    );
  }
  if (/p=none/.test(dmarc)) {
    warn(
      'DMARC',
      'policy is p=none — reporting only, nothing is enforced',
      'Correct while you settle in. Move to p=quarantine once a week of reports is clean.',
    );
  }
}

/** A blocklisted IP is rejected before content is considered. */
async function checkBlocklists(address) {
  const target = ip ?? address;
  if (!target || !net.isIPv4(target)) return;

  const reversed = target.split('.').reverse().join('.');
  const zones = [
    ['Spamhaus ZEN', 'zen.spamhaus.org'],
    ['Barracuda', 'b.barracudacentral.org'],
    ['SpamCop', 'bl.spamcop.net'],
  ];

  for (const [label, zone] of zones) {
    try {
      const hit = await dns.resolve4(`${reversed}.${zone}`);
      fail(
        `Blocklist: ${label}`,
        `${target} is listed (${hit.join(', ')})`,
        `Most lists have a self-service delisting form. VPS addresses are often listed by whoever held them before you.`,
      );
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        pass(`Blocklist: ${label}`, `${target} is not listed`);
      } else {
        warn(
          `Blocklist: ${label}`,
          `lookup inconclusive (${error.code})`,
          'Public resolvers are often refused by blocklist zones. Re-run from the VPS using its own resolver.',
        );
      }
    }
  }
}

/**
 * Outbound port 25. Most VPS providers block it by default, and no amount of
 * DNS makes delivery work while it is closed.
 */
function checkPort25() {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: 'gmail-smtp-in.l.google.com',
      port: 25,
      timeout: 8000,
    });
    const done = (ok, detail) => {
      socket.destroy();
      if (ok) pass('Outbound port 25', detail);
      else
        fail(
          'Outbound port 25',
          detail,
          "The provider is almost certainly blocking it — DigitalOcean, Vultr, Hetzner, Oracle and AWS all do by default. Raise a support ticket, or use a relay on port 587 instead (docs/email.md).",
        );
      resolve();
    };
    socket.on('connect', () => done(true, 'can reach gmail-smtp-in.l.google.com:25'));
    socket.on('timeout', () => done(false, 'timed out connecting to Gmail on port 25'));
    socket.on('error', (error) => done(false, `cannot connect on port 25 (${error.code})`));
  });
}

/**
 * DMARC passes on *alignment*: the domain a human sees in From: has to match
 * the domain that SPF and DKIM authenticated. Sending as a Gmail address from
 * our own server is the classic way to fail this, and it fails hard — Gmail
 * rejects mail claiming to be from gmail.com that did not come from Gmail.
 */
function checkFromAlignment() {
  const from = process.env.MAIL_FROM;
  if (!from) {
    warn(
      'From alignment',
      'MAIL_FROM is not set in this shell, so it was not checked',
      `Run with it set: MAIL_FROM="Yaseen <no-reply@${domain}>" node scripts/check-email-dns.mjs ${domain}`,
    );
    return;
  }

  const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
  const fromDomain = address.split('@')[1]?.toLowerCase();

  if (!fromDomain) {
    fail('From alignment', `MAIL_FROM ("${from}") has no domain`, 'Use name <user@domain>.');
    return;
  }

  const free = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
  if (free.includes(fromDomain)) {
    fail(
      'From alignment',
      `MAIL_FROM sends as @${fromDomain}`,
      `Their DMARC policy rejects mail not sent from their own servers, so this will be refused or spam-filed every time. Send as @${domain}.`,
    );
    return;
  }

  if (fromDomain === domain || fromDomain.endsWith(`.${domain}`)) {
    pass('From alignment', `${address} aligns with ${domain}`);
  } else {
    fail(
      'From alignment',
      `MAIL_FROM is @${fromDomain} but the records checked here are on ${domain}`,
      `Either send as @${domain}, or re-run this against ${fromDomain}.`,
    );
  }
}

const ICON = { PASS: '  ok  ', WARN: ' warn ', FAIL: ' FAIL ' };

async function main() {
  console.log(`\nChecking outbound mail for ${domain} (host ${mailHost}, selector ${selector})\n`);

  const address = await checkSendingHost();
  await checkPtr(address);
  await checkMx();
  await checkSpf(address);
  await checkDkim();
  await checkDmarc();
  checkFromAlignment();
  await checkBlocklists(address);
  await checkPort25();

  for (const { level, name, detail, fix } of results) {
    console.log(`[${ICON[level]}] ${name}: ${detail}`);
    if (fix) console.log(`         -> ${fix}`);
  }

  const failures = results.filter((r) => r.level === 'FAIL').length;
  const warnings = results.filter((r) => r.level === 'WARN').length;

  console.log(
    `\n${failures} failing, ${warnings} to look at, ${
      results.filter((r) => r.level === 'PASS').length
    } passing.`,
  );

  if (failures > 0) {
    console.log(
      'Fix the failures before sending real order mail. Each one is a reason a receiver rejects or spam-files the message.\n',
    );
  } else {
    console.log(
      'Authentication is in order. That makes you eligible for the inbox; reputation decides the rest — send a test to https://www.mail-tester.com and keep an eye on the DMARC reports.\n',
    );
  }

  process.exit(Math.min(failures, 125));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
