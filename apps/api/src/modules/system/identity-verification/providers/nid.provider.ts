import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../../core/config/app-config.service';
import type {
  IdentityVerificationCallbackResult,
  IdentityVerificationProvider,
  IdentityVerificationStart,
  IdentityVerificationSubject,
} from '../identity-verification-provider';

interface NidSubjectResponse {
  id: string;
}

interface NidVerificationCaseResponse {
  id: string;
}

interface NidWebhookPayload {
  caseId: string;
  tenantId: string;
  subjectId: string;
  status: 'APPROVED' | 'REJECTED' | 'EXPIRED';
  raw: Record<string, unknown>;
}

/**
 * The one live IdentityVerificationProvider: calls Newax's own nID service
 * (github.com/nadeemmurtaza/nID) over its external REST API — exactly as any
 * third-party tenant of nID would, with no shared code or database. This
 * shop is nID's tenant #1; NID_API_KEY is the tenant API key nID issues for
 * this shop's account there. See docs/implementation/access-control-identity/18-identity-verification.md.
 *
 * Stays effectively off until NID_API_URL/NID_API_KEY are set — start()
 * throws if called unconfigured, same as JazzCashProvider.initiate().
 */
@Injectable()
export class NidVerificationProvider implements IdentityVerificationProvider {
  readonly key = 'nid';

  private readonly logger = new Logger(NidVerificationProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async start(subject: IdentityVerificationSubject): Promise<IdentityVerificationStart> {
    const baseUrl = this.requireConfig('NID_API_URL');
    const apiKey = this.requireConfig('NID_API_KEY');

    const providerSubjectId =
      subject.existingProviderSubjectId ?? (await this.createSubject(baseUrl, apiKey, subject));

    // "standard" is nID's Phase 0 policy name (packages/db/prisma/seed.ts on
    // the nID side) — the only policy that exists until Phase 1 adds
    // document/liveness methods and per-tenant policy configuration.
    const caseResponse = await this.postJson<NidVerificationCaseResponse>(
      `${baseUrl}/v1/verification-cases`,
      apiKey,
      {
        subjectId: providerSubjectId,
        policyName: 'standard',
        phone: subject.phone ?? '',
      },
    );

    return {
      providerSubjectId,
      providerCaseId: caseResponse.id,
      status: 'PENDING',
    };
  }

  async submitOtp(providerCaseId: string, code: string): Promise<void> {
    const baseUrl = this.requireConfig('NID_API_URL');
    const apiKey = this.requireConfig('NID_API_KEY');

    await this.postJson(`${baseUrl}/v1/verification-cases/${providerCaseId}/otp/submit`, apiKey, {
      code,
    });
  }

  async handleCallback(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<IdentityVerificationCallbackResult> {
    const secret = this.config.get('NID_WEBHOOK_SECRET');
    const timestamp = headerValue(headers['x-nid-timestamp']);
    const signature = headerValue(headers['x-nid-signature']);

    // Without the secret every signature would be keyed on the empty
    // string, which anyone can reproduce — verification would wave
    // forgeries through. Same reasoning as payments/providers/jazzcash.provider.ts.
    if (!secret) {
      this.logger.error('nID webhook rejected: NID_WEBHOOK_SECRET is not configured.');
      return { providerCaseId: '', status: 'REJECTED', raw: {}, verified: false };
    }

    if (!timestamp || !signature || !verifySignature(secret, rawBody, timestamp, signature)) {
      this.logger.error('nID webhook rejected: signature did not verify.');
      return { providerCaseId: '', status: 'REJECTED', raw: {}, verified: false };
    }

    let payload: NidWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as NidWebhookPayload;
    } catch {
      this.logger.error('nID webhook rejected: signed body was not valid JSON.');
      return { providerCaseId: '', status: 'REJECTED', raw: {}, verified: false };
    }

    return {
      providerCaseId: payload.caseId,
      status: payload.status,
      raw: payload.raw,
      verified: true,
    };
  }

  private async createSubject(
    baseUrl: string,
    apiKey: string,
    subject: IdentityVerificationSubject,
  ): Promise<string> {
    const response = await this.postJson<NidSubjectResponse>(`${baseUrl}/v1/subjects`, apiKey, {
      type: 'PERSON',
      externalRef: subject.userId,
      givenName: subject.givenName ?? undefined,
      familyName: subject.familyName ?? undefined,
      email: subject.email ?? undefined,
      phone: subject.phone ?? undefined,
    });
    return response.id;
  }

  private async postJson<T>(url: string, apiKey: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`nID request to ${url} failed with ${response.status}: ${detail}`);
    }

    return (await response.json()) as T;
  }

  private requireConfig(key: 'NID_API_URL' | 'NID_API_KEY'): string {
    const value = this.config.get(key);
    if (!value) {
      throw new Error(`Identity verification is enabled but ${key} is not set.`);
    }
    return value;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * HMAC-SHA256 over `${timestamp}.${rawBody}`, hex — must match nID's own
 * signWebhookPayload (nID repo: packages/shared-types/src/webhook.ts)
 * exactly, since nID is what computes the signature this verifies.
 */
function verifySignature(secret: string, rawBody: string, timestamp: string, signatureHex: string): boolean {
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
