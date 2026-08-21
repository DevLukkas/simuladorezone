import { cardExists, cardPlayable } from './cards.ts';
import { heroByKey } from './heroes.ts';
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
}

/**
 * As regras do CONTEÚDO do baralho: herói, cartas e quantidades.
 *
 * Vive separada do nome porque nem todo baralho que o servidor confere tem um:
 * o registro de treino chega como lista de ids, e nem o baralho do bot nem o de
 * demonstração carregam rótulo. O nome é etiqueta da linha de histórico; o que
 * torna um baralho LEGAL está tudo aqui — e é por isso que esta é a função que
 * todo caminho de entrada precisa chamar.
 */
export function validateDeckContents(hero: string, cards: Record<number, number>): TextRef[] {
  const problems: TextRef[] = [];

  if (!heroByKey(hero)) problems.push(text('deckRule.unknown_hero', { hero }));

  let total = 0;
  for (const [idText, amount] of Object.entries(cards)) {
    const id = Number(idText);
    if (!cardExists(id)) {
      problems.push(text('deckRule.unknown_card', { id }));
      continue;
    }
    // existe no catálogo mas não está publicada (decisão nº 41): não entra em deck
    if (!cardPlayable(id)) {
      problems.push(text('deckRule.unpublished_card', { id }));
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

/** Retorna a lista de problemas, já traduzível; deck válido = lista vazia. */
export function validateDeck(deck: DeckDraft): TextRef[] {
  const problems: TextRef[] = [];

  if (!deck.name.trim()) problems.push(text('deckRule.name_required'));
  problems.push(...validateDeckContents(deck.hero, deck.cards));

  return problems;
}
