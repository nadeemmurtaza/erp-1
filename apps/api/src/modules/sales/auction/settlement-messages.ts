/**
 * What a winner is told, in their language (WO-234.6). Pure and plain text: the
 * email channel wraps it in the branded shell and the other channels send the
 * body as it is, so nothing here depends on markup. Money and times arrive
 * already formatted, because only the caller knows the currency and the zone.
 */
export type NoticeLocale = 'en' | 'ur';

export interface WonNotice {
  lotTitle: string;
  lotNo: number;
  auctionNumber: string;
  hammer: string;
  /** Present only when a premium was charged. */
  premium: string | null;
  total: string;
  orderNumber: string;
  due: string;
}

export interface LapsedNotice {
  lotTitle: string;
  lotNo: number;
  auctionNumber: string;
  orderNumber: string | null;
  due: string;
}

export interface Notice {
  subject: string;
  body: string;
}

export function wonNotice(locale: NoticeLocale, n: WonNotice): Notice {
  if (locale === 'ur') {
    return {
      subject: `آپ نے ${n.lotTitle} جیت لیا`,
      body:
        `آپ نے ${n.auctionNumber} کا لاٹ ${n.lotNo} ${n.hammer} کی بولی سے جیتا ہے۔` +
        (n.premium ? ` خریدار کا پریمیم ${n.premium} اس کے علاوہ ہے۔` : '') +
        ` آپ کو کل ${n.total} ادا کرنے ہیں۔ آرڈر ${n.orderNumber} کی ادائیگی ${n.due} تک کریں، ورنہ یہ جیت ختم ہو جائے گی۔`,
    };
  }
  return {
    subject: `You won ${n.lotTitle}`,
    body:
      `You won lot ${n.lotNo} of ${n.auctionNumber} with a bid of ${n.hammer}.` +
      (n.premium ? ` A buyer's premium of ${n.premium} is added.` : '') +
      ` You owe ${n.total}. Pay order ${n.orderNumber} by ${n.due}, or the win will lapse.`,
  };
}

export function lapsedNotice(locale: NoticeLocale, n: LapsedNotice): Notice {
  const order = n.orderNumber ? ` (آرڈر ${n.orderNumber})` : '';
  if (locale === 'ur') {
    return {
      subject: `${n.lotTitle} کی جیت ختم ہو گئی`,
      body:
        `${n.auctionNumber} کے لاٹ ${n.lotNo} کی ادائیگی${order} ${n.due} تک موصول نہیں ہوئی، اس لیے یہ جیت ختم کر دی گئی ہے اور آپ کے نام ایک اسٹرائیک درج ہوا ہے۔ ` +
        `اگر آپ ادائیگی کر چکے ہیں تو دکان سے رابطہ کریں۔`,
    };
  }
  return {
    subject: `Your win of ${n.lotTitle} has lapsed`,
    body:
      `Payment for lot ${n.lotNo} of ${n.auctionNumber}${n.orderNumber ? ` (order ${n.orderNumber})` : ''} was not received by ${n.due}, ` +
      `so the win has lapsed and a strike has been recorded against you. If you did pay, please contact the shop.`,
  };
}
