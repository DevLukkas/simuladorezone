import type { GameEvent } from './events.ts';
import { MAX_HAND, type GameState, type SideId } from './state.ts';
import { randomInt } from './rng.ts';

/**
 * Compra do topo do deck (índice 0). Deck vazio: simplesmente não compra
 * (paridade com o legado — não existe derrota por deck esgotado).
 * Estourou a mão (8): descarta aleatória até caber.
 */
export function drawCards(
  state: GameState,
  side: SideId,
  amount: number,
  events: GameEvent[],
): void {
  const owner = state.sides[side];
  for (let i = 0; i < amount; i++) {
    const card = owner.deck.shift();
    if (!card) return;
    owner.hand.push(card);
    events.push({ type: 'CARD_DRAWN', side, card });
    discardDownToHandLimit(state, side, events);
  }
}

export function discardDownToHandLimit(state: GameState, side: SideId, events: GameEvent[]): void {
  const owner = state.sides[side];
  while (owner.hand.length > MAX_HAND) {
    const roll = randomInt(state.rng, 0, owner.hand.length - 1);
    state.rng = roll.rng;
    const [discarded] = owner.hand.splice(roll.value, 1);
    if (!discarded) return;
    owner.discard.push(discarded);
    events.push({ type: 'HAND_LIMIT_DISCARD', side, card: discarded });
  }
}
