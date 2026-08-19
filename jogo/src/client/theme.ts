import type { Element, Rarity } from '../data/types.ts';

/**
 * As cores que a INTERFACE usa para falar de elemento e raridade — a gema no canto
 * da carta na coleção, o halo do hover, a pílula da carta ampliada.
 *
 * Não confundir com a carta: lá o elemento é o hexágono desenhado no molde e a
 * raridade é a cor do losango impresso (ver ComposedCard). Aqui é a moldura em
 * volta, e ela precisa de um valor que dê para pôr num box-shadow.
 *
 * Os mesmos valores vivem como token em styles.css (`--color-ez-water` e cia.);
 * aqui em TS porque halo e gradiente entram em `style` calculado, e `bg-ez-water`
 * não resolve numa string montada em runtime.
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

/** o halo do hover: a cor da raridade rebaixada a véu */
export function rarityHalo(rarity: Rarity): string {
  return `${RARITY_COLOR[rarity]}66`;
}

/**
 * As cores do console (decisão nº 29) que precisam entrar em `style` calculado —
 * filete de painel selecionado, barra de proporção, cor do herói sem elemento.
 *
 * Mesma razão de `ELEMENT_COLOR` estar aqui: `border-zn-gold` não resolve numa
 * string montada em runtime. Os mesmos valores vivem como token em styles.css.
 */
export const ZN = {
  gold: '#e0a33c',
  green: '#63c77b',
  red: '#e8705c',
  line: '#1d2027',
  edge: '#23262f',
  edgeHi: '#3e4554',
  panel: '#0f1115',
  slot: '#2c313b',
  track: '#1a1d24',
} as const;

/**
 * A cor do herói é a do elemento dele; Tennor e Morgon não têm elemento no
 * catálogo, e para esses o ouro do console faz as vezes — sem ele o retrato
 * ficaria sem filete e a lista de heróis perderia a única pista de leitura.
 */
export function heroColor(element: Element | null): string {
  return element ? ELEMENT_COLOR[element] : ZN.gold;
}
