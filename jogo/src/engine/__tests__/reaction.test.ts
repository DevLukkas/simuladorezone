import { describe, expect, test } from 'vitest';
import { reduce } from '../reduce.ts';
import { oppositeSide } from '../state.ts';
import type { GameState, SideId } from '../state.ts';
import {
  attachDirectly,
  applyOk,
  placeCreature,
  goToBattle,
  readyMatch,
  putInHand,
  answerOk,
} from './helpers.ts';

/** Invoca uma criatura qualquer pelo lado ativo, no slot 0. */
function summonByActive(state: GameState): { state: GameState; active: SideId; reactingSide: SideId } {
  const active = state.activeSide;
  const uid = putInHand(state, active, 1);
  return {
    state: applyOk(state, { type: 'SUMMON', side: active, cardUid: uid, slot: 0 }),
    active,
    reactingSide: oppositeSide(active),
  };
}

describe('janela de reação com comandos', () => {
  test('invocação abre a janela para o oponente com comando na mão; recusar não muda nada', () => {
    const base = readyMatch();
    const commandUid = putInHand(base, oppositeSide(base.activeSide), 22); // Escolha as Cegas
    const { state, reactingSide } = summonByActive(base);

    expect(state.pending?.reaction).toBe(true);
    expect(state.pending?.side).toBe(reactingSide);
    expect(state.pending?.options.map((option) => option.id)).toEqual([commandUid]);

    const result = reduce(state, {
      type: 'ANSWER',
      side: reactingSide,
      pendingId: state.pending!.id,
      optionId: 'decline',
    });
    expect(result.error).toBeUndefined();
    expect(result.events.some((event) => event.type === 'REACTION_DECLINED')).toBe(true);
    expect(result.state.pending).toBeNull();
    expect(result.state.sides[reactingSide].hand.some((card) => card.uid === commandUid)).toBe(true);
  });

  test('reagir com comando sem alvo resolve na hora e não reabre janela', () => {
    const base = readyMatch();
    const commandUid = putInHand(base, oppositeSide(base.activeSide), 22);
    const { state, reactingSide } = summonByActive(base);

    const result = reduce(state, {
      type: 'ANSWER',
      side: reactingSide,
      pendingId: state.pending!.id,
      optionId: commandUid,
    });
    expect(result.error).toBeUndefined();
    expect(result.events.some((event) => event.type === 'COMMAND_PLAYED')).toBe(true);
    expect(result.state.pending).toBeNull();
    expect(result.state.sides[reactingSide].discard.some((card) => card.uid === commandUid)).toBe(
      true,
    );
  });

  test('reagir com comando que exige alvo pede o alvo e aplica o efeito', () => {
    const base = readyMatch();
    const commandUid = putInHand(base, oppositeSide(base.activeSide), 21); // Riso Histérico
    let { state } = summonByActive(base);
    const active = oppositeSide(state.pending!.side);

    state = answerOk(state, commandUid);
    expect(state.pending?.type).toBe('choose_target');
    expect(state.pending?.reaction).toBe(true);

    state = answerOk(state, `${active}:0`);
    expect(state.pending).toBeNull();
    expect(state.sides[active].field[0]?.cannotAttackUntilTurn).toBe(state.turn);
  });

  test('sem comando jogável na mão do oponente, nenhuma janela abre', () => {
    const { state } = summonByActive(readyMatch());
    expect(state.pending).toBeNull();
  });

  test('comando cujo alvo obrigatório não existe fica fora da oferta', () => {
    const base = readyMatch();
    // Ritual da Esfera exige criatura própria do reator — ele não tem nenhuma
    putInHand(base, oppositeSide(base.activeSide), 25);
    const { state } = summonByActive(base);
    expect(state.pending).toBeNull();
  });

  test('ataque abre a janela depois de o combate resolver', () => {
    let state = readyMatch();
    const active = state.activeSide;
    const reactingSide = oppositeSide(active);
    placeCreature(state, active, 0, 1);
    putInHand(state, reactingSide, 22);
    state = goToBattle(state, active);

    const result = reduce(state, { type: 'ATTACK', side: active, slot: 0 });
    expect(result.error).toBeUndefined();
    expect(result.events.some((event) => event.type === 'DIRECT_DAMAGE')).toBe(true);
    expect(result.state.pending?.reaction).toBe(true);
    expect(result.state.pending?.side).toBe(reactingSide);
  });

  test('com a janela aberta, o dono do turno fica travado até a resposta', () => {
    const base = readyMatch();
    putInHand(base, oppositeSide(base.activeSide), 22);
    const nextSummon = putInHand(base, base.activeSide, 1);
    const { state, active, reactingSide } = summonByActive(base);
    expect(state.pending?.side).toBe(reactingSide);

    // quem abriu a janela não joga mais nada enquanto o outro decide
    for (const command of [
      { type: 'SUMMON', side: active, cardUid: nextSummon, slot: 1 },
      { type: 'ADVANCE_PHASE', side: active },
      { type: 'END_TURN', side: active },
    ] as const) {
      expect(reduce(state, command).error).toBe('pending_choice');
    }
    // e nem responde no lugar de quem tem a escolha
    expect(
      reduce(state, {
        type: 'ANSWER',
        side: active,
        pendingId: state.pending!.id,
        optionId: 'decline',
      }).error,
    ).toBe('choice_not_yours');

    // recusada a janela, o turno volta a andar
    const freed = reduce(state, {
      type: 'ANSWER',
      side: reactingSide,
      pendingId: state.pending!.id,
      optionId: 'decline',
    });
    expect(freed.error).toBeUndefined();
    expect(reduce(freed.state, { type: 'END_TURN', side: active }).error).toBeUndefined();
  });

  test('TEMPO_ESGOTADO recusa a janela aberta e encerra o turno', () => {
    const base = readyMatch();
    putInHand(base, oppositeSide(base.activeSide), 22);
    const { state, active, reactingSide } = summonByActive(base);
    expect(state.pending?.reaction).toBe(true);

    const result = reduce(state, { type: 'TIME_OUT' });
    expect(result.error).toBeUndefined();
    expect(result.events.some((event) => event.type === 'REACTION_DECLINED')).toBe(true);
    expect(result.state.pending).toBeNull();
    expect(result.state.activeSide).toBe(reactingSide);
    expect(result.state.activeSide).not.toBe(active);
  });
});

