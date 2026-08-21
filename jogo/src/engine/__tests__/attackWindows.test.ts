import { describe, expect, test } from 'vitest';
import { reduce } from '../reduce.ts';
import { oppositeSide } from '../state.ts';
import { applyOk, answerOk, placeCreature, putInHand, readyMatch } from './helpers.ts';

/**
 * As janelas de bloqueio (decisão nº 33) e a obrigação de atacar (nº 34).
 *
 * O que estes casos guardam é o relato que os motivou: "usei Alterando as Rotas
 * para minha criatura não ser atacada, e ela foi atacada do mesmo jeito". O
 * bloqueio era gravado no número do turno CORRENTE, e a criatura só é atacada no
 * turno seguinte — a carta vencia antes de valer.
 */

describe('Alterando as Rotas (27): proteção alcança o ataque do oponente', () => {
  test('a criatura protegida não pode ser alvo no turno seguinte', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 0, 31); // Badur, o Urso Guardião 2/5
    placeCreature(state, enemy, 0, 6); // Pirata Afogado
    state.sides[side].hand.length = 0;
    const command = putInHand(state, side, 27);

    state = applyOk(state, {
      type: 'PLAY_COMMAND',
      side,
      cardUid: command,
      target: { side, slot: 0 },
    });
    // vale no turno do adversário, que é quando o ataque aconteceria
    expect(state.sides[side].field[0]!.cannotBeTargetedUntilTurn).toBe(state.turn + 1);

    state = applyOk(state, { type: 'END_TURN', side });
    state = applyOk(state, { type: 'ADVANCE_PHASE', side: enemy });
    const refused = reduce(state, { type: 'ATTACK', side: enemy, slot: 0 });
    expect(refused.error).toBe('cannot_be_attack_target');

    // e vence a tempo: no turno seguinte do dono a proteção já não vale
    state = applyOk(state, { type: 'END_TURN', side: enemy });
    expect(state.sides[side].field[0]!.cannotBeTargetedUntilTurn).toBeLessThan(state.turn);
  });

  test('jogada em reação, no turno do oponente, protege o resto daquele turno', () => {
    let state = readyMatch();
    const active = state.activeSide;
    const defender = oppositeSide(active);
    placeCreature(state, defender, 0, 31);
    state.sides[defender].hand.length = 0;
    const command = putInHand(state, defender, 27); // Alterando as Rotas
    placeCreature(state, active, 0, 6); // atacante já apto, na coluna 0
    const summoned = putInHand(state, active, 1);

    // a invocação do lado ativo abre a janela de reação do defensor
    state = applyOk(state, { type: 'SUMMON', side: active, cardUid: summoned, slot: 1 });
    expect(state.pending?.side).toBe(defender);
    expect(state.pending?.options.map((option) => option.id)).toEqual([command]);
    state = answerOk(state, command);
    state = answerOk(state, `${defender}:0`);

    // ainda é o turno do atacante: a proteção precisa valer AGORA
    expect(state.sides[defender].field[0]!.cannotBeTargetedUntilTurn).toBe(state.turn);
    state = applyOk(state, { type: 'ADVANCE_PHASE', side: active });
    if (state.pending) state = answerOk(state, 'decline');
    expect(reduce(state, { type: 'ATTACK', side: active, slot: 0 }).error).toBe(
      'cannot_be_attack_target',
    );
  });
});

describe('Riso Histérico de Tashaa O (21): impede o ataque da inimiga', () => {
  test('o bloqueio alcança o turno em que a criatura atacaria', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, enemy, 0, 6);
    state.sides[side].hand.length = 0;
    const command = putInHand(state, side, 21);

    state = applyOk(state, {
      type: 'PLAY_COMMAND',
      side,
      cardUid: command,
      target: { side: enemy, slot: 0 },
    });
    expect(state.sides[enemy].field[0]!.cannotAttackUntilTurn).toBe(state.turn + 1);

    state = applyOk(state, { type: 'END_TURN', side });
    state = applyOk(state, { type: 'ADVANCE_PHASE', side: enemy });
    expect(reduce(state, { type: 'ATTACK', side: enemy, slot: 0 }).error).toBe(
      'creature_cannot_attack',
    );
  });
});

