import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';

export interface EncryptedTransitEnvelope {
  version: '1.0.0';
  tenantId: string;
  senderId: string;
  recipientId: string;
  iv: string;
  ciphertext: string;
  authTag: string;
  keyId: string;
  timestamp: string;
  signature: string;
}

export class CryptographicIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptographicIntegrityError';
  }
}

export class ReplayAttackDetectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayAttackDetectedError';
  }
}

/**
 * CryptoMeshService: The ERP's Zero-Trust Multi-Hop Cryptographic Adapter.
 *
 * Encrypts outbound transmissions to NeuraCore with this node's ingress key.
 * Decrypts inbound transmissions arriving from NeuraCore with this node's egress key.
 * Guarantees zero knowledge of any other entity's cryptographic keys.
 */
@Injectable()
export class CryptoMeshService {
  private readonly logger = new Logger(CryptoMeshService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLengthBytes = 12;
  private readonly authTagLengthBytes = 16;

  private readonly entityId: string;
  private readonly defaultTenantId: string;
  private readonly keyId: string;
  private readonly ingressSecretHex: string;
  private readonly egressSecretHex: string;
  private readonly authSecretHex: string;

  constructor(private readonly config: AppConfigService) {
    this.entityId = this.config.get('NEURA_CRYPTO_ENTITY_ID');
    this.defaultTenantId = this.config.get('NEURA_CRYPTO_TENANT_ID');
    this.keyId = this.config.get('NEURA_CRYPTO_KEY_ID');

    // Default to configured secrets or generate standard dev fallbacks
    this.ingressSecretHex =
      this.config.get('NEURA_CRYPTO_INGRESS_SECRET_HEX') ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    this.egressSecretHex =
      this.config.get('NEURA_CRYPTO_EGRESS_SECRET_HEX') ||
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    this.authSecretHex =
      this.config.get('NEURA_CRYPTO_AUTH_SECRET_HEX') ||
      'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
  }

  private buildAad(envelope: {
    version: string;
    tenantId: string;
    senderId: string;
    recipientId: string;
    keyId: string;
    timestamp: string;
  }): Buffer {
    return Buffer.from(
      `${envelope.version}:${envelope.tenantId}:${envelope.senderId}:${envelope.recipientId}:${envelope.keyId}:${envelope.timestamp}`,
      'utf8',
    );
  }

  private computeSignature(
    metadata: Omit<EncryptedTransitEnvelope, 'signature'>,
    authSecretHex: string,
  ): string {
    const canonicalString = [
      metadata.version,
      metadata.tenantId,
      metadata.senderId,
      metadata.recipientId,
      metadata.keyId,
      metadata.timestamp,
      metadata.iv,
      metadata.authTag,
      metadata.ciphertext,
    ].join('|');

    const hmac = createHmac('sha512', Buffer.from(authSecretHex, 'hex'));
    hmac.update(canonicalString, 'utf8');
    return hmac.digest('base64');
  }

  /**
   * Encrypts a payload for secure transmission through NeuraCore to a designated recipient.
   */
  encryptForRelay(
    recipientId: string,
    payload: unknown,
    tenantId?: string,
  ): EncryptedTransitEnvelope {
    const tenant = tenantId || this.defaultTenantId;
    const iv = randomBytes(this.ivLengthBytes);
    const timestamp = new Date().toISOString();

    const aad = this.buildAad({
      version: '1.0.0',
      tenantId: tenant,
      senderId: this.entityId,
      recipientId,
      keyId: this.keyId,
      timestamp,
    });

    const key = Buffer.from(this.ingressSecretHex, 'hex');
    const cipher = createCipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLengthBytes,
    });
    cipher.setAAD(aad);

    const serialized = JSON.stringify(payload);
    const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const envelopeWithoutSig: Omit<EncryptedTransitEnvelope, 'signature'> = {
      version: '1.0.0',
      tenantId: tenant,
      senderId: this.entityId,
      recipientId,
      iv: iv.toString('base64'),
      ciphertext: encrypted.toString('base64'),
      authTag: authTag.toString('base64'),
      keyId: this.keyId,
      timestamp,
    };

    const signature = this.computeSignature(envelopeWithoutSig, this.authSecretHex);

    return {
      ...envelopeWithoutSig,
      signature,
    };
  }

  /**
   * Decrypts an inbound envelope forwarded by NeuraCore using this ERP node's egress key.
   */
  decryptFromRelay<T = unknown>(
    envelope: EncryptedTransitEnvelope,
    maxClockSkewSeconds: number = 300,
  ): T {
    // 1. Replay check
    const nowMs = Date.now();
    const envelopeTimeMs = new Date(envelope.timestamp).getTime();
    if (isNaN(envelopeTimeMs)) {
      throw new CryptographicIntegrityError('Malformed envelope timestamp.');
    }
    const deltaSeconds = Math.abs(nowMs - envelopeTimeMs) / 1000;
    if (deltaSeconds > maxClockSkewSeconds) {
      throw new ReplayAttackDetectedError(
        `Replay attack prevented: timestamp delta (${deltaSeconds.toFixed(1)}s) exceeds max threshold (${maxClockSkewSeconds}s).`,
      );
    }

    // 2. Signature verification
    const { signature, ...metadata } = envelope;
    const expectedSig = this.computeSignature(metadata, this.authSecretHex);
    const sigBuf = Buffer.from(signature, 'base64');
    const expBuf = Buffer.from(expectedSig, 'base64');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new CryptographicIntegrityError(
        'Envelope signature mismatch: message has been tampered with on the transmission line.',
      );
    }

    // 3. AES-256-GCM Decryption with egress key
    const key = Buffer.from(this.egressSecretHex, 'hex');
    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.authTag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

    const aad = this.buildAad({
      version: envelope.version,
      tenantId: envelope.tenantId,
      senderId: envelope.senderId,
      recipientId: envelope.recipientId,
      keyId: envelope.keyId,
      timestamp: envelope.timestamp,
    });

    try {
      const decipher = createDecipheriv(this.algorithm, key, iv, {
        authTagLength: this.authTagLengthBytes,
      });
      decipher.setAAD(aad);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8')) as T;
    } catch (err) {
      throw new CryptographicIntegrityError(
        `Decryption failed: AEAD auth tag mismatch or invalid egress key: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  isEnvelope(obj: unknown): obj is EncryptedTransitEnvelope {
    if (!obj || typeof obj !== 'object') return false;
    const e = obj as Record<string, unknown>;
    return (
      e.version === '1.0.0' &&
      typeof e.tenantId === 'string' &&
      typeof e.senderId === 'string' &&
      typeof e.recipientId === 'string' &&
      typeof e.ciphertext === 'string' &&
      typeof e.authTag === 'string' &&
      typeof e.signature === 'string'
    );
  }
}
