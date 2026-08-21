import { describe, expect, test } from 'vitest';
import { createMatch } from '../../engine/createMatch.ts';
import { reduce } from '../../engine/reduce.ts';
import { decideCommand } from '../../engine/bot.ts';
import { testDeck } from '../../engine/__tests__/helpers.ts';
import { eventsOfFrame, frameOfState, viewOfFrame, type TapeFrame } from '../tape.ts';
import type { Command } from '../../engine/commands.ts';

/**
 * A fita (decisão nº 44): a partida virada DADO.
 *
 * O que se cobra aqui é o contrato dela — a gravação copia (o quadro não pode
 * mudar quando a partida continua), a leitura esconde o que tem de esconder
 * (invariante 4) e tocar não consulta regra nenhuma.
 */

const DECKS = {
  a: { hero: 'badur', cards: testDeck([1, 2, 5, 6, 9, 10, 28, 29, 31, 38, 44]) },
  b: { hero: 'ispisher', cards: testDeck([1, 2, 5, 6, 9, 10, 28, 29, 31, 38, 44]) },
};

/** Grava uma partida inteira do jeito que o servidor a grava: quadro por comando. */
function record(seed: number): TapeFrame[] {
  const created = createMatch({ seed, decks: DECKS });
  let state = created.state;
  const frames: TapeFrame[] = [frameOfState(state, null, created.events)];

  while (!state.winner && state.turn <= 300) {
    const side = state.pending?.side ?? (state.phase === 'mulligan' ? 'a' : state.activeSide);
    const command: Command | null =
      decideCommand(state, side) ?? decideCommand(state, side === 'a' ? 'b' : 'a');
    if (!command) break;
    const result = reduce(state, command);
    if (result.error) break;
    state = result.state;
    frames.push(frameOfState(state, command, result.events));
  }
  return frames;
}

describe('fita da partida', () => {
  const frames = record(20260820);

  test('grava um quadro por passo, da abertura ao desfecho', () => {
    expect(frames.length).toBeGreaterThan(20);
    expect(frames[0]!.command).toBeNull();
    expect(frames[0]!.events[0]?.type).toBe('MATCH_STARTED');
    expect(frames[1]!.command).not.toBeNull();
    expect(frames[frames.length - 1]!.winner).not.toBeNull();
  });

  test('o quadro é cópia: a partida seguir não reescreve o passado', () => {
    // o quadro 1 tem as mãos iniciais; no fim da partida elas já foram jogadas
    const opening = frames[0]!;
    const ending = frames[frames.length - 1]!;
    expect(opening.turn).toBe(1);
    expect(opening.phase).toBe('mulligan');
    expect(opening.winner).toBeNull();
    expect(ending.turn).toBeGreaterThan(1);
    // e o campo do começo continua vazio, mesmo com criaturas em campo no fim
    expect(opening.sides.a.field.every((slot) => slot === null)).toBe(true);
  });

  test('tocar não consulta regra: quadro solto vira tabuleiro sozinho', () => {
    // nem seed, nem decks, nem comandos — só o quadro
    const frame = frames[Math.floor(frames.length / 2)]!;
    const view = viewOfFrame(frame, 'a');
    expect(view.turn).toBe(frame.turn);
    expect(view.phase).toBe(frame.phase);
    expect(view.me.hero).toBe('badur');
    expect(view.opponent.hero).toBe('ispisher');
  });

  test('a leitura redige: a mão do oponente é contagem, nunca carta', () => {
    for (const frame of frames) {
      for (const side of ['a', 'b'] as const) {
        const view = viewOfFrame(frame, side);
        expect(view.opponent).not.toHaveProperty('hand');
        expect(view.opponent.handCount).toBe(frame.sides[side === 'a' ? 'b' : 'a'].hand.length);
        // a mão do DONO da visão continua inteira: é a partida dele
        expect(view.me.hand).toEqual(frame.sides[side].hand);
        // partida gravada não pergunta nada a ninguém
        expect(view.pending).toBeNull();
        expect(view.waitingForOpponent).toBe(false);
      }
    }
  });

  test('a compra do oponente sai sem a carta, e a minha não', () => {
    const drawnByB = frames
      .flatMap((frame) => eventsOfFrame(frame, 'a'))
      .filter((event) => event.type === 'CARD_DRAWN' && event.side === 'b');
    expect(drawnByB.length).toBeGreaterThan(0);
    for (const event of drawnByB) expect(event).not.toHaveProperty('card');

    const drawnByA = frames
      .flatMap((frame) => eventsOfFrame(frame, 'a'))
      .filter((event) => event.type === 'CARD_DRAWN' && event.side === 'a');
    expect(drawnByA.some((event) => 'card' in event)).toBe(true);
  });

  test('a fita guarda a verdade inteira: quem redige é a saída, não o disco', () => {
    // as duas mãos estão gravadas — é o que permite depurar a partida depois
    expect(frames[0]!.sides.a.hand.length).toBeGreaterThan(0);
    expect(frames[0]!.sides.b.hand.length).toBeGreaterThan(0);
    expect(frames[0]!.events.some((event) => event.type === 'CARD_DRAWN' && 'card' in event)).toBe(
      true,
    );
  });

  test('sobrevive a ida e volta por JSON — é assim que ela vai para o disco', () => {
    const roundTrip = JSON.parse(JSON.stringify(frames)) as TapeFrame[];
    expect(JSON.stringify(roundTrip)).toBe(JSON.stringify(frames));
    expect(viewOfFrame(roundTrip[3]!, 'a')).toEqual(viewOfFrame(frames[3]!, 'a'));
  });
});
