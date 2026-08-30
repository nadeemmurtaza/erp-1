import type { Locale } from '@yaseen/shared';

/**
 * Email wording, in both languages the storefront ships.
 *
 * One interface, two implementations, so a string added to English fails the
 * build until Urdu has it too. Translations drift the moment that stops being
 * enforced, and a half-Urdu order confirmation reads worse than an English one.
 *
 * Anything with a value in it is a function rather than a string, so word order
 * stays the translator's decision — Urdu does not put the number where English
 * does.
 */
export interface EmailCopy {
  orderConfirmed: {
    subject: (orderNumber: string) => string;
    heading: string;
    intro: string;
    cta: string;
    summary: string;
    stitchingNote: string;
  };
  awaitingPayment: {
    title: string;
    intro: (amount: string) => string;
    sendScreenshot: (whatsapp: string) => string;
    afterVerification: string;
  };
  paymentReceived: {
    subject: (orderNumber: string) => string;
    heading: string;
    intro: (amount: string) => string;
  };
  status: {
    subject: (orderNumber: string, status: string) => string;
    heading: (status: string) => string;
    intro: (orderNumber: string, status: string) => string;
    words: Record<string, string>;
  };
  stitching: {
    readySubject: (garment: string) => string;
    stageSubject: (garment: string, stage: string) => string;
    heading: string;
    stages: Record<string, string>;
  };
  totals: {
    subtotal: string;
    stitching: string;
    discount: string;
    shipping: string;
    codFee: string;
    total: string;
  };
  details: {
    customerInformation: string;
    shippingAddress: string;
    billingAddress: string;
    payment: string;
    shippingMethod: string;
    orderNumber: string;
  };
  /** Keyed by Payment.provider. */
  paymentMethods: Record<string, string>;
  shippingFeeLabel: string;
  footer: (storeName: string, contact: string) => string;
  /** Inbox preview line. Kept short — most clients cut it around 90 characters. */
  viewOrder: string;
}

const en: EmailCopy = {
  orderConfirmed: {
    subject: (orderNumber) => `Order ${orderNumber} confirmed`,
    heading: 'Thank you for your order!',
    intro:
      'We are getting your order ready. We will let you know as soon as it is on its way.',
    cta: 'View your order',
    summary: 'Order summary',
    stitchingNote: 'Stitched to your measurements',
  },
  awaitingPayment: {
    title: 'Payment pending',
    intro: (amount) =>
      `Please transfer ${amount} to the account below. Your order is confirmed once we verify the payment.`,
    sendScreenshot: (whatsapp) =>
      `After paying, send the screenshot on WhatsApp: ${whatsapp}`,
    afterVerification: 'Bank transfer also works from the JazzCash and Easypaisa apps.',
  },
  paymentReceived: {
    subject: (orderNumber) => `Payment received for ${orderNumber}`,
    heading: 'Payment received',
    intro: (amount) =>
      `We have received your payment of ${amount}. Your order is confirmed and we are preparing it now.`,
  },
  status: {
    subject: (orderNumber, status) => `${orderNumber} — ${status}`,
    heading: (status) => `Your order is ${status}`,
    intro: (orderNumber, status) => `Order ${orderNumber} is now ${status}.`,
    words: {
      PENDING: 'pending',
      CONFIRMED: 'confirmed',
      PROCESSING: 'being prepared',
      SHIPPED: 'on its way',
      DELIVERED: 'delivered',
      CANCELLED: 'cancelled',
      REFUNDED: 'refunded',
    },
  },
  stitching: {
    readySubject: (garment) => `Your ${garment} is ready`,
    stageSubject: (garment, stage) => `Your ${garment}: ${stage}`,
    heading: 'An update from the workshop',
    stages: {
      RECEIVED: 'received by the workshop',
      CUTTING: 'being cut',
      STITCHING: 'being stitched',
      QC: 'being checked',
      READY: 'ready',
      DISPATCHED: 'on its way',
    },
  },
  totals: {
    subtotal: 'Subtotal',
    stitching: 'Stitching',
    discount: 'Discount',
    shipping: 'Shipping',
    codFee: 'Cash on delivery fee',
    total: 'Total',
  },
  details: {
    customerInformation: 'Customer information',
    shippingAddress: 'Shipping address',
    billingAddress: 'Billing address',
    payment: 'Payment',
    shippingMethod: 'Shipping method',
    orderNumber: 'Order number',
  },
  paymentMethods: {
    cod: 'Cash on delivery',
    bank_transfer: 'Bank deposit',
    jazzcash: 'JazzCash',
    easypaisa: 'Easypaisa',
  },
  shippingFeeLabel: 'Shipping fee',
  footer: (storeName, contact) =>
    `If you have any questions, reply to this email or contact us at ${contact}. — ${storeName}`,
  viewOrder: 'View your order',
};

