import { beforeEach, describe, expect, test } from 'vitest';
import type { GameEvent } from '../../../engine/events.ts';
import type { CreatureInPlay } from '../../../engine/state.ts';
import { animationBusy, useAnimationStore, whenAnimationIdle } from '../animationStore.ts';

/**
 * A linha do tempo é o contrato de ritmo do cliente (decisão nº 25): um passo por
 * vez, avisos de virada na MESMA fila, e ninguém — modal, relógio ou registro —
 * anda antes de ela esvaziar.
 */

function creature(uid: string, cardId: number): CreatureInPlay {
  return {
    uid,
    cardId,
    damage: 0,
    markers: { attack: 0, defense: 0 },
    temporaryModifiers: [],
    attachments: [],
    summonedOnTurn: 0,
    canAttackFromTurn: 0,
    usedAbilities: {},
  };
}

/** Campo com uma criatura de cada lado no slot 0, para o ataque ter origem e alvo. */
function rememberDuel(): void {
  useAnimationStore.getState().rememberFields([
    { side: 'a', field: [creature('a0', 1), null, null, null, null] },
    { side: 'b', field: [creature('b0', 2), null, null, null, null] },
  ]);
}

const attack: GameEvent = { type: 'ATTACK_DECLARED', side: 'a', slot: 0 };
const destroy: GameEvent = {
  type: 'CREATURE_DESTROYED',
  side: 'b',
  slot: 0,
  uid: 'b0',
  inBattle: true,
  toDiscard: true,
};
const scored: GameEvent = { type: 'SCORED', side: 'a', gained: 1, total: 3 };
const turnStarted: GameEvent = { type: 'TURN_STARTED', side: 'b', turn: 2 };

const discarded = (uid: string, cardId: number): GameEvent => ({
  type: 'CARD_DISCARDED',
  side: 'a',
  card: { uid, cardId },
  reason: 'effect',
});

/** Toca até o fim o que estiver na fila, como a camada faria com o tempo. */
function playAll(): void {
  let guard = 0;
  while (animationBusy() && guard++ < 50) {
    useAnimationStore.getState().finish(useAnimationStore.getState().current!.id);
  }
}

beforeEach(() => {
  useAnimationStore.getState().reset();
  rememberDuel();
});

describe('linha do tempo da animação', () => {
  test('o aviso de virada disputa a mesma fila do lance, na ordem dos eventos', () => {
    useAnimationStore.getState().push([attack, destroy, turnStarted], 'a');

    const kinds: string[] = [];
    let guard = 0;
    while (animationBusy() && guard++ < 50) {
      const current = useAnimationStore.getState().current!;
      kinds.push(current.kind);
      useAnimationStore.getState().finish(current.id);
    }
    expect(kinds).toEqual(['attack', 'destroy', 'announce']);
  });

  test('só um passo toca por vez, e o seguinte espera o fim do anterior', () => {
    useAnimationStore.getState().push([attack, scored], 'a');
    const first = useAnimationStore.getState().current!;
    expect(first.kind).toBe('attack');
    expect(useAnimationStore.getState().queue).toHaveLength(1);

    // enquanto o passo da vez não termina, o outro não sobe
    useAnimationStore.getState().finish(first.id + 999);
    expect(useAnimationStore.getState().current).toBe(first);

    useAnimationStore.getState().finish(first.id);
    expect(useAnimationStore.getState().current?.kind).toBe('score');
    expect(useAnimationStore.getState().queue).toHaveLength(0);
  });

  test('lance que chega no meio entra no fim da fila, não atropela o que toca', () => {
    useAnimationStore.getState().push([attack], 'a');
    const playing = useAnimationStore.getState().current!;
    useAnimationStore.getState().push([scored], 'a');
    expect(useAnimationStore.getState().current).toBe(playing);
    expect(useAnimationStore.getState().queue.map((step) => step.kind)).toEqual(['score']);
  });

  test('whenAnimationIdle só dispara quando o último passo termina', () => {
    let woke = 0;
    useAnimationStore.getState().push([attack, scored], 'a');
    whenAnimationIdle(() => {
      woke += 1;
    });
    expect(woke).toBe(0);

    useAnimationStore.getState().finish(useAnimationStore.getState().current!.id);
    expect(woke).toBe(0);

    useAnimationStore.getState().finish(useAnimationStore.getState().current!.id);
    expect(woke).toBe(1);
    expect(animationBusy()).toBe(false);
  });

  test('com a fila vazia, quem espera roda na hora e uma vez só', () => {
    let woke = 0;
    whenAnimationIdle(() => {
      woke += 1;
    });
    expect(woke).toBe(1);

    useAnimationStore.getState().push([attack], 'a');
    playAll();
    expect(woke).toBe(1);
  });

  /* decisão nº 40: descarte é movimento, e descarte em lote é UM movimento */
  test('descartes seguidos para o mesmo destino viram um passo com todas as cartas', () => {
    useAnimationStore.getState().push([discarded('h1', 5), discarded('h2', 6), discarded('h3', 7)], 'a');

    const current = useAnimationStore.getState().current!;
    expect(current.kind).toBe('discard');
    expect(useAnimationStore.getState().queue).toHaveLength(0);
    expect(current.kind === 'discard' && current.cards.map((card) => card.cardId)).toEqual([
      5, 6, 7,
    ]);
  });

  test('descartes de origens diferentes não se juntam', () => {
    useAnimationStore.getState().push(
      [
        discarded('h1', 5),
        { type: 'CARD_MILLED', side: 'a', card: { uid: 'd1', cardId: 8 } },
      ],
      'a',
    );
    const kinds: string[] = [];
    const froms: string[] = [];
    let guard = 0;
    while (animationBusy() && guard++ < 10) {
      const step = useAnimationStore.getState().current!;
      kinds.push(step.kind);
      if (step.kind === 'discard') froms.push(step.from);
      useAnimationStore.getState().finish(step.id);
    }
    expect(kinds).toEqual(['discard', 'discard']);
    expect(froms).toEqual(['hand:a', 'deck:a']);
  });

  /* decisão nº 39: a espera é para quem NÃO decide — quem decide vê o modal */
  test('a janela de reação só vira pausa para quem não vai responder', () => {
    const window: GameEvent = { type: 'REACTION_WINDOW', side: 'b', category: 'command' };

    useAnimationStore.getState().push([window], 'a');
    expect(useAnimationStore.getState().current?.kind).toBe('thinking');
    playAll();

    useAnimationStore.getState().push([window], 'b');
    expect(useAnimationStore.getState().current).toBeNull();
  });

  /* decisão nº 40: o efeito do herói ganhou passo — antes ele acontecia invisível */
  test('o herói que dispara vira um passo da linha do tempo', () => {
    useAnimationStore
      .getState()
      .push([{ type: 'HERO_ACTIVATED', side: 'a', hero: 'ispisher' }], 'a');
    const step = useAnimationStore.getState().current!;
    expect(step.kind).toBe('hero');
    expect(step.kind === 'hero' && step.mine).toBe(true);
  });

  test('cancelar a espera desliga o aviso; reset() não deixa ninguém pendurado', () => {
    let woke = 0;
    useAnimationStore.getState().push([attack], 'a');
    const cancel = whenAnimationIdle(() => {
      woke += 1;
    });
    cancel();
    playAll();
    expect(woke).toBe(0);

    useAnimationStore.getState().push([attack], 'a');
    whenAnimationIdle(() => {
      woke += 1;
    });
    useAnimationStore.getState().reset();
    expect(animationBusy()).toBe(false);
    expect(woke).toBe(0);
  });
});