describe('janela de reação com habilidades de criatura', () => {
  test('início da batalha oferece ativar Mysticus (custo: Tridente anexado)', () => {
    let state = readyMatch();
    const active = state.activeSide;
    const reactingSide = oppositeSide(active);
    const mysticus = placeCreature(state, reactingSide, 2, 3);
    attachDirectly(mysticus, 9); // Tridente Poderoso de Atlas

    state = applyOk(state, { type: 'ADVANCE_PHASE', side: active });
    expect(state.pending?.reaction).toBe(true);
    expect(state.pending?.side).toBe(reactingSide);
    expect(state.pending?.options.map((option) => option.id)).toEqual([`${reactingSide}:2`]);

    state = answerOk(state, `${reactingSide}:2`);
    const creature = state.sides[reactingSide].field[2]!;
    expect(creature.cannotAttackUntilTurn).toBe(state.turn + 1);
    expect(creature.attachments).toHaveLength(0);
    expect(state.sides[reactingSide].discard.some((card) => card.cardId === 9)).toBe(true);
  });

  test('sem custo pagável, a criatura não entra na oferta', () => {
    let state = readyMatch();
    const active = state.activeSide;
    placeCreature(state, oppositeSide(active), 2, 3); // Mysticus sem Tridente
    state = applyOk(state, { type: 'ADVANCE_PHASE', side: active });
    expect(state.pending).toBeNull();
  });

  test('habilidade condicionada ao turno do oponente segue bloqueada fora da reação', () => {
    const state = readyMatch();
    const active = state.activeSide;
    const feiticeiro = placeCreature(state, active, 0, 32);
    const result = reduce(state, {
      type: 'ACTIVATE_ABILITY',
      side: active,
      sourceUid: feiticeiro.uid,
      abilityId: 'feiticeiro_tribal_forcar_ataque',
    });
    expect(result.error).toBe('reaction_only_ability');
  });
});
