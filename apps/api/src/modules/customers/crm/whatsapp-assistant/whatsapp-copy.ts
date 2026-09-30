import type { Locale } from '@newax/shared';

/**
 * The assistant's own fixed sentences — the ones sent instead of the model's
 * words whenever this shop cannot safely answer, or has no account on file
 * for the sender at all. House Rule 1: a WhatsApp reply is customer-facing
 * text like any other, so an English-only literal here is exactly the leak
 * the rule forbids, same idiom as notifications/email/copy.ts's own
 * EmailCopy — one interface, two implementations.
 *
 * The assistant's own AI-generated replies already match the customer's
 * language by prompting the model to (see SYSTEM_PROMPT in
 * whatsapp-assistant.service.ts) — these two sentences are the ones sent
 * when there is no model call to ask, so language is picked with a cheap,
 * deterministic heuristic instead: whether the customer's own message
 * contains Urdu script. A customer writing Roman Urdu falls back to
 * English, which is an honest limit of a heuristic, not a silent literal.
 */
export interface WhatsAppAssistantCopy {
  /** No account on file for the sending number — nothing to verify identity against, so nothing more specific is said. */
  unrecognisedNumber: string;
  /** Sent whenever this shop hands the conversation to a person, whatever the reason. */
  handoff: string;
}

const COPY: Record<Locale, WhatsAppAssistantCopy> = {
  en: {
    unrecognisedNumber:
      "We don't have an account on file for this number yet. If you have an order with us, please message from the number you ordered with, or reach out from our website.",
    handoff: "Thanks for reaching out — I've passed this to our team and someone will reply here shortly.",
  },
  ur: {
    unrecognisedNumber:
      'ابھی اس نمبر پر ہمارے پاس کوئی اکاؤنٹ موجود نہیں۔ اگر آپ نے ہم سے آرڈر کیا ہے تو براہ کرم اسی نمبر سے پیغام بھیجیں جس سے آرڈر کیا تھا، یا ہماری ویب سائٹ سے رابطہ کریں۔',
    handoff: 'رابطہ کرنے کا شکریہ — یہ پیغام ہماری ٹیم کو بھیج دیا گیا ہے اور جلد ہی کوئی جواب دے گا۔',
  },
};

const URDU_SCRIPT = /[؀-ۿ]/;

export function detectWhatsAppLocale(text: string): Locale {
  return URDU_SCRIPT.test(text) ? 'ur' : 'en';
}

export function whatsAppAssistantCopy(customerMessage: string): WhatsAppAssistantCopy {
  return COPY[detectWhatsAppLocale(customerMessage)];
}
