import { cardById } from '../data/cards.ts';
import type { GameEvent } from './events.ts';
import {
  STARTING_HAND,
  SLOTS_PER_SIDE,
  type CardInZone,
  type GameState,
  type SideState,
  type SideId,
} from './state.ts';
import { shuffle, randomInt, normalizeSeed } from './rng.ts';

export interface SideDeck {
  hero: string;
  /** ids de catálogo, já validados pelas regras de deck */
  cards: number[];
}

export interface MatchConfig {
  seed: number;
  decks: Record<SideId, SideDeck>;
}

export interface CreatedMatch {
  state: GameState;
  events: GameEvent[];
}

/**
 * Cria a partida: uids determinísticos por lado, embaralha, distribui 5 cartas
 * e sorteia quem começa. A partida abre na fase de mulligan — cada lado decide
 * com DECIDIR_MULLIGAN e o primeiro turno começa quando ambos decidirem.
 */
export function createMatch(config: MatchConfig): CreatedMatch {
  let rng = normalizeSeed(config.seed);
  const events: GameEvent[] = [];

  const roll = randomInt(rng, 0, 1);
  rng = roll.rng;
  const firstSide: SideId = roll.value === 0 ? 'a' : 'b';

  const sides = {} as Record<SideId, SideState>;
  for (const side of ['a', 'b'] as const) {
    const deckConfig = config.decks[side];
    const cards: CardInZone[] = deckConfig.cards.map((cardId, index) => {
      // carta inexistente é erro de programação, não jogada inválida: o servidor
      // valida o deck contra o catálogo antes de chegar aqui
      cardById(cardId);
      return { uid: `${side}${index + 1}`, cardId };
    });
    const shuffled = shuffle(rng, cards);
    rng = shuffled.rng;
    const hand = shuffled.items.slice(0, STARTING_HAND);
    const deck = shuffled.items.slice(STARTING_HAND);

    sides[side] = {
      hero: deckConfig.hero,
      deck,
      hand,
      field: Array.from({ length: SLOTS_PER_SIDE }, () => null),
      scenario: null,
      discard: [],
      exile: [],
      points: 0,
      directDamage: 0,
      actions: { summoned: false, attached: false, scenario: false },
      mulliganDone: false,
      scenarioFlags: {},
    };

    for (const card of hand) {
      events.push({ type: 'CARD_DRAWN', side, card });
    }
  }

  const state: GameState = {
    seed: normalizeSeed(config.seed),
    rng,
    turn: 1,
    phase: 'mulligan',
    activeSide: firstSide,
    sides,
    winner: null,
    pending: null,
    queue: [],
    delayedEffects: [],
    nextUid: 1,
  };

  events.unshift({ type: 'MATCH_STARTED', firstSide, turn: 1 });
  return { state, events };
}
