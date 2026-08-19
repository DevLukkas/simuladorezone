import { cardById, cardExists, formatOfCard } from './cards.ts';
import { heroByKey } from './heroes.ts';
import type { Format } from './types.ts';
import { text, type TextRef } from '../shared/text.ts';

/**
 * Regras de construção de deck (mesmos limites do backend legado:
 * DeckController MAX_CARDS/MAX_COPIES + herói obrigatório).
 * Validadas pelo cliente E pelo servidor com esta mesma função.
 */
export const MAX_DECK_CARDS = 40;
export const MAX_COPIES = 3;
/** o legado só exigia deck não-vazio; um mínimo real é decisão de produto pendente */
export const MIN_DECK_CARDS = 1;

export interface DeckDraft {
  name: string;
  hero: string;
  /** id da carta → quantidade */
  cards: Record<number, number>;
  /** ausente = clássico, para decks gravados antes do segundo formato existir */
  format?: Format;
}

/** Retorna a lista de problemas, já traduzível; deck válido = lista vazia. */
export function validateDeck(deck: DeckDraft): TextRef[] {
  const problems: TextRef[] = [];
  const format = deck.format ?? 'classic';

  if (!deck.name.trim()) problems.push(text('deckRule.name_required'));
  if (!heroByKey(deck.hero)) problems.push(text('deckRule.unknown_hero', { hero: deck.hero }));

  let total = 0;
  for (const [idText, amount] of Object.entries(deck.cards)) {
    const id = Number(idText);
    if (!cardExists(id)) {
      problems.push(text('deckRule.unknown_card', { id }));
      continue;
    }
    // formatos não se misturam num mesmo deck: as regras de um não valem no outro
    const formatOfDeckCard = formatOfCard(cardById(id));
    if (formatOfDeckCard !== format) {
      problems.push(
        text('deckRule.wrong_format', {
          id,
          cardFormat: text(`format.${formatOfDeckCard}`),
          deckFormat: text(`format.${format}`),
        }),
      );
      continue;
    }
    if (!Number.isInteger(amount) || amount < 1) {
      problems.push(text('deckRule.invalid_amount', { id }));
      continue;
    }
    if (amount > MAX_COPIES) {
      problems.push(text('deckRule.too_many_copies', { id, amount, max: MAX_COPIES }));
    }
    total += amount;
  }

  if (total > MAX_DECK_CARDS) {
    problems.push(text('deckRule.too_many_cards', { total, max: MAX_DECK_CARDS }));
  }
  if (total < MIN_DECK_CARDS) {
    problems.push(text('deckRule.too_few_cards', { total, min: MIN_DECK_CARDS }));
  }

  return problems;
}
