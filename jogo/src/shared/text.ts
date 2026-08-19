import type { TextKey } from '../i18n/keys.ts';

/**
 * Texto adiado: o motor e o servidor devolvem a CHAVE e os parâmetros, nunca a
 * frase pronta. Quem escolhe o idioma é o cliente, na hora de desenhar — a mesma
 * partida serve dois jogadores em idiomas diferentes.
 *
 * Só dado: atravessa `structuredClone`, JSON e o event log sem perder nada.
 */
export interface TextRef {
  key: TextKey;
  params?: Record<string, TextParam>;
}

/**
 * Valor de parâmetro. Além de texto e número, pode ser outra referência (frase
 * dentro de frase) ou o apontador para um nome que o catálogo/i18n resolve:
 * `{ card: 31 }` vira "Badur, o Urso Guardião" no idioma do jogador.
 */
export type TextParam = string | number | TextRef | { card: number } | { token: string };

/** Açúcar para montar a referência com a chave conferida pelo compilador. */
export function text(key: TextKey, params?: Record<string, TextParam>): TextRef {
  return params ? { key, params } : { key };
}

/** Nome de uma carta do catálogo, resolvido no idioma de quem lê. */
export function cardRef(cardId: number): { card: number } {
  return { card: cardId };
}

/** Nome de uma ficha (token), que não tem carta no catálogo. */
export function tokenRef(tokenId: string): { token: string } {
  return { token: tokenId };
}