describe('Marionete de Guerra (23): a inimiga escolhida é obrigada a atacar', () => {
  test('o turno do dono dela não encerra enquanto ela puder atacar', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, enemy, 0, 6); // Pirata Afogado 2/2
    placeCreature(state, side, 0, 31); // Badur 2/5 na frente dele
    state.sides[side].hand.length = 0;
    const command = putInHand(state, side, 23);

    state = applyOk(state, {
      type: 'PLAY_COMMAND',
      side,
      cardUid: command,
      target: { side: enemy, slot: 0 },
    });
    expect(state.sides[enemy].field[0]!.mustAttackUntilTurn).toBe(state.turn + 1);

    state = applyOk(state, { type: 'END_TURN', side });
    // é o turno do dono da marionete: ele não passa a vez sem atacar
    expect(reduce(state, { type: 'END_TURN', side: enemy }).error).toBe('must_attack_first');

    state = applyOk(state, { type: 'ADVANCE_PHASE', side: enemy });
    expect(reduce(state, { type: 'END_TURN', side: enemy }).error).toBe('must_attack_first');

    state = applyOk(state, { type: 'ATTACK', side: enemy, slot: 0 });
    // atacou: a obrigação está cumprida e o turno pode acabar
    expect(reduce(state, { type: 'END_TURN', side: enemy }).error).toBeUndefined();
  });

  test('sem ataque possível a obrigação não prende ninguém', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    const forced = placeCreature(state, enemy, 0, 6);
    state.sides[side].hand.length = 0;
    const command = putInHand(state, side, 23);

    state = applyOk(state, {
      type: 'PLAY_COMMAND',
      side,
      cardUid: command,
      target: { side: enemy, slot: 0 },
    });
    state = applyOk(state, { type: 'END_TURN', side });
    // a criatura obrigada perdeu o direito de atacar por outro efeito
    state.sides[enemy].field[0]!.cannotAttackUntilTurn = state.turn;
    expect(state.sides[enemy].field[0]!.uid).toBe(forced.uid);
    expect(reduce(state, { type: 'END_TURN', side: enemy }).error).toBeUndefined();
  });

  test('coluna vazia não é alvo: a carta só aceita coluna com criatura', () => {
    const state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    state.sides[side].hand.length = 0;
    const command = putInHand(state, side, 23);

    const refused = reduce(state, {
      type: 'PLAY_COMMAND',
      side,
      cardUid: command,
      target: { side: enemy, slot: 3 },
    });
    expect(refused.error).toBe('target_slot_empty');
    // e a carta continua na mão
    expect(refused.state.sides[side].hand.some((card) => card.uid === command)).toBe(true);
  });
});

describe('Feiticeiro Tribal Badur (32): obriga em reação, no turno do oponente', () => {
  test('a janela de reação da fase de batalha oferece a habilidade', () => {
    let state = readyMatch();
    const active = state.activeSide;
    const reacting = oppositeSide(active);
    placeCreature(state, reacting, 2, 32); // Feiticeiro
    const alvo = placeCreature(state, active, 0, 6); // inimiga dele

    state = applyOk(state, { type: 'ADVANCE_PHASE', side: active });
    expect(state.pending?.reaction).toBe(true);
    expect(state.pending?.side).toBe(reacting);
    state = answerOk(state, `${reacting}:2`);

    // escolhida a criatura inimiga que fica obrigada
    expect(state.pending?.type).toBe('choose_target');
    state = answerOk(state, `${active}:0`);
    expect(state.sides[active].field[0]!.uid).toBe(alvo.uid);
    expect(state.sides[active].field[0]!.mustAttackUntilTurn).toBe(state.turn);
    expect(reduce(state, { type: 'END_TURN', side: active }).error).toBe('must_attack_first');
  });
});
