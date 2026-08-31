#!/usr/bin/env node

/**
 * check-email-dns.mjs — Verify DNS records for email deliverability.
 *
 * Usage:  node scripts/check-email-dns.mjs <domain>
 * Example: node scripts/check-email-dns.mjs yaseen.pk
 *
 * Checks: MX, SPF, DKIM, DMARC, PTR (if IP provided via --ip)
 */

import { resolveMx, resolveTxt, resolve4 } from 'node:dns/promises';

const domain = process.argv[2];
const ipArg = process.argv.indexOf('--ip');
const ip = ipArg !== -1 ? process.argv[ipArg + 1] : null;

if (!domain) {
  console.error('Usage: node scripts/check-email-dns.mjs <domain> [--ip <server-ip>]');
  process.exit(1);
}

const results = { pass: 0, warn: 0, fail: 0 };

function pass(msg) { results.pass++; console.log(`  ✅ PASS  ${msg}`); }
function warn(msg) { results.warn++; console.log(`  ⚠️  WARN  ${msg}`); }
function fail(msg) { results.fail++; console.log(`  ❌ FAIL  ${msg}`); }

async function checkMx() {
  console.log('\n📬 MX Records');
  try {
    const mx = await resolveMx(domain);
    if (mx.length === 0) {
      fail('No MX records found');
    } else {
      mx.sort((a, b) => a.priority - b.priority);
      for (const record of mx) {
        pass(`MX ${record.priority} ${record.exchange}`);
      }
    }
  } catch (err) {
    fail(`MX lookup failed: ${err.code}`);
  }
}

async function checkSpf() {
  console.log('\n🔐 SPF Record');
  try {
    const txt = await resolveTxt(domain);
    const spf = txt.flat().find((r) => r.startsWith('v=spf1'));
    if (spf) {
      pass(spf);
      if (spf.includes('-all')) {
        pass('Hard fail for unauthorized senders (-all)');
      } else if (spf.includes('~all')) {
        warn('Soft fail (~all) — consider upgrading to -all');
      } else {
        warn('No fail mechanism — unauthorized senders may not be rejected');
      }
    } else {
      fail('No SPF record found');
    }
  } catch (err) {
    fail(`SPF lookup failed: ${err.code}`);
  }
}

async function checkDkim() {
  console.log('\n🔑 DKIM Record');
  try {
    // Check common selectors
    const selectors = ['202404e', '202404r', 'default', 'google', 'selector1', 'selector2', 'dkim', 'mail'];
    let found = false;

    for (const selector of selectors) {
      try {
        const txt = await resolveTxt(`${selector}._domainkey.${domain}`);
        const record = txt.flat().find((r) => r.startsWith('v=DKIM1'));
        if (record) {
          pass(`DKIM selector "${selector}": ${record.substring(0, 80)}...`);
          found = true;
          break;
        }
      } catch {
        // Selector doesn't exist, try next
      }
    }

    if (!found) {
      fail('No DKIM record found (checked common selectors)');
    }
  } catch (err) {
    fail(`DKIM lookup failed: ${err.code}`);
  }
}

async function checkDmarc() {
  console.log('\n🛡️  DMARC Record');
  try {
    const txt = await resolveTxt(`_dmarc.${domain}`);
    const record = txt.flat().find((r) => r.startsWith('v=DMARC1'));
    if (record) {
      pass(record);
      if (record.includes('p=reject')) {
        pass('Policy: reject (strict)');
      } else if (record.includes('p=quarantine')) {
        warn('Policy: quarantine — consider upgrading to reject');
      } else if (record.includes('p=none')) {
        warn('Policy: none (monitor only) — tighten after warm-up');
      }
    } else {
      fail('No DMARC record found');
    }
  } catch (err) {
    fail(`DMARC lookup failed: ${err.code}`);
  }
}

async function checkPtr() {
  if (!ip) {
    console.log('\n🔍 PTR Record (skipped — pass --ip <address> to check)');
    return;
  }

  console.log(`\n🔍 PTR Record for ${ip}`);
  try {
    const { reverse } = await import('node:dns/promises');
    const ptr = await reverse(ip);
    if (ptr.length > 0) {
      pass(`PTR: ${ptr[0]}`);
      if (ptr[0].includes(domain)) {
        pass('PTR matches domain');
      } else {
        warn(`PTR does not match domain (${ptr[0]} vs ${domain})`);
      }
    } else {
      fail('No PTR record found');
    }
  } catch (err) {
    fail(`PTR lookup failed: ${err.code}`);
  }
}

async function checkA() {
  console.log(`\n🌐 A Record for mail.${domain}`);
  try {
    const a = await resolve4(`mail.${domain}`);
    if (a.length > 0) {
      pass(`mail.${domain} → ${a.join(', ')}`);
      if (ip && a.includes(ip)) {
        pass('A record matches provided IP');
      } else if (ip) {
        warn(`A record (${a[0]}) does not match provided IP (${ip})`);
      }
    } else {
      warn(`No A record for mail.${domain}`);
    }
  } catch (err) {
    warn(`A record lookup for mail.${domain} failed: ${err.code}`);
  }
}

async function main() {
  console.log(`\n📧 Email DNS Check: ${domain}`);
  console.log('='.repeat(40));

  await checkMx();
  await checkSpf();
  await checkDkim();
  await checkDmarc();
  await checkA();
  await checkPtr();

  console.log('\n' + '='.repeat(40));
  console.log(`Results: ✅ ${results.pass} passed, ⚠️  ${results.warn} warnings, ❌ ${results.fail} failed`);

  if (results.fail > 0) {
    console.log('\n❌ Fix the failures above before sending email.');
    process.exit(1);
  } else if (results.warn > 0) {
    console.log('\n⚠️  Warnings are non-blocking but should be addressed.');
    process.exit(0);
  } else {
    console.log('\n✅ All checks passed!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
