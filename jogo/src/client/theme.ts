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