const ur: EmailCopy = {
  orderConfirmed: {
    subject: (orderNumber) => `آرڈر ${orderNumber} کی تصدیق ہو گئی`,
    heading: 'آپ کے آرڈر کا شکریہ!',
    intro:
      'ہم آپ کا آرڈر تیار کر رہے ہیں۔ روانہ ہوتے ہی ہم آپ کو اطلاع دے دیں گے۔',
    cta: 'اپنا آرڈر دیکھیں',
    summary: 'آرڈر کی تفصیل',
    stitchingNote: 'آپ کے ناپ کے مطابق سلائی',
  },
  awaitingPayment: {
    title: 'ادائیگی باقی ہے',
    intro: (amount) =>
      `براہِ کرم ${amount} نیچے دیے گئے اکاؤنٹ میں منتقل کریں۔ ادائیگی کی تصدیق کے بعد آپ کا آرڈر پکا ہو جائے گا۔`,
    sendScreenshot: (whatsapp) =>
      `ادائیگی کے بعد اسکرین شاٹ واٹس ایپ پر بھیجیں: ${whatsapp}`,
    afterVerification:
      'بینک ٹرانسفر جاز کیش اور ایزی پیسہ ایپ سے بھی کیا جا سکتا ہے۔',
  },
  paymentReceived: {
    subject: (orderNumber) => `${orderNumber} کی ادائیگی موصول ہو گئی`,
    heading: 'ادائیگی موصول ہو گئی',
    intro: (amount) =>
      `ہمیں آپ کی ${amount} کی ادائیگی موصول ہو گئی ہے۔ آپ کا آرڈر پکا ہو گیا ہے اور ہم اسے تیار کر رہے ہیں۔`,
  },
  status: {
    subject: (orderNumber, status) => `${orderNumber} — ${status}`,
    heading: (status) => `آپ کا آرڈر ${status}`,
    intro: (orderNumber, status) => `آرڈر ${orderNumber} اب ${status}۔`,
    words: {
      PENDING: 'زیرِ التوا ہے',
      CONFIRMED: 'پکا ہو گیا ہے',
      PROCESSING: 'تیار ہو رہا ہے',
      SHIPPED: 'روانہ ہو چکا ہے',
      DELIVERED: 'پہنچا دیا گیا ہے',
      CANCELLED: 'منسوخ ہو گیا ہے',
      REFUNDED: 'رقم واپس کر دی گئی ہے',
    },
  },
  stitching: {
    readySubject: (garment) => `آپ کا ${garment} تیار ہے`,
    stageSubject: (garment, stage) => `آپ کا ${garment}: ${stage}`,
    heading: 'ورکشاپ سے اطلاع',
    stages: {
      RECEIVED: 'ورکشاپ کو موصول ہو گیا',
      CUTTING: 'کٹائی ہو رہی ہے',
      STITCHING: 'سلائی ہو رہی ہے',
      QC: 'جانچ ہو رہی ہے',
      READY: 'تیار ہے',
      DISPATCHED: 'روانہ ہو چکا ہے',
    },
  },
  totals: {
    subtotal: 'ذیلی میزان',
    stitching: 'سلائی',
    discount: 'رعایت',
    shipping: 'ڈیلیوری چارجز',
    codFee: 'کیش آن ڈیلیوری فیس',
    total: 'کل رقم',
  },
  details: {
    customerInformation: 'گاہک کی معلومات',
    shippingAddress: 'ڈیلیوری کا پتہ',
    billingAddress: 'بلنگ کا پتہ',
    payment: 'ادائیگی',
    shippingMethod: 'ڈیلیوری کا طریقہ',
    orderNumber: 'آرڈر نمبر',
  },
  paymentMethods: {
    cod: 'کیش آن ڈیلیوری',
    bank_transfer: 'بینک ڈپازٹ',
    jazzcash: 'جاز کیش',
    easypaisa: 'ایزی پیسہ',
  },
  shippingFeeLabel: 'ڈیلیوری فیس',
  footer: (storeName, contact) =>
    `کسی بھی سوال کے لیے اس ای میل کا جواب دیں یا ہم سے ${contact} پر رابطہ کریں۔ — ${storeName}`,
  viewOrder: 'اپنا آرڈر دیکھیں',
};

export function copyFor(locale: Locale | null | undefined): EmailCopy {
  return locale === 'ur' ? ur : en;
}
