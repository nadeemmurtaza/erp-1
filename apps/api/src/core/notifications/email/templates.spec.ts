import { formatMoney } from '@yaseen/shared';
import { EMAIL_TEMPLATE_CATALOG } from './catalog';
import { renderEmail, type EmailContext, type OrderEmailData } from './templates';

const ctx: EmailContext = {
  storeName: 'Yaseen',
  storefrontUrl: 'https://yaseen.pk',
  contactEmail: 'hello@yaseen.pk',
  supportWhatsapp: '+92 321 1110813',
  bankTransferDetails: 'Meezan Bank\nIBAN: PK00 MEZN 0000 0000',
};

const order: OrderEmailData = {
  orderNumber: 'YSN-2026-0184',
  items: [
    {
      name: 'Lawn 3-Piece',
      variantLabel: 'Medium / Ferozi',
      quantity: 1,
      lineTotal: 449900,
      stitched: true,
    },
  ],
  itemsSubtotal: 449900,
  stitchingSubtotal: 180000,
  discountTotal: 50000,
  shippingFee: 29500,
  codFee: 0,
  grandTotal: 609400,
  shippingAddress: {
    fullName: 'Sania Mehreen',
    phone: '0318 6003165',
    line1: 'K-Block, House 491',
    city: 'Multan',
    province: 'Punjab',
    country: 'PK',
  },
  paymentProvider: 'bank_transfer',
  awaitingBankTransfer: true,
};

const render = (data: OrderEmailData, locale: 'en' | 'ur' = 'en') =>
  renderEmail('order.confirmed', data as unknown as Record<string, unknown>, locale, ctx)!;

describe('order confirmation email', () => {
  it('renders the order, its totals and the customer address', () => {
    const mail = render(order);

    expect(mail.subject).toBe('Order YSN-2026-0184 confirmed');
    expect(mail.html).toContain('Lawn 3-Piece');
    expect(mail.html).toContain('Medium / Ferozi');
    expect(mail.html).toContain('Stitched to your measurements');
    // Built from the formatter, not typed out: Intl separates "Rs" from the
    // digits with a non-breaking space, and a hand-written assertion misses it.
    expect(mail.html).toContain(formatMoney(609400, 'en'));
    expect(mail.html).toContain('Sania Mehreen');
    expect(mail.html).toContain('Bank deposit');
    // Locale-prefixed, or the storefront redirects before showing the order.
    expect(mail.html).toContain('https://yaseen.pk/en/orders/YSN-2026-0184');
  });

  it('shows bank transfer instructions only while payment is outstanding', () => {
    expect(render(order).html).toContain('IBAN: PK00 MEZN 0000 0000');

    const paid = render({ ...order, awaitingBankTransfer: false });
    expect(paid.html).not.toContain('IBAN');
    expect(paid.html).not.toContain('Payment pending');
  });

  it('omits total rows that would read as zero', () => {
    const plain = render({
      ...order,
      stitchingSubtotal: 0,
      discountTotal: 0,
      codFee: 0,
      items: [{ name: 'Kurta', quantity: 1, lineTotal: 289900 }],
    });

    expect(plain.html).not.toContain('Discount');
    expect(plain.html).not.toContain('Stitching');
    expect(plain.html).toContain('Subtotal');
  });

  it('escapes customer-supplied text rather than rendering it as markup', () => {
    const hostile = render({
      ...order,
      items: [
        { name: '<script>alert(1)</script>', quantity: 1, lineTotal: 1000 },
      ],
      shippingAddress: { ...order.shippingAddress, fullName: 'A<img src=x onerror=y>' },
    });

    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).not.toContain('<img src=x');
    expect(hostile.html).toContain('&lt;script&gt;');
  });

  it('drops a non-http image URL instead of putting it in the customer inbox', () => {
    const mail = render({
      ...order,
      items: [
        {
          name: 'Kurta',
          quantity: 1,
          lineTotal: 1000,
          imageUrl: 'javascript:alert(1)',
        },
      ],
    });

    expect(mail.html).not.toContain('javascript:');
  });

  describe('Urdu', () => {
    it('sets the document right-to-left and uses the Urdu wording', () => {
      const mail = render(order, 'ur');

      expect(mail.html).toContain('dir="rtl"');
      expect(mail.html).toContain('آپ کے آرڈر کا شکریہ!');
      expect(mail.html).toContain('بینک ڈپازٹ');
      expect(mail.html).toContain('https://yaseen.pk/ur/orders/YSN-2026-0184');
    });

    /**
     * The regression these guard is visible, not theoretical: before the
     * left-to-right marks went in, the Urdu mail showed the discount as
     * "Rs 500 -" and the customer's phone as "6003165 0318".
     */
    it('pins money, phone numbers and account details against RTL reordering', () => {
      const mail = render(order, 'ur');

      expect(mail.html).toContain('‎- ');
      expect(mail.html).toContain('‎0318 6003165‎');
      expect(mail.html).toContain('‎+92 321 1110813‎');
      expect(mail.html).toContain('‎IBAN: PK00 MEZN 0000 0000‎');
    });
  });

  it('always ships a plain-text alternative alongside the HTML', () => {
    const mail = render(order);

    expect(mail.text.length).toBeGreaterThan(80);
    expect(mail.text).not.toContain('<');
    expect(mail.text).toContain('Lawn 3-Piece');
    // Adjacent spans in the header used to extract as "YaseenOrder number".
    expect(mail.text).toContain('Yaseen Order number');
  });

  it('has no renderer for an unknown template, so the channel can fall back', () => {
    expect(renderEmail('nope.not_a_template', {}, 'en', ctx)).toBeNull();
  });
});

