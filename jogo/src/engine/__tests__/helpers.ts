import { createMatch, type MatchConfig } from '../createMatch.ts';
import { reduce } from '../reduce.ts';
import type { CreatureInPlay, GameState, SideId } from '../state.ts';

/** Deck simples para testes: repete a lista até dar 40 cartas. */
export function testDeck(ids: number[], size = 40): number[] {
  const cards: number[] = [];
  while (cards.length < size) {
    for (const id of ids) {
      if (cards.length >= size) break;
      cards.push(id);
    }
  }
  return cards;
}

/** Cria a partida e resolve o mulligan (ambos mantêm). */
export function readyMatch(config?: Partial<MatchConfig>): GameState {
  const created = createMatch({
    seed: config?.seed ?? 42,
    decks: config?.decks ?? {
      a: { hero: 'badur', cards: testDeck([1, 2, 5, 6, 28, 29, 30, 36]) },
      b: { hero: 'ispisher', cards: testDeck([1, 2, 5, 6, 28, 29, 30, 36]) },
    },
  });
  let state = created.state;
  for (const side of ['a', 'b'] as const) {
    const result = reduce(state, { type: 'DECIDE_MULLIGAN', side, swap: false });
    if (result.error) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

let testUids = 0;

/** Coloca uma criatura direto no campo (atalho de teste), já apta a atacar. */
export function placeCreature(
  state: GameState,
  side: SideId,
  slot: number,
  cardId: number,
): CreatureInPlay {
  const creature: CreatureInPlay = {
    uid: `teste${++testUids}`,
    cardId,
    damage: 0,
    markers: { attack: 0, defense: 0 },
    temporaryModifiers: [],
    attachments: [],
    summonedOnTurn: 0,
    canAttackFromTurn: 0,
    usedAbilities: {},
  };
  state.sides[side].field[slot] = creature;
  return creature;
}

/** Anexa uma carta direto (atalho de teste, sem passar pela mão). */
export function attachDirectly(creature: CreatureInPlay, cardId: number): void {
  creature.attachments.push({ uid: `teste${++testUids}`, cardId });
}

/** Aplica um comando que DEVE ser aceito; lança se o motor recusar. */
export function applyOk(
  state: GameState,
  command: Parameters<typeof reduce>[1],
): GameState {
  const result = reduce(state, command);
  if (result.error) throw new Error(`Comando recusado: ${result.error}`);
  return result.state;
}

/** Responde a pendência atual; lança se não houver pendência ou o motor recusar. */
export function answerOk(state: GameState, optionId: string): GameState {
  const pending = state.pending;
  if (!pending) throw new Error('Não há pendência para responder.');
  return applyOk(state, {
    type: 'ANSWER',
    side: pending.side,
    pendingId: pending.id,
    optionId,
  });
}

/** Coloca uma carta específica na mão do lado (atalho de teste). */
export function putInHand(state: GameState, side: 'a' | 'b', cardId: number): string {
  const uid = `mao${++testHandUids}`;
  state.sides[side].hand.push({ uid, cardId });
  return uid;
}

let testHandUids = 0;

/** Deixa o lado indicado como ativo, em fase de batalha. */
export function goToBattle(state: GameState, side: SideId): GameState {
  let current = state;
  if (current.activeSide !== side) {
    current = applyOk(current, { type: 'END_TURN', side: current.activeSide });
  }
  return applyOk(current, { type: 'ADVANCE_PHASE', side });
}
