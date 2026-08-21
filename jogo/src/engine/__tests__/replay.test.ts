import { describe, expect, test } from 'vitest';
import { createMatch, type MatchConfig } from '../createMatch.ts';
import { reduce } from '../reduce.ts';
import { decideCommand } from '../bot.ts';
import { replayMatch } from '../replay.ts';
import { testDeck } from './helpers.ts';
import type { Command } from '../commands.ts';
import type { GameEvent } from '../events.ts';
import type { GameState } from '../state.ts';

/**
 * O invariante 1 cobrado em produção: reexecutar seed + decks + comandos devolve
 * a mesma partida, estado a estado e evento a evento.
 *
 * Desde a decisão nº 44 quem faz o replay do histórico é a FITA, não isto — mas
 * é isto que GRAVA a fita do treino, no ato de arquivar. Se quebrar, a partida
 * que o cliente jogou e a que o servidor arquiva deixam de ser a mesma.
 */

const CONFIG: MatchConfig = {
  seed: 20260820,
  decks: {
    a: { hero: 'badur', cards: testDeck([1, 2, 5, 6, 9, 10, 28, 29, 31, 38, 44]) },
    b: { hero: 'ispisher', cards: testDeck([1, 2, 5, 6, 9, 10, 28, 29, 31, 38, 44]) },
  },
};

/** Joga bot vs bot até o fim, guardando o registro do jeito que o servidor guarda. */
function playAndRecord(config: MatchConfig): {
  state: GameState;
  commands: Command[];
  events: GameEvent[];
} {
  const created = createMatch(config);
  let state = created.state;
  const commands: Command[] = [];
  const events: GameEvent[] = [...created.events];

  while (!state.winner && state.turn <= 300) {
    const side = state.pending?.side ?? (state.phase === 'mulligan' ? 'a' : state.activeSide);
    const command =
      decideCommand(state, side) ?? decideCommand(state, side === 'a' ? 'b' : 'a');
    if (!command) throw new Error('bot sem comando fora do fim de jogo');
    const result = reduce(state, command);
    if (result.error) throw new Error(`comando ilegal: ${result.error}`);
    state = result.state;
    commands.push(command);
    events.push(...result.events);
  }
  return { state, commands, events };
}

describe('replay', () => {
  const played = playAndRecord(CONFIG);

  test('a partida gravada termina com vencedor (senão o resto não prova nada)', () => {
    expect(played.state.winner).not.toBeNull();
    expect(played.commands.length).toBeGreaterThan(10);
  });

  test('reexecutar seed + decks + comandos devolve o MESMO estado final', () => {
    const { steps, truncated } = replayMatch(CONFIG, played.commands);
    expect(truncated).toBe(false);
    expect(steps).toHaveLength(played.commands.length + 1);
    expect(JSON.stringify(steps[steps.length - 1]!.state)).toBe(JSON.stringify(played.state));
  });

  test('e os MESMOS eventos, na mesma ordem', () => {
    const { steps } = replayMatch(CONFIG, played.commands);
    const replayed = steps.flatMap((step) => step.events);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(played.events));
  });

  test('o primeiro passo é a abertura, sem comando', () => {
    const { steps } = replayMatch(CONFIG, played.commands);
    expect(steps[0]!.command).toBeNull();
    expect(steps[0]!.events[0]?.type).toBe('MATCH_STARTED');
    expect(steps[1]!.command).toEqual(played.commands[0]);
  });

  test('comando que o motor recusa interrompe em vez de aplicar o resto', () => {
    const corrupted: Command[] = [
      { type: 'ATTACK', side: 'a', slot: 0 },
      ...played.commands,
    ];
    const { steps, truncated } = replayMatch(CONFIG, corrupted);
    expect(truncated).toBe(true);
    // só a abertura sobrou: o ataque na fase de mulligan é recusado de saída
    expect(steps).toHaveLength(1);
  });
});