describe('payment failed email', () => {
  const render = (locale: 'en' | 'ur' = 'en') =>
    renderEmail('payment.failed', { orderNumber: 'YSN-2026-0184' }, locale, ctx)!;

  it('names the order and offers a way to try again', () => {
    const mail = render();

    expect(mail.subject).toBe('Payment did not go through — YSN-2026-0184');
    expect(mail.html).toContain('YSN-2026-0184');
    expect(mail.html).toContain('Try again');
    expect(mail.html).toContain('https://yaseen.pk/en/orders/YSN-2026-0184');
  });

  it('renders in Urdu', () => {
    const mail = render('ur');

    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('ادائیگی مکمل نہیں ہوئی');
  });
});

describe('dedicated order-status emails', () => {
  it('renders a shipping confirmation that also covers "on the way"', () => {
    const mail = renderEmail('order.shipped', { orderNumber: 'YSN-2026-0184', status: 'SHIPPED' }, 'en', ctx)!;
    expect(mail.subject).toBe('YSN-2026-0184 is on its way');
    expect(mail.html).toContain('on its way');
    expect(mail.html).toContain('YSN-2026-0184');
  });

  it('renders a delivered confirmation', () => {
    const mail = renderEmail(
      'order.delivered',
      { orderNumber: 'YSN-2026-0184', status: 'DELIVERED' },
      'en',
      ctx,
    )!;
    expect(mail.subject).toBe('YSN-2026-0184 has been delivered');
    expect(mail.html).toContain('Delivered!');
  });

  it('renders a cancellation notice, adding a refund note only when one is owed', () => {
    const withoutRefund = renderEmail(
      'order.cancelled',
      { orderNumber: 'YSN-2026-0184', status: 'CANCELLED', awaitingRefund: false },
      'en',
      ctx,
    )!;
    expect(withoutRefund.html).not.toContain('refunded');

    const withRefund = renderEmail(
      'order.cancelled',
      { orderNumber: 'YSN-2026-0184', status: 'CANCELLED', awaitingRefund: true },
      'en',
      ctx,
    )!;
    expect(withRefund.html).toContain('refunded');
  });

  it('renders in Urdu', () => {
    const mail = renderEmail(
      'order.shipped',
      { orderNumber: 'YSN-2026-0184', status: 'SHIPPED' },
      'ur',
      ctx,
    )!;
    expect(mail.html).toContain('dir="rtl"');
  });
});

describe('payment refunded email', () => {
  it('names the order and the refunded amount', () => {
    const mail = renderEmail(
      'payment.refunded',
      { orderNumber: 'YSN-2026-0184', amount: 349900 },
      'en',
      ctx,
    )!;
    expect(mail.subject).toBe('Refund processed for YSN-2026-0184');
    expect(mail.html).toContain(formatMoney(349900, 'en'));
  });
});

describe('account security emails', () => {
  it('renders a password-changed confirmation with no data required', () => {
    const mail = renderEmail('user.password_changed', {}, 'en', ctx)!;
    expect(mail.subject).toBe('Your password was changed');
  });

  it('renders a password-reset email with a working link', () => {
    const mail = renderEmail('user.password_reset', { token: 'abc123' }, 'en', ctx)!;
    expect(mail.subject).toBe('Reset your password');
    expect(mail.html).toContain('https://yaseen.pk/en/reset-password?token=abc123');
  });

  it('renders an email-verification email with a working link', () => {
    const mail = renderEmail('user.email_verification', { token: 'xyz789' }, 'en', ctx)!;
    expect(mail.subject).toBe('Confirm your email address');
    expect(mail.html).toContain('https://yaseen.pk/en/verify-email?token=xyz789');
  });
});

