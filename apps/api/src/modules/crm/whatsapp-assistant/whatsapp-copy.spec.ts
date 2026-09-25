import { detectWhatsAppLocale, whatsAppAssistantCopy } from './whatsapp-copy';

describe('whatsapp-copy', () => {
  describe('detectWhatsAppLocale', () => {
    it('reads English for a message with no Urdu script', () => {
      expect(detectWhatsAppLocale('Where is my order?')).toBe('en');
    });

    it('reads Urdu for a message containing Urdu script', () => {
      expect(detectWhatsAppLocale('میرا آرڈر کہاں ہے؟')).toBe('ur');
    });

    it('reads Urdu when the message mixes scripts', () => {
      expect(detectWhatsAppLocale('order کہاں ہے')).toBe('ur');
    });

    it('falls back to English for Roman Urdu, an honest limit of the heuristic', () => {
      expect(detectWhatsAppLocale('mera order kahan hai')).toBe('en');
    });
  });

  describe('whatsAppAssistantCopy', () => {
    it('never returns an empty string for either language', () => {
      expect(whatsAppAssistantCopy('hi').handoff.length).toBeGreaterThan(0);
      expect(whatsAppAssistantCopy('hi').unrecognisedNumber.length).toBeGreaterThan(0);
      expect(whatsAppAssistantCopy('سلام').handoff.length).toBeGreaterThan(0);
      expect(whatsAppAssistantCopy('سلام').unrecognisedNumber.length).toBeGreaterThan(0);
    });
  });
});
