import { useSyncExternalStore } from 'react';
import {
  cardName,
  cardRulesText,
  getLocale,
  resolve,
  setLocale,
  subscribeToLocale,
  t,
  tokenName,
  type Locale,
} from '../i18n/index.ts';
import type { TextRef } from '../shared/text.ts';

/**
 * Liga o i18n ao React. O idioma vive num módulo (serve testes e código fora de
 * componente); aqui ele vira uma fonte externa para o `useSyncExternalStore`,
 * então trocar de idioma redesenha a árvore inteira sem prop drilling.
 */
export function useTranslation(): {
  t: typeof t;
  resolve: (ref: TextRef) => string;
  cardName: (cardId: number) => string;
  cardRulesText: (cardId: number) => string | null;
  tokenName: (tokenId: string) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
} {
  const locale = useSyncExternalStore(subscribeToLocale, getLocale, getLocale);
  return { t, resolve, cardName, cardRulesText, tokenName, locale, setLocale };
}
