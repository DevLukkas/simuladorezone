import type { Card, CardStatus } from './types.ts';
import { creatures } from './creatures.ts';
import { abilities } from './abilities.ts';
import { items } from './items.ts';
import { commands } from './commands.ts';
import { scenarios } from './scenarios.ts';

/**
 * Catálogo completo, ordenado por id. Não há divisão por formato (decisão
 * nº 36): a edição diz de onde a carta veio — o clássico ocupa 1..45 e o Quatro
 * Elementos começa em 46 —, mas as duas procedências jogam no mesmo pool.
 *
 * Isto é o catálogo INTEIRO, esteira e tudo: rascunho, em revisão, publicada e
 * arquivada (decisão nº 41). Quem quer o que vale em jogo pede `PLAYABLE_CARDS`
 * — `ALL_CARDS` serve o estúdio, que precisa ver o que ainda não estreou, e
 * `cardById`, que precisa achar carta de qualquer situação (uma partida antiga
 * pode ter em campo uma carta que acabou de ser arquivada).
 */
export const ALL_CARDS: readonly Card[] = [
  ...creatures,
  ...abilities,
  ...items,
  ...commands,
  ...scenarios,
].sort((a, b) => a.id - b.id);

/**
 * Em que situação a carta está. Campo ausente é `published`: as 78 cartas que
 * já estavam no jogo antes da esteira não passaram por ela (ver `CardStatus`).
 */
export function cardStatus(card: Card): CardStatus {
  return card.status ?? 'published';
}

/**
 * O que o JOGO enxerga: só o que está publicado.
 *
 * Coleção, construtor de baralho e validação de deck leem daqui. Carta em
 * rascunho existe no arquivo e no estúdio, e é como se não existisse para quem
 * está jogando — é isso que permite escrever carta nova com o servidor no ar
 * sem ela vazar para uma partida pela metade.
 */
export const PLAYABLE_CARDS: readonly Card[] = ALL_CARDS.filter(
  (card) => cardStatus(card) === 'published',
);

const porId = new Map<number, Card>(ALL_CARDS.map((card) => [card.id, card]));

export function cardById(id: number): Card {
  const card = porId.get(id);
  if (!card) throw new Error(`Carta inexistente: ${id}`);
  return card;
}

export function cardExists(id: number): boolean {
  return porId.has(id);
}

/** existe E está publicada: a pergunta que a construção de deck faz */
export function cardPlayable(id: number): boolean {
  const card = porId.get(id);
  return card !== undefined && cardStatus(card) === 'published';
}
