import { describe, expect, test } from 'vitest';
import {
  REACTION_SECONDS,
  TURN_SECONDS,
  advanceClock,
  newClock,
  type ClockSubject,
} from '../clock.ts';

/**
 * O relato que este arquivo guarda: "sempre que faço uma ação — invocar, anexar —
 * a linha do tempo diminui e volta pra onde tava antes". O prazo do turno era
 * re-armado a cada comando (servidor) e a janela de reação trocava a régua da
 * barra (treino). Aqui o prazo do turno nasce uma vez por turno e é SEGURADO
 * enquanto a reação corre.
 */

function subject(over: Partial<ClockSubject> = {}): ClockSubject {
  return { turn: 1, phase: 'main', activeSide: 'a', pending: null, winner: null, ...over };
}

describe('relógio da partida', () => {
  test('o prazo do turno não recomeça a cada lance', () => {
    const clock = newClock();
    const start = advanceClock(clock, subject(), 1_000);
    expect(start.deadlineMs).toBe(1_000 + TURN_SECONDS * 1000);
    expect(start.reaction).toBe(false);

    // 20 segundos depois, três lances do mesmo turno: o prazo é o MESMO
    for (const now of [21_000, 22_000, 23_000]) {
      const again = advanceClock(clock, subject({ phase: 'battle' }), now);
      expect(again.deadlineMs).toBe(start.deadlineMs);
    }
  });

  test('virar o turno recomeça o prazo cheio', () => {
    const clock = newClock();
    advanceClock(clock, subject(), 1_000);
    const next = advanceClock(clock, subject({ turn: 2, activeSide: 'b' }), 30_000);
    expect(next.deadlineMs).toBe(30_000 + TURN_SECONDS * 1000);
  });

  test('a janela de reação tem prazo próprio e SEGURA o do turno', () => {
    const clock = newClock();
    const turn = advanceClock(clock, subject(), 0);
    expect(turn.deadlineMs).toBe(TURN_SECONDS * 1000);

    // 10s depois o oponente ganha a janela de reação
    const reacting = subject({ pending: { id: 'p1', reaction: true } });
    const window = advanceClock(clock, reacting, 10_000);
    expect(window.reaction).toBe(true);
    expect(window.deadlineMs).toBe(10_000 + REACTION_SECONDS * 1000);

    // ele gasta 5s; o turno volta com os 50s que sobravam, não com 60
    const back = advanceClock(clock, subject(), 15_000);
    expect(back.reaction).toBe(false);
    expect(back.deadlineMs).toBe(15_000 + (TURN_SECONDS - 10) * 1000);
  });

  test('cada janela de reação tem o seu prazo', () => {
    const clock = newClock();
    advanceClock(clock, subject(), 0);
    const first = advanceClock(clock, subject({ pending: { id: 'p1', reaction: true } }), 1_000);
    const same = advanceClock(clock, subject({ pending: { id: 'p1', reaction: true } }), 3_000);
    expect(same.deadlineMs).toBe(first.deadlineMs);

    const second = advanceClock(clock, subject({ pending: { id: 'p2', reaction: true } }), 4_000);
    expect(second.deadlineMs).toBe(4_000 + REACTION_SECONDS * 1000);
  });

  test('escolha SEM reação (a corrente de efeitos) não mexe no prazo do turno', () => {
    const clock = newClock();
    const turn = advanceClock(clock, subject(), 0);
    const choosing = advanceClock(clock, subject({ pending: { id: 'p9' } }), 5_000);
    expect(choosing.reaction).toBe(false);
    expect(choosing.deadlineMs).toBe(turn.deadlineMs);
  });

  test('start:false reconhece a situação sem deixar o prazo correr', () => {
    const clock = newClock();
    const held = advanceClock(clock, subject(), 1_000, { start: false });
    expect(held.deadlineMs).toBe(0);

    // quando a animação esvazia, o prazo começa dali — cheio
    const running = advanceClock(clock, subject(), 4_000);
    expect(running.deadlineMs).toBe(4_000 + TURN_SECONDS * 1000);
  });

  test('partida encerrada não tem prazo', () => {
    const clock = newClock();
    advanceClock(clock, subject(), 0);
    expect(advanceClock(clock, subject({ winner: 'a' }), 1_000).deadlineMs).toBe(0);
  });
});
