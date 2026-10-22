import { Test, TestingModule } from '@nestjs/testing';
import { CryptoMeshService, CryptographicIntegrityError, ReplayAttackDetectedError } from './crypto-mesh.service';
import { AppConfigService } from '../config/app-config.service';

describe('CryptoMeshService (Banking-Grade Multi-Layer Encryption)', () => {
  let service: CryptoMeshService;

  const mockConfig: Record<string, any> = {
    NEURA_CRYPTO_ENTITY_ID: 'erp-1',
    NEURA_CRYPTO_TENANT_ID: 'tenant-omega',
    NEURA_CRYPTO_KEY_ID: 'kid_test_001',
    NEURA_CRYPTO_INGRESS_SECRET_HEX: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    NEURA_CRYPTO_EGRESS_SECRET_HEX: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    NEURA_CRYPTO_AUTH_SECRET_HEX:
      'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoMeshService,
        {
          provide: AppConfigService,
          useValue: {
            get: (key: string) => mockConfig[key],
          },
        },
      ],
    }).compile();

    service = module.get<CryptoMeshService>(CryptoMeshService);
  });

  it('encrypts payload using AES-256-GCM and generates 512-bit HMAC signature', () => {
    const payload = { account: 'PK99MEZN0001', balanceMinor: 50000000 };
    const envelope = service.encryptForRelay('communicator', payload);

    expect(envelope.version).toBe('1.0.0');
    expect(envelope.tenantId).toBe('tenant-omega');
    expect(envelope.senderId).toBe('erp-1');
    expect(envelope.recipientId).toBe('communicator');
    expect(envelope.ciphertext).toBeDefined();
    expect(envelope.authTag).toBeDefined();
    expect(envelope.signature).toBeDefined();

    // Verify 512-bit HMAC signature length (base64 encoded 64 bytes = 88 chars with padding)
    expect(envelope.signature.length).toBe(88);
  });

  it('decrypts envelope when authentic and valid', () => {
    const payload = { invoiceId: 'inv_4455', amount: 99000 };
    const envelope = service.encryptForRelay('erp-1', payload);

    const decrypted = service.decryptFromRelay<typeof payload>(envelope);
    expect(decrypted).toEqual(payload);
  });

  it('rejects tampered ciphertext with CryptographicIntegrityError', () => {
    const payload = { secureCommand: 'DISPATCH_INVENTORY' };
    const envelope = service.encryptForRelay('erp-1', payload);

    // Tamper with ciphertext
    const tamperedBuf = Buffer.from(envelope.ciphertext, 'base64');
    tamperedBuf[0] = (tamperedBuf[0] ?? 0) ^ 0xff;
    envelope.ciphertext = tamperedBuf.toString('base64');

    expect(() => service.decryptFromRelay(envelope)).toThrow(CryptographicIntegrityError);
  });

  it('rejects replayed envelope with expired timestamp', () => {
    const payload = { tx: 'payout' };
    const envelope = service.encryptForRelay('erp-1', payload);

    // Set timestamp to 2 hours in the past
    envelope.timestamp = new Date(Date.now() - 7200 * 1000).toISOString();

    expect(() => service.decryptFromRelay(envelope, 300)).toThrow(ReplayAttackDetectedError);
  });
});