describe('marketing templates', () => {
  const items = [{ name: 'Lawn 3-Piece', quantity: 1, lineTotal: 449900 }];
  const products = [{ name: 'Chiffon Dupatta', price: 'Rs 1,299' }];

  it('renders both abandoned-cart emails, the incentive one adding the discount code', () => {
    const reminder = renderEmail(
      'marketing.abandoned_cart_reminder',
      { items, cartUrl: 'https://yaseen.pk/en/cart' },
      'en',
      ctx,
    )!;
    expect(reminder.html).toContain('Lawn 3-Piece');
    expect(reminder.html).not.toContain('discount');

    const incentive = renderEmail(
      'marketing.abandoned_cart_incentive',
      { items, cartUrl: 'https://yaseen.pk/en/cart', discountCode: 'COMEBACK10', discountLabel: '10% off' },
      'en',
      ctx,
    )!;
    expect(incentive.html).toContain('COMEBACK10');
    expect(incentive.html).toContain('10% off');
  });

  it('renders abandoned browse, review request and cross-sell from a product list', () => {
    expect(renderEmail('marketing.abandoned_browse', { products }, 'en', ctx)!.html).toContain(
      'Chiffon Dupatta',
    );
    expect(
      renderEmail('marketing.review_request', { orderNumber: 'YSN-2026-0184', items: products }, 'en', ctx)!
        .html,
    ).toContain('YSN-2026-0184');
    expect(
      renderEmail('marketing.cross_sell', { basedOn: 'a Lawn Suit', products }, 'en', ctx)!.html,
    ).toContain('a Lawn Suit');
  });

  it('renders a replenishment reminder naming the product', () => {
    const mail = renderEmail(
      'marketing.replenishment_reminder',
      { product: { name: 'Cotton Dupatta' } },
      'en',
      ctx,
    )!;
    expect(mail.subject).toContain('Cotton Dupatta');
  });

  it('renders the three campaign templates from admin-authored content', () => {
    const data = {
      headline: 'Eid Sale — up to 40% off',
      message: 'Shop the sale before it ends.',
      ctaLabel: 'Shop now',
      ctaUrl: 'https://yaseen.pk/en/sale',
    };

    for (const key of ['marketing.holiday_sale', 'marketing.new_product_launch', 'marketing.flash_sale']) {
      const mail = renderEmail(key, data, 'en', ctx)!;
      expect(mail.subject).toBe(data.headline);
      expect(mail.html).toContain('Shop the sale before it ends.');
      expect(mail.html).toContain('https://yaseen.pk/en/sale');
    }
  });

  it('renders a flash sale expiry note only when one is given', () => {
    const withExpiry = renderEmail(
      'marketing.flash_sale',
      { headline: 'Flash sale', message: 'Hurry.', expiresAt: 'tonight' },
      'en',
      ctx,
    )!;
    expect(withExpiry.html).toContain('tonight');

    const without = renderEmail('marketing.flash_sale', { headline: 'Flash sale', message: 'Hurry.' }, 'en', ctx)!;
    expect(without.html).not.toContain('Offer ends');
  });
});

describe('email template catalog', () => {
  it('has a working renderer for every catalog entry, in both languages', () => {
    for (const entry of EMAIL_TEMPLATE_CATALOG) {
      for (const locale of ['en', 'ur'] as const) {
        const mail = renderEmail(entry.key, entry.sampleData, locale, ctx);
        expect(mail).not.toBeNull();
        expect(mail!.subject.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('welcome email', () => {
  const render = (locale: 'en' | 'ur' = 'en') =>
    renderEmail('user.welcome', { name: 'Sania' }, locale, ctx)!;

  it('greets the customer by name and links to the storefront', () => {
    const mail = render();

    expect(mail.subject).toBe('Welcome to Yaseen');
    expect(mail.html).toContain('Sania');
    expect(mail.html).toContain('https://yaseen.pk');
  });

  it('renders in Urdu', () => {
    const mail = render('ur');

    expect(mail.subject).toBe('یاسین میں خوش آمدید');
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('آپ کا اکاؤنٹ تیار ہے');
  });
});
