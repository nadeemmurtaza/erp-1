import { BRAND } from '@newax/shared';
import type { Locale } from '@newax/shared';

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
  paymentFailed: {
    subject: (orderNumber: string) => string;
    heading: string;
    intro: (orderNumber: string) => string;
    cta: string;
  };
  welcome: {
    subject: string;
    heading: string;
    intro: (name: string) => string;
    cta: string;
  };
  status: {
    subject: (orderNumber: string, status: string) => string;
    heading: (status: string) => string;
    intro: (orderNumber: string, status: string) => string;
    words: Record<string, string>;
  };
  orderShipped: {
    subject: (orderNumber: string) => string;
    heading: string;
    intro: (orderNumber: string) => string;
  };
  orderDelivered: {
    subject: (orderNumber: string) => string;
    heading: string;
    intro: (orderNumber: string) => string;
    note: string;
  };
  orderCancelled: {
    subject: (orderNumber: string) => string;
    heading: string;
    intro: (orderNumber: string) => string;
    refundNote: string;
  };
  paymentRefunded: {
    subject: (orderNumber: string) => string;
    heading: string;
    intro: (orderNumber: string, amount: string) => string;
  };
  passwordChanged: {
    subject: string;
    heading: string;
    intro: string;
  };
  passwordReset: {
    subject: string;
    heading: string;
    intro: string;
    cta: string;
    expiry: string;
  };
  emailVerification: {
    subject: string;
    heading: string;
    intro: string;
    cta: string;
  };
  /** Default call-to-action for marketing mail with no order or reset link to point at. */
  shopNow: string;
  marketing: {
    abandonedCartFirstTouch: { subject: string; heading: string; intro: string; cta: string };
    abandonedCartReminder: { subject: string; heading: string; intro: string; cta: string };
    abandonedCartIncentive: {
      subject: string;
      heading: string;
      intro: string;
      cta: string;
      discountTitle: string;
      discountBody: (label: string) => string;
    };
    abandonedBrowse: { subject: string; heading: string; intro: string; cta: string };
    reviewRequest: {
      subject: string;
      heading: string;
      intro: (orderNumber: string) => string;
      cta: string;
    };
    crossSell: {
      subject: string;
      heading: string;
      intro: string;
      introBasedOn: (basedOn: string) => string;
      cta: string;
    };
    replenishment: {
      subject: (productName: string) => string;
      heading: string;
      intro: (productName: string) => string;
      cta: string;
    };
    campaign: {
      holidayBadge: string;
      launchBadge: string;
      flashSaleBadge: string;
      expiresNote: (expiresAt: string) => string;
    };
    /**
     * Footer line every automated marketing send carries — the
     * CAN-SPAM/consent-law minimum. Two plain strings, not a template with
     * an embedded link: the link itself is built by html.ts's footerLink(),
     * which escapes the URL and label separately rather than through
     * paragraph()'s esc(), which would turn a raw <a> into visible markup.
     */
    unsubscribeLine: string;
    unsubscribeCta: string;
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
  paymentFailed: {
    subject: (orderNumber) => `Payment did not go through — ${orderNumber}`,
    heading: 'Payment did not go through',
    intro: (orderNumber) =>
      `Your payment for order ${orderNumber} could not be completed. Please try again, or reply to this email and we will help sort it out.`,
    cta: 'Try again',
  },
  welcome: {
    subject: `Welcome to ${BRAND.identity.shortName}`,
    heading: 'Your account is ready',
    intro: (name) =>
      `Hi ${name}, your account is ready. You can now save your measurements, track orders and check out faster next time.`,
    cta: 'Start shopping',
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
      RETURNED: 'returned',
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
  orderShipped: {
    subject: (orderNumber) => `${orderNumber} is on its way`,
    heading: 'Your order is on its way',
    intro: (orderNumber) =>
      `Order ${orderNumber} has left our workshop and is with the courier. It may take a day or two to reach you, and the courier may call to confirm delivery before it arrives.`,
  },
  orderDelivered: {
    subject: (orderNumber) => `${orderNumber} has been delivered`,
    heading: 'Delivered!',
    intro: (orderNumber) => `Order ${orderNumber} has been delivered.`,
    note: 'We hope you love it. If anything is not right, just reply to this email and we will sort it out.',
  },
  orderCancelled: {
    subject: (orderNumber) => `${orderNumber} has been cancelled`,
    heading: 'Your order was cancelled',
    intro: (orderNumber) => `Order ${orderNumber} has been cancelled.`,
    refundNote:
      'Your payment for this order will be refunded. Our team will process it manually to your original payment method — you will get a separate email once it is done.',
  },
  paymentRefunded: {
    subject: (orderNumber) => `Refund processed for ${orderNumber}`,
    heading: 'Your refund has been processed',
    intro: (orderNumber, amount) =>
      `We have processed a refund of ${amount} for order ${orderNumber}. Depending on your bank, it can take a few business days to appear.`,
  },
  passwordChanged: {
    subject: 'Your password was changed',
    heading: 'Your password was changed',
    intro:
      'Your password was just changed. If this was you, no action is needed. If it was not, contact us right away — reply to this email.',
  },
  passwordReset: {
    subject: 'Reset your password',
    heading: 'Reset your password',
    intro:
      'We received a request to reset your password. Click the button below to choose a new one. If you did not request this, you can ignore this email.',
    cta: 'Reset password',
    expiry: 'This link expires in one hour.',
  },
  emailVerification: {
    subject: 'Confirm your email address',
    heading: 'Confirm your email address',
    intro: 'Click the button below to confirm this is your email address.',
    cta: 'Confirm email',
  },
  shopNow: 'Shop now',
  marketing: {
    abandonedCartFirstTouch: {
      subject: 'Still in your cart',
      heading: 'You left this behind',
      intro: 'Just a quick nudge — these items are still saved in your cart.',
      cta: 'View your cart',
    },
    abandonedCartReminder: {
      subject: 'You left something in your cart',
      heading: 'Still thinking it over?',
      intro: 'You left these items in your cart. They are still here whenever you are ready.',
      cta: 'Return to your cart',
    },
    abandonedCartIncentive: {
      subject: 'A little something to complete your order',
      heading: 'Your cart, with a discount',
      intro:
        'Your items are still waiting. Here is a discount to help you complete your order.',
      cta: 'Complete your order',
      discountTitle: 'Your discount',
      discountBody: (label) => `Use this code at checkout: ${label}`,
    },
    abandonedBrowse: {
      subject: 'Still interested in these?',
      heading: 'Pick up where you left off',
      intro: 'You looked at these recently. They are still available.',
      cta: 'Continue browsing',
    },
    reviewRequest: {
      subject: 'How was your order?',
      heading: "We'd love your feedback",
      intro: (orderNumber) =>
        `Your order ${orderNumber} was delivered a little while ago. We'd love to hear how it went — just reply to this email and let us know.`,
      cta: 'View your order',
    },
    crossSell: {
      subject: 'You might also like these',
      heading: 'Picked for you',
      intro: 'Based on what you have shopped for, these might be worth a look.',
      introBasedOn: (basedOn) => `Since you bought ${basedOn}, these might be worth a look.`,
      cta: 'Shop the picks',
    },
    replenishment: {
      subject: (productName) => `Running low on ${productName}?`,
      heading: 'Time for a restock?',
      intro: (productName) =>
        `It has been a while since you ordered ${productName}. If you are running low, it is one click away.`,
      cta: 'Order again',
    },
    campaign: {
      holidayBadge: 'Sale',
      launchBadge: 'New arrival',
      flashSaleBadge: 'Limited time',
      expiresNote: (expiresAt) => `Offer ends ${expiresAt}.`,
    },
    unsubscribeLine: "Don't want emails like this?",
    unsubscribeCta: 'Unsubscribe',
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
  paymentFailed: {
    subject: (orderNumber) => `ادائیگی مکمل نہیں ہوئی — ${orderNumber}`,
    heading: 'ادائیگی مکمل نہیں ہوئی',
    intro: (orderNumber) =>
      `آپ کے آرڈر ${orderNumber} کی ادائیگی مکمل نہیں ہو سکی۔ براہِ کرم دوبارہ کوشش کریں، یا اس ای میل کا جواب دیں اور ہم مدد کریں گے۔`,
    cta: 'دوبارہ کوشش کریں',
  },
  welcome: {
    subject: 'یاسین میں خوش آمدید',
    heading: 'آپ کا اکاؤنٹ تیار ہے',
    intro: (name) =>
      `السلام علیکم ${name}، آپ کا اکاؤنٹ تیار ہے۔ اب آپ اپنی پیمائشیں محفوظ کر سکتے ہیں، آرڈرز ٹریک کر سکتے ہیں اور اگلی بار تیزی سے چیک آؤٹ کر سکتے ہیں۔`,
    cta: 'خریداری شروع کریں',
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
      RETURNED: 'واپس کر دیا گیا ہے',
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
  orderShipped: {
    subject: (orderNumber) => `${orderNumber} روانہ ہو چکا ہے`,
    heading: 'آپ کا آرڈر روانہ ہو چکا ہے',
    intro: (orderNumber) =>
      `آرڈر ${orderNumber} ہماری ورکشاپ سے نکل کر کورئیر کے پاس پہنچ چکا ہے۔ آپ تک پہنچنے میں ایک یا دو دن لگ سکتے ہیں، اور کورئیر ڈیلیوری سے پہلے تصدیق کے لیے کال کر سکتا ہے۔`,
  },
  orderDelivered: {
    subject: (orderNumber) => `${orderNumber} پہنچا دیا گیا`,
    heading: 'ڈیلیور ہو گیا!',
    intro: (orderNumber) => `آرڈر ${orderNumber} آپ تک پہنچا دیا گیا ہے۔`,
    note: 'امید ہے آپ کو پسند آئے گا۔ اگر کچھ ٹھیک نہیں تو اس ای میل کا جواب دیں، ہم درست کر دیں گے۔',
  },
  orderCancelled: {
    subject: (orderNumber) => `${orderNumber} منسوخ کر دیا گیا`,
    heading: 'آپ کا آرڈر منسوخ ہو گیا',
    intro: (orderNumber) => `آرڈر ${orderNumber} منسوخ کر دیا گیا ہے۔`,
    refundNote:
      'اس آرڈر کی ادائیگی آپ کو واپس کر دی جائے گی۔ ہماری ٹیم اسے آپ کے اصل ادائیگی کے طریقے پر دستی طور پر واپس کرے گی — مکمل ہونے پر آپ کو الگ ای میل موصول ہو گی۔',
  },
  paymentRefunded: {
    subject: (orderNumber) => `${orderNumber} کی رقم واپس کر دی گئی`,
    heading: 'آپ کی رقم واپس کر دی گئی ہے',
    intro: (orderNumber, amount) =>
      `ہم نے آرڈر ${orderNumber} کے لیے ${amount} کی رقم واپس کر دی ہے۔ آپ کے بینک کے مطابق اسے ظاہر ہونے میں چند کاروباری دن لگ سکتے ہیں۔`,
  },
  passwordChanged: {
    subject: 'آپ کا پاس ورڈ تبدیل کر دیا گیا',
    heading: 'آپ کا پاس ورڈ تبدیل کر دیا گیا',
    intro:
      'ابھی آپ کا پاس ورڈ تبدیل کیا گیا ہے۔ اگر یہ آپ نے کیا تو کوئی کارروائی درکار نہیں۔ اگر نہیں تو فوراً ہم سے رابطہ کریں — اس ای میل کا جواب دیں۔',
  },
  passwordReset: {
    subject: 'اپنا پاس ورڈ ری سیٹ کریں',
    heading: 'اپنا پاس ورڈ ری سیٹ کریں',
    intro:
      'ہمیں آپ کے پاس ورڈ کو ری سیٹ کرنے کی درخواست موصول ہوئی ہے۔ نیا پاس ورڈ منتخب کرنے کے لیے نیچے دیے گئے بٹن پر کلک کریں۔ اگر یہ درخواست آپ نے نہیں کی تو اس ای میل کو نظر انداز کریں۔',
    cta: 'پاس ورڈ ری سیٹ کریں',
    expiry: 'یہ لنک ایک گھنٹے میں ختم ہو جائے گا۔',
  },
  emailVerification: {
    subject: 'اپنا ای میل ایڈریس تصدیق کریں',
    heading: 'اپنا ای میل ایڈریس تصدیق کریں',
    intro: 'یہ تصدیق کرنے کے لیے کہ یہ آپ کا ای میل ایڈریس ہے، نیچے دیے گئے بٹن پر کلک کریں۔',
    cta: 'ای میل تصدیق کریں',
  },
  shopNow: 'ابھی خریداری کریں',
  marketing: {
    abandonedCartFirstTouch: {
      subject: 'ابھی تک آپ کے کارٹ میں',
      heading: 'آپ یہ چھوڑ گئے',
      intro: 'بس ایک مختصر یاد دہانی — یہ اشیاء ابھی تک آپ کے کارٹ میں محفوظ ہیں۔',
      cta: 'اپنا کارٹ دیکھیں',
    },
    abandonedCartReminder: {
      subject: 'آپ نے اپنے کارٹ میں کچھ چھوڑ دیا',
      heading: 'ابھی تک سوچ رہے ہیں؟',
      intro: 'آپ نے یہ اشیاء اپنے کارٹ میں چھوڑی ہیں۔ جب آپ تیار ہوں یہ یہیں موجود ہیں۔',
      cta: 'اپنے کارٹ پر واپس جائیں',
    },
    abandonedCartIncentive: {
      subject: 'آپ کا آرڈر مکمل کرنے کے لیے ایک تحفہ',
      heading: 'آپ کا کارٹ، رعایت کے ساتھ',
      intro: 'آپ کی اشیاء ابھی تک موجود ہیں۔ آرڈر مکمل کرنے میں مدد کے لیے یہ رعایت حاضر ہے۔',
      cta: 'اپنا آرڈر مکمل کریں',
      discountTitle: 'آپ کی رعایت',
      discountBody: (label) => `چیک آؤٹ پر یہ کوڈ استعمال کریں: ${label}`,
    },
    abandonedBrowse: {
      subject: 'کیا آپ اب بھی ان میں دلچسپی رکھتے ہیں؟',
      heading: 'جہاں سے چھوڑا تھا وہیں سے شروع کریں',
      intro: 'آپ نے حال ہی میں یہ دیکھی تھیں۔ یہ اب بھی دستیاب ہیں۔',
      cta: 'خریداری جاری رکھیں',
    },
    reviewRequest: {
      subject: 'آپ کا آرڈر کیسا رہا؟',
      heading: 'ہمیں آپ کی رائے چاہیے',
      intro: (orderNumber) =>
        `آپ کا آرڈر ${orderNumber} کچھ عرصہ پہلے پہنچایا گیا تھا۔ ہمیں بتانے کے لیے بس اس ای میل کا جواب دیں۔`,
      cta: 'اپنا آرڈر دیکھیں',
    },
    crossSell: {
      subject: 'آپ کو یہ بھی پسند آ سکتی ہیں',
      heading: 'آپ کے لیے منتخب',
      intro: 'آپ کی خریداری کی بنیاد پر، یہ اشیاء دیکھنے کے قابل ہو سکتی ہیں۔',
      introBasedOn: (basedOn) =>
        `چونکہ آپ نے ${basedOn} خریدا، یہ اشیاء دیکھنے کے قابل ہو سکتی ہیں۔`,
      cta: 'منتخب اشیاء دیکھیں',
    },
    replenishment: {
      subject: (productName) => `${productName} ختم ہونے والا ہے؟`,
      heading: 'دوبارہ اسٹاک کرنے کا وقت؟',
      intro: (productName) =>
        `آپ کو ${productName} خریدے کچھ عرصہ ہو گیا ہے۔ اگر ختم ہو رہا ہے تو ایک کلک پر دوبارہ منگوائیں۔`,
      cta: 'دوبارہ آرڈر کریں',
    },
    campaign: {
      holidayBadge: 'سیل',
      launchBadge: 'نیا',
      flashSaleBadge: 'محدود وقت',
      expiresNote: (expiresAt) => `پیشکش ${expiresAt} کو ختم ہو رہی ہے۔`,
    },
    unsubscribeLine: 'اس طرح کی ای میلز نہیں چاہیے؟',
    unsubscribeCta: 'سبسکرپشن ختم کریں',
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
