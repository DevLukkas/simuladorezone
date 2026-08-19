import type { Card, Format } from './types.ts';
import { FORMAT_BY_EDITION } from './types.ts';
import { creatures } from './creatures.ts';
import { abilities } from './abilities.ts';
import { items } from './items.ts';
import { commands } from './commands.ts';
import { scenarios } from './scenarios.ts';

/**
 * Catálogo completo dos dois formatos, ordenado por id.
 * Clássico ocupa 1..45; Quatro Elementos começa em 46.
 */
export const ALL_CARDS: readonly Card[] = [
  ...creatures,
  ...abilities,
  ...items,
  ...commands,
  ...scenarios,
].sort((a, b) => a.id - b.id);

const porId = new Map<number, Card>(ALL_CARDS.map((card) => [card.id, card]));

export function cardById(id: number): Card {
  const card = porId.get(id);
  if (!card) throw new Error(`Carta inexistente: ${id}`);
  return card;
}

export function cardExists(id: number): boolean {
  return porId.has(id);
}

/** O formato de uma carta é o da sua edição — não há campo redundante na carta. */
export function formatOfCard(card: Card): Format {
  return FORMAT_BY_EDITION[card.edition];
}

export function cardsOfFormat(format: Format): readonly Card[] {
  return ALL_CARDS.filter((card) => formatOfCard(card) === format);
}
