import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { I18nManager } from 'react-native';
import type { Locale } from '@newax/shared';
import { MESSAGES, type MessageKey } from './messages';

const STORAGE_KEY = 'yaseen.locale';

interface I18n {
  locale: Locale;
  isRtl: boolean;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  /** Formats a date the way the chosen language writes them. */
  date: (value: string | Date) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'ur') applyLocale(stored, setLocaleState);
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    void AsyncStorage.setItem(STORAGE_KEY, next);
    applyLocale(next, setLocaleState);
  }, []);

  const value = useMemo<I18n>(() => {
    const table = MESSAGES[locale];

    return {
      locale,
      isRtl: locale === 'ur',
      setLocale,
      t: (key, values) => {
        const template = (table[key] ?? MESSAGES.en[key] ?? key) as string;
        if (!values) return template;

        return Object.entries(values).reduce(
          (text, [name, replacement]) => text.split(`{${name}}`).join(String(replacement)),
          template,
        );
      },
      date: (input) =>
        new Date(input).toLocaleDateString(locale === 'ur' ? 'ur-PK' : 'en-PK', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

/**
 * Switching to Urdu flips the whole layout.
 *
 * React Native mirrors natively rather than through CSS, and `forceRTL` only
 * takes full effect after a reload — so the direction is applied here and the
 * app is written with `start`/`end` styles throughout, which mirror correctly
 * either way without a second stylesheet.
 */
function applyLocale(locale: Locale, setLocale: (locale: Locale) => void): void {
  const shouldBeRtl = locale === 'ur';

  if (I18nManager.isRTL !== shouldBeRtl) {
    I18nManager.allowRTL(shouldBeRtl);
    I18nManager.forceRTL(shouldBeRtl);
  }

  setLocale(locale);
}
