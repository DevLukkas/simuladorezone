import { cardById, cardExists } from '../data/cards.ts';
import type { Card, Element } from '../data/types.ts';

/**
 * As contas que a moldura faz sobre um baralho: espalhar as cópias e medir a
 * proporção de elementos.
 *
 * Vivem fora das telas porque três as fazem — o hub (leitura do baralho ativo),
 * o construtor (mosaico, curva e mão simulada) e a mão simulada em si —, e uma
 * cópia por tela é como o mosaico e a fita começariam a discordar.
 */

/** o baralho carta a carta: 3 cópias viram 3 entradas; id apagado no estúdio some */
export function expandDeck(cards: Record<number, number>): Card[] {
  const out: Card[] = [];
  for (const [id, amount] of Object.entries(cards)) {
    if (!cardExists(Number(id))) continue;
    for (let copy = 0; copy < amount; copy++) out.push(cardById(Number(id)));
  }
  return out;
}

/** elemento → quantidade, do mais presente ao menos */
export function countByElement(cards: readonly Card[]): [Element, number][] {
  const counted = new Map<Element, number>();
  for (const card of cards) counted.set(card.element, (counted.get(card.element) ?? 0) + 1);
  return [...counted.entries()].sort((a, b) => b[1] - a[1]);
}
