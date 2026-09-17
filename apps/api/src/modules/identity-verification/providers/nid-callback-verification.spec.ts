import { createHmac } from 'node:crypto';
import type { AppConfigService } from '../../../core/config/app-config.service';
import { NidVerificationProvider } from './nid.provider';

/**
 * nID's webhook endpoint is public and unauthenticated by session — it has
 * to be, since nID's servers post to it, not a logged-in user — so
 * everything in the body and headers is attacker controlled. These check
 * that a callback only resolves a verification when it proves it came from
 * nID. Mirrors payments/providers/callback-verification.spec.ts.
 */

/** Minimal stand-in for AppConfigService — the provider only reads config here. */
function configWith(values: Record<string, string | undefined>): AppConfigService {
  return { get: (key: string) => values[key] } as unknown as AppConfigService;
}

const SECRET = 'nid-webhook-secret';

/** The signature nID would compute over the same bytes — see webhook.ts on the nID side. */
function sign(secret: string, rawBody: string, timestamp: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

describe('nID webhook signature verification', () => {
  const rawBody = JSON.stringify({
    caseId: 'case_1',
    tenantId: 'tenant_1',
    subjectId: 'subject_1',
    status: 'APPROVED',
    raw: { reason: 'code_matched' },
  });

  it('refuses a forged callback carrying no signature', async () => {
    const provider = new NidVerificationProvider(configWith({ NID_WEBHOOK_SECRET: SECRET }));

    const result = await provider.handleCallback(rawBody, { 'x-nid-timestamp': '1700000000000' });

    expect(result.verified).toBe(false);
  });

  it('refuses a callback whose signature does not match', async () => {
    const provider = new NidVerificationProvider(configWith({ NID_WEBHOOK_SECRET: SECRET }));

    const result = await provider.handleCallback(rawBody, {
      'x-nid-timestamp': '1700000000000',
      'x-nid-signature': 'not-the-right-signature',
    });

    expect(result.verified).toBe(false);
  });

  it('refuses everything when no webhook secret is configured, rather than trusting the body', async () => {
    // Otherwise the HMAC is keyed on the empty string, which anyone can
    // reproduce — verification would wave forgeries straight through.
    const provider = new NidVerificationProvider(configWith({ NID_WEBHOOK_SECRET: undefined }));

    const result = await provider.handleCallback(rawBody, {
      'x-nid-timestamp': '1700000000000',
      'x-nid-signature': sign('', rawBody, '1700000000000'),
    });

    expect(result.verified).toBe(false);
  });

  it('refuses a signature computed over different bytes than were sent (a re-serialized body)', async () => {
    const provider = new NidVerificationProvider(configWith({ NID_WEBHOOK_SECRET: SECRET }));
    const timestamp = '1700000000000';
    // Same fields, different key order — a plausible result of parsing then
    // re-stringifying instead of verifying the raw bytes, which is exactly
    // what this provider avoids by taking rawBody as a string.
    const reordered = JSON.stringify({
      status: 'APPROVED',
      caseId: 'case_1',
      tenantId: 'tenant_1',
      subjectId: 'subject_1',
      raw: { reason: 'code_matched' },
    });

    const result = await provider.handleCallback(rawBody, {
      'x-nid-timestamp': timestamp,
      'x-nid-signature': sign(SECRET, reordered, timestamp),
    });

    expect(result.verified).toBe(false);
  });

  it('accepts a correctly signed callback and reports its case, status and raw payload', async () => {
    const provider = new NidVerificationProvider(configWith({ NID_WEBHOOK_SECRET: SECRET }));
    const timestamp = '1700000000000';

    const result = await provider.handleCallback(rawBody, {
      'x-nid-timestamp': timestamp,
      'x-nid-signature': sign(SECRET, rawBody, timestamp),
    });

    expect(result.verified).toBe(true);
    expect(result.providerCaseId).toBe('case_1');
    expect(result.status).toBe('APPROVED');
    expect(result.raw).toEqual({ reason: 'code_matched' });
  });

  it('accepts a correctly signed REJECTED callback as a real result, not an unverified one', async () => {
    const provider = new NidVerificationProvider(configWith({ NID_WEBHOOK_SECRET: SECRET }));
    const timestamp = '1700000000000';
    const rejectedBody = JSON.stringify({
      caseId: 'case_2',
      tenantId: 'tenant_1',
      subjectId: 'subject_1',
      status: 'REJECTED',
      raw: { reason: 'code_mismatch' },
    });

    const result = await provider.handleCallback(rejectedBody, {
      'x-nid-timestamp': timestamp,
      'x-nid-signature': sign(SECRET, rejectedBody, timestamp),
    });

    expect(result.verified).toBe(true);
    expect(result.status).toBe('REJECTED');
  });
});
