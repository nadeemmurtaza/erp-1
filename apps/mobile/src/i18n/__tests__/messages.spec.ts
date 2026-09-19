import { STITCHING_STAGES } from '@newax/shared';
import { MESSAGES } from '../messages';

describe('the message catalogue', () => {
  it('says everything in both languages', () => {
    const english = Object.keys(MESSAGES.en).sort();
    const urdu = Object.keys(MESSAGES.ur).sort();

    // A missing Urdu key does not crash — it falls back to English — which is
    // exactly why it needs a test: nobody would notice.
    expect(urdu).toEqual(english);
  });

  it('has no untranslated Urdu strings left as English', () => {
    // Compared as plain strings: the catalogues are `as const`, so TypeScript
    // would otherwise narrow both sides to literal unions and reject the
    // comparison outright.
    const english = MESSAGES.en as Record<string, string>;
    const untranslated = Object.entries(MESSAGES.ur as Record<string, string>).filter(
      ([key, value]) => value === english[key],
    );

    expect(untranslated).toEqual([]);
  });

  it('names every stitching stage the API can report', () => {
    for (const stage of STITCHING_STAGES) {
      // The array form matters: these keys contain a dot, and the string form
      // would read it as a path into a nested object.
      expect(MESSAGES.en).toHaveProperty([`stage.${stage}`]);
      expect(MESSAGES.ur).toHaveProperty([`stage.${stage}`]);
    }
  });
});
