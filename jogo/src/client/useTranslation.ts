import { useSyncExternalStore } from 'react';
import {
  cardName,
  cardRulesText,
  getLocale,
  hasText,
  resolve,
  resolveParts,
  setLocale,
  subscribeToLocale,
  t,
  tokenName,
  type Locale,
  type TextPart,
} from '../i18n/index.ts';
import type { TextRef } from '../shared/text.ts';

/**
 * Liga o i18n ao React. O idioma vive num módulo (serve testes e código fora de
 * componente); aqui ele vira uma fonte externa para o `useSyncExternalStore`,
 * então trocar de idioma redesenha a árvore inteira sem prop drilling.
 */
export function useTranslation(): {
  t: typeof t;
  /** existe texto para esta chave? (chave montada em runtime, ver `hasText`) */
  hasText: (key: string) => boolean;
  resolve: (ref: TextRef) => string;
  /** a mesma frase do `resolve`, em pedaços etiquetados — ver `resolveParts` */
  resolveParts: (ref: TextRef) => TextPart[];
  cardName: (cardId: number) => string;
  cardRulesText: (cardId: number) => string | null;
  tokenName: (tokenId: string) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
} {
  const locale = useSyncExternalStore(subscribeToLocale, getLocale, getLocale);
  return {
    t,
    hasText,
    resolve,
    resolveParts,
    cardName,
    cardRulesText,
    tokenName,
    locale,
    setLocale,
  };
}
