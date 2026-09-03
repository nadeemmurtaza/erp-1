import { formatMoney } from '@yaseen/shared';
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
