import { Test } from '@nestjs/testing';
import { CartLineValidatorRegistry } from '../../core/extension-points/cart-line-validator.registry';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AuditService } from '../../core/audit/audit.service';
import { PricingService } from '../pricing/pricing.service';
import { CartService } from './cart.service';

/** WO-8.5 — the guest phone/consent capture endpoint abandoned-cart recovery depends on. */
describe('CartService.updateGuestContact', () => {
  let service: CartService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [CartService, PrismaService, SettingsService, CartLineValidatorRegistry, AuditService, PricingService],
    }).compile();
    service = module.get(CartService);
    prisma = module.get(PrismaService);
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `guest-contact-test-${Date.now()}-${seq}`;
  }

  afterEach(async () => {
    await prisma.cart.deleteMany({ where: { token: { contains: 'guest-contact-test' } } });
  });

  async function makeGuestCart() {
    const token = tag();
    return prisma.cart.create({ data: { token, expiresAt: new Date(Date.now() + 86_400_000) } });
  }

  it('normalises the phone and stamps consent when given', async () => {
    const cart = await makeGuestCart();

    await service.updateGuestContact(cart.token, undefined, { phone: '0300 1234567', marketingConsent: true });

    const refreshed = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(refreshed.guestPhone).toBe('+923001234567');
    expect(refreshed.guestMarketingConsentAt).not.toBeNull();
  });

  it('clears consent when the customer withdraws it, without dropping the phone', async () => {
    const cart = await makeGuestCart();
    await service.updateGuestContact(cart.token, undefined, { phone: '0300 1234567', marketingConsent: true });

    await service.updateGuestContact(cart.token, undefined, { phone: '0300 1234567', marketingConsent: false });

    const refreshed = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(refreshed.guestPhone).toBe('+923001234567');
    expect(refreshed.guestMarketingConsentAt).toBeNull();
  });

  it('rejects an invalid phone number', async () => {
    const cart = await makeGuestCart();

    await expect(
      service.updateGuestContact(cart.token, undefined, { phone: 'not-a-phone', marketingConsent: true }),
    ).rejects.toThrow();
  });

  it('is a no-op for a signed-in cart — the account email already covers this', async () => {
    const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const token = tag();
    const cart = await prisma.cart.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    await service.updateGuestContact(cart.token, user.id, { phone: '0300 1234567', marketingConsent: true });

    const refreshed = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(refreshed.guestPhone).toBeNull();
  });
});
