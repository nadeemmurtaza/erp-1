import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ur from '../../messages/ur.json';

/** Every dotted path to a string in a messages tree. */
function paths(tree: unknown, prefix = ''): string[] {
  if (typeof tree === 'string') return [prefix];
  if (tree === null || typeof tree !== 'object') return [];
  return Object.entries(tree).flatMap(([key, value]) => paths(value, prefix ? `${prefix}.${key}` : key));
}

/** The ICU placeholders a message uses, in a stable order, so a translation that drops `{alias}` or renames `{seconds}` is caught. */
function placeholders(message: string): string[] {
  return [...new Set([...message.matchAll(/\{(\w+)(?:,|\})/g)].map((match) => match[1]!))].sort();
}

function at(tree: unknown, path: string): string {
  return path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], tree) as string;
}

describe('the auction messages', () => {
  it('say the same things in English and Urdu: no key is missing in either', () => {
    const english = paths(en.auction).sort();
    const urdu = paths(ur.auction).sort();
    expect(urdu).toEqual(english);
  });

  it('use the same placeholders in both languages, so a name or a number is never lost in translation', () => {
    for (const path of paths(en.auction)) {
      expect({ path, placeholders: placeholders(at(ur.auction, path)) }).toEqual({ path, placeholders: placeholders(at(en.auction, path)) });
    }
  });

  it('leave no message empty', () => {
    for (const path of paths(en.auction)) {
      expect({ path, english: at(en.auction, path).trim() === '' }).toEqual({ path, english: false });
      expect({ path, urdu: at(ur.auction, path).trim() === '' }).toEqual({ path, urdu: false });
    }
  });
});
