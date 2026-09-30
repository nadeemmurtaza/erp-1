import { createHash, createHmac } from 'node:crypto';
import type { AppConfigService } from '../../../../core/config/app-config.service';
import { EasypaisaProvider } from './easypaisa.provider';
import { JazzCashProvider } from './jazzcash.provider';

/**
 * The gateway callback endpoints are public and unauthenticated — they have to
 * be, since the gateway posts the customer back to them — so everything in the
 * body is attacker controlled. These check that a response only settles a
 * payment when it proves where it came from.
 *
 * Easypaisa's handler used to trust `status` outright: POSTing
 * {orderRefNumber, status: 'PAID'} to /payments/callback/easypaisa confirmed
 * an order without any money moving.
 */

/** Minimal stand-in for AppConfigService — these providers only read config. */
function configWith(values: Record<string, string | undefined>): AppConfigService {
  return { get: (key: string) => values[key] } as unknown as AppConfigService;
}

const STORE_ID = 'store-1';
const HASH_KEY = 'easypaisa-secret';
const SALT = 'jazzcash-salt';

describe('Easypaisa callback verification', () => {
  const provider = () =>
    new EasypaisaProvider(
      configWith({ EASYPAISA_STORE_ID: STORE_ID, EASYPAISA_HASH_KEY: HASH_KEY }),
    );

  /** The hash Easypaisa would return alongside a genuine response. */
  function sign(status: string, reference: string, transactionId: string): string {
    return createHash('sha256')
      .update(`${STORE_ID}${status}${reference}${transactionId}${HASH_KEY}`)
      .digest('base64');
  }

  it('refuses a forged success carrying no hash', async () => {
    const result = await provider().handleCallback({
      orderRefNumber: 'EP-YSN-2026-0001',
      status: 'PAID',
    });

    expect(result.verified).toBe(false);
    expect(result.status).not.toBe('PAID');
  });

  it('refuses a response whose hash does not match', async () => {
    const result = await provider().handleCallback({
      orderRefNumber: 'EP-YSN-2026-0001',
      status: 'PAID',
      transactionId: 'T1',
      merchantHashedResp: 'not-the-right-hash',
    });

    expect(result.verified).toBe(false);
    expect(result.status).not.toBe('PAID');
  });

  it('refuses everything when no hash key is configured, rather than trusting the body', async () => {
    const unconfigured = new EasypaisaProvider(
      configWith({ EASYPAISA_STORE_ID: STORE_ID, EASYPAISA_HASH_KEY: undefined }),
    );

    const result = await unconfigured.handleCallback({
      orderRefNumber: 'EP-YSN-2026-0001',
      status: 'PAID',
      transactionId: 'T1',
      merchantHashedResp: 'anything',
    });

    expect(result.verified).toBe(false);
    expect(result.status).not.toBe('PAID');
  });

  it('settles a correctly signed success', async () => {
    const reference = 'EP-YSN-2026-0001';
    const result = await provider().handleCallback({
      orderRefNumber: reference,
      status: 'PAID',
      transactionId: 'T1',
      merchantHashedResp: sign('PAID', reference, 'T1'),
    });

    expect(result.verified).not.toBe(false);
    expect(result.status).toBe('PAID');
    expect(result.reference).toBe(reference);
  });

  it('reports a correctly signed decline as failed, not unverified', async () => {
    const reference = 'EP-YSN-2026-0002';
    const result = await provider().handleCallback({
      orderRefNumber: reference,
      status: 'FAILED',
      transactionId: 'T2',
      merchantHashedResp: sign('FAILED', reference, 'T2'),
    });

    // A genuine decline is a real state change; an unverified one is not.
    expect(result.verified).not.toBe(false);
    expect(result.status).toBe('FAILED');
  });
});

describe('JazzCash callback verification', () => {
  function sign(fields: Record<string, string>, salt: string): string {
    const message = [
      salt,
      ...Object.keys(fields)
        .filter((key) => key.startsWith('pp_') || key.startsWith('ppmpf_'))
        .sort()
        .map((key) => fields[key])
        .filter((value) => value !== undefined && value !== ''),
    ].join('&');
    return createHmac('sha256', salt).update(message).digest('hex');
  }

  it('refuses a forged success carrying no hash', async () => {
    const provider = new JazzCashProvider(configWith({ JAZZCASH_INTEGRITY_SALT: SALT }));

    const result = await provider.handleCallback({
      pp_TxnRefNo: 'T123',
      pp_ResponseCode: '000',
    });

    expect(result.verified).toBe(false);
    expect(result.status).not.toBe('PAID');
  });

  it('refuses everything when the integrity salt is unset', async () => {
    // Otherwise the HMAC is keyed on the empty string, which anyone can
    // reproduce — verification would wave forgeries straight through.
    const provider = new JazzCashProvider(configWith({ JAZZCASH_INTEGRITY_SALT: undefined }));

    const fields = { pp_TxnRefNo: 'T123', pp_ResponseCode: '000' };
    const result = await provider.handleCallback({
      ...fields,
      pp_SecureHash: sign(fields, ''),
    });

    expect(result.verified).toBe(false);
    expect(result.status).not.toBe('PAID');
  });

  it('settles a correctly signed success', async () => {
    const provider = new JazzCashProvider(configWith({ JAZZCASH_INTEGRITY_SALT: SALT }));

    const fields = { pp_TxnRefNo: 'T123', pp_ResponseCode: '000' };
    const result = await provider.handleCallback({
      ...fields,
      pp_SecureHash: sign(fields, SALT),
    });

    expect(result.verified).not.toBe(false);
    expect(result.status).toBe('PAID');
  });
});
