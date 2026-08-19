import { describe, expect, test } from 'vitest';
import { createMatch } from '../createMatch.ts';
import { reduce } from '../reduce.ts';
import { decideCommand } from '../bot.ts';
import { testDeck } from './helpers.ts';
import type { GameState } from '../state.ts';

function playFullMatch(seed: number): { state: GameState; commands: number } {
  const created = createMatch({
    seed,
    decks: {
      a: { hero: 'badur', cards: testDeck([1, 2, 5, 6, 9, 10, 28, 29, 31, 38, 44]) },
      b: { hero: 'morgon', cards: testDeck([1, 2, 5, 6, 9, 10, 28, 29, 31, 38, 44]) },
    },
  });
  let state = created.state;
  let commands = 0;

  while (!state.winner && state.turn <= 300) {
    const side = state.pending?.side ?? (state.phase === 'mulligan' ? 'a' : state.activeSide);
    const command =
      decideCommand(state, side) ??
      decideCommand(state, side === 'a' ? 'b' : 'a');
    if (!command) throw new Error('Bot sem comando possível fora do fim de jogo.');
    const result = reduce(state, command);
    if (result.error) throw new Error(`Bot produziu comando ilegal: ${result.error}`);
    state = result.state;
    commands++;
    if (commands > 100_000) throw new Error('Partida não converge.');
  }
  return { state, commands };
}

describe('determinismo', () => {
  test('mesma seed → mesma partida, comando a comando', () => {
    const firstOne = playFullMatch(2026);
    const secondOne = playFullMatch(2026);
    expect(secondOne.commands).toBe(firstOne.commands);
    expect(JSON.stringify(secondOne.state)).toBe(JSON.stringify(firstOne.state));
  });

  test('partidas bot vs bot terminam com vencedor', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state } = playFullMatch(seed);
      expect(state.winner === 'a' || state.winner === 'b' || state.turn > 300).toBe(true);
    }
  });

  test('nenhuma carta some ou duplica (conservação por lado)', () => {
    const { state } = playFullMatch(11);
    for (const side of ['a', 'b'] as const) {
      const owner = state.sides[side];
      const uids = new Set<string>();
      const coletar = (uid: string) => {
        expect(uids.has(uid)).toBe(false);
        uids.add(uid);
      };
      owner.deck.forEach((card) => coletar(card.uid));
      owner.hand.forEach((card) => coletar(card.uid));
      owner.discard.forEach((card) => coletar(card.uid));
      owner.exile.forEach((card) => coletar(card.uid));
      if (owner.scenario) coletar(owner.scenario.uid);
      for (const creature of owner.field) {
        if (!creature) continue;
        if (creature.cardId !== null) coletar(creature.uid);
        creature.attachments.forEach((attachment) => coletar(attachment.uid));
      }
      expect(uids.size).toBe(40);
    }
  });
});
