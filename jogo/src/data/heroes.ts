import type { Hero } from './types.ts';

/**
 * Os 5 heróis (antes semeados numa migration do Laravel legado).
 * Na v1 apenas Ispisher e Badur têm efeito implementado no motor;
 * Tennor, Gimlou e Morgon aguardam design/implementação (ver decisions.md).
 *
 * O que se lê em tela — nome, raça e o texto do efeito — sai do dicionário
 * (`hero.<key>.name`, `.race`, `.effectName`, `.effectText`), nunca daqui.
 */
export const heroes: Hero[] = [
  { key: 'tennor', element: null, img: 'avatar_heroi_tennor.png' },
  { key: 'ispisher', element: 'water', img: 'avatar_heroi_ispisher.png' },
  { key: 'gimlou', element: 'fire', img: 'avatar_heroi_gimlou.png' },
  { key: 'badur', element: 'earth', img: 'avatar_heroi_badur.png' },
  { key: 'morgon', element: null, img: 'avatar_heroi_morgon.png' },
];

export function heroByKey(key: string): Hero | undefined {
  return heroes.find((hero) => hero.key === key);
}
