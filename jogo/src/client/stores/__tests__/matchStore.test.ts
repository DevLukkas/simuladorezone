import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useMatchStore } from '../matchStore.ts';
import { useAnimationStore } from '../animationStore.ts';

/**
 * O treino roda o motor DENTRO do cliente, então é aqui — e não no motor — que
 * mora a promessa de "a revanche é com o meu baralho" (decisão nº 40). O bot
 * joga por temporizador; os testes rodam com o relógio falso e não deixam
 * nenhum passo dele correr, que é o suficiente para ver a partida nascer.
 */

beforeEach(() => {
  vi.useFakeTimers();
  useAnimationStore.getState().reset();
});

afterEach(() => {
  useMatchStore.getState().leave();
  vi.clearAllTimers();
  vi.useRealTimers();
});

const myDeck = { hero: 'ispisher', cards: Array.from({ length: 40 }, () => 1) };

describe('treino', () => {
  test('a revanche repete o baralho e o herói da partida anterior', () => {
    const { startTraining } = useMatchStore.getState();

    startTraining(myDeck);
    expect(useMatchStore.getState().view?.me.hero).toBe('ispisher');

    // "jogar de novo" chama sem argumento: era aqui que caía no deck de demonstração
    startTraining();
    const view = useMatchStore.getState().view!;
    expect(view.me.hero).toBe('ispisher');
    expect(view.me.hand.every((card) => card.cardId === 1)).toBe(true);
  });

  test('sem argumento e sem partida anterior, o treino ainda abre', () => {
    useMatchStore.getState().startTraining();
    expect(useMatchStore.getState().view).not.toBeNull();
  });

  test('a partida nova começa o registro do zero, com os eventos dela', () => {
    const { startTraining } = useMatchStore.getState();
    startTraining(myDeck);
    const first = useMatchStore.getState().log.length;

    startTraining(myDeck);
    // o registro NÃO acumula as duas partidas: recomeça com a abertura da nova
    expect(useMatchStore.getState().log).toHaveLength(first);
    expect(useMatchStore.getState().log[0]?.key).toMatch(/^log\.matchStarted/);
    expect(useMatchStore.getState().lastRefusal).toBeNull();
  });
});
