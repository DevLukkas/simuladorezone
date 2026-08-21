import type { CardStatus, Element, Rarity } from '../data/types.ts';

/**
 * As cores que a INTERFACE usa para falar de elemento e raridade — o filete no
 * topo da criatura em campo, a ficha da carta, o cenário na doca da mão.
 *
 * Não confundir com a carta: lá o elemento é o hexágono desenhado no molde e a
 * raridade é a cor do losango impresso (ver ComposedCard). Aqui é a moldura em
 * volta dela.
 *
 * Vive em TS, e não como token em styles.css, porque toda esta lista entra em
 * `style` calculado — a cor muda carta a carta, e `bg-ez-water` não resolve numa
 * string montada em runtime.
 */
export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#ff7a45',
  water: '#4aa8ff',
  earth: '#8fce4f',
  wind: '#6fded0',
  neutral: '#d9a940',
  void: '#a875f0',
  arcane: '#e46fd0',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#aab8d0',
  rare: '#4aa8ff',
  legendary: '#eec052',
};

/**
 * A cor de cada situação da esteira do estúdio (decisão nº 41). É a mesma leitura
 * do resto do tema: cinza é o que ainda não conta, ouro é o que espera decisão,
 * verde é o que está em ordem e vermelho é o que saiu de circulação.
 */
export const STATUS_COLOR: Record<CardStatus, string> = {
  draft: '#7b8291',
  review: '#e0a33c',
  published: '#63c77b',
  archived: '#e8705c',
};

/**
 * As cores do tema (decisões nº 29 e nº 31) que precisam entrar em `style`
 * calculado — filete de painel selecionado, barra de proporção, cor do herói sem
 * elemento, contorno e brilho de slot no tabuleiro.
 *
 * Mesma razão de `ELEMENT_COLOR` estar aqui: `border-zn-gold` não resolve numa
 * string montada em runtime. Os mesmos valores vivem como token em styles.css.
 */
export const ZN = {
  gold: '#e0a33c',
  goldLight: '#f5c46a',
  goldInk: '#12130f',
  green: '#63c77b',
  greenDeep: '#1d6b4b',
  greenLight: '#8fe8ae',
  red: '#e8705c',
  redDeep: '#7e3328',
  redLight: '#e88070',
  line: '#1d2027',
  edge: '#23262f',
  edgeHi: '#3e4554',
  ink: '#08090b',
  panel: '#0f1115',
  slot: '#2c313b',
  track: '#1a1d24',
  /** o roxo do efeito ativável — a única cor que só o tabuleiro usa */
  spell: '#a875f0',
} as const;

/**
 * A cor do herói é a do elemento dele; Tennor e Morgon não têm elemento no
 * catálogo, e para esses o ouro do tema faz as vezes — sem ele o retrato
 * ficaria sem filete e a lista de heróis perderia a única pista de leitura.
 */
export function heroColor(element: Element | null): string {
  return element ? ELEMENT_COLOR[element] : ZN.gold;
}
