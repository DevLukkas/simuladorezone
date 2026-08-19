import { describe, expect, test } from 'vitest';
import { damageAfterReduction } from '../combat.ts';
import { currentStats } from '../stats.ts';
import { oppositeSide } from '../state.ts';
import {
  attachDirectly,
  applyOk,
  placeCreature,
  readyMatch,
  putInHand,
  answerOk,
} from './helpers.ts';

/**
 * Gatilhos e efeitos que o legado declarava nas cartas mas nunca resolvia.
 * Cada teste cita a carta pelo id da arte (`public/assets/cards/NN.png`).
 */

describe('self_sent_to_discard_from_field', () => {
  test('Ceifador (35): morto em batalha, cria a ficha Espectro 1/1', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 0, 4); // Leviathan 3/3
    placeCreature(state, enemy, 0, 35); // Ceifador 2/3

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    const token = state.sides[enemy].field.find((creature) => creature?.token);
    expect(token?.token?.name).toBe('Ficha Espectro');
    expect(token?.cardId).toBeNull();
    expect(state.sides[enemy].discard.some((card) => card.cardId === 35)).toBe(true);
  });

  test('Poltergeist (34): do campo ao descarte, impede o ataque de uma inimiga', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 0, 4); // Leviathan 3/3
    placeCreature(state, enemy, 0, 34); // Poltergeist 1/2

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.pending?.side).toBe(enemy);
    expect(state.pending?.type).toBe('choose_target');
    state = answerOk(state, `${side}:0`);
    expect(state.sides[side].field[0]!.cannotAttackUntilTurn).toBe(state.turn + 1);
  });

  test('Lobo das Presas Prateadas (29): do campo ao descarte, invoca outra cópia do deck', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 0, 4); // Leviathan 3/3
    placeCreature(state, enemy, 0, 29); // Lobo 2/1

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.pending?.side).toBe(enemy);
    state = answerOk(state, 'yes');
    const summoned = state.sides[enemy].field.find((creature) => creature?.cardId === 29);
    expect(summoned).toBeTruthy();
    expect(summoned!.canAttackFromTurn).toBe(state.turn + 1);
  });
});

describe('self_element_changed', () => {
  test('Sapomerlim (7): empresta um elemento a outro Anfíbio até o fim do turno', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const sapomerlim = placeCreature(state, side, 0, 7); // Anfibio 2/3
    placeCreature(state, side, 1, 2); // Dheron, Anfibio 1/2
    attachDirectly(sapomerlim, 16); // Sapocalibur muda o elemento do portador
    const espada = sapomerlim.attachments[0]!.uid;

    state = applyOk(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: espada,
      abilityId: 'sapocalibur_change_element',
      element: 'fire',
    });
    expect(state.sides[side].field[0]!.changedElement).toBe('fire');

    // o gatilho da própria criatura não pode mirar nela mesma
    expect(state.pending?.type).toBe('choose_target');
    expect(state.pending!.options.map((option) => option.id)).toEqual([`${side}:1`]);
    state = answerOk(state, `${side}:1`);
    expect(state.pending?.type).toBe('choose_element');
    state = answerOk(state, 'wind');

    const dheron = state.sides[side].field[1]!;
    expect(dheron.changedElement).toBe('wind');
    expect(dheron.changedElementUntilTurn).toBe(state.turn);

    state = applyOk(state, { type: 'END_TURN', side });
    expect(state.sides[side].field[1]!.changedElement).toBeUndefined();
  });

  test('Sapotristan (33): troca ATQ/VIDA com o elemento alterado e compra ao morrer', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    state.sides[side].hand.length = 0;
    placeCreature(state, side, 0, 33); // Sapotristan 1/3, "Contos"
    const pote = putInHand(state, side, 20); // Pote da Sereia altera o elemento

    state = applyOk(state, { type: 'ATTACH', side, cardUid: pote, slot: 0 });
    expect(state.pending?.type).toBe('choose_element');
    state = answerOk(state, 'fire');

    expect(state.pending?.type).toBe('choose_target');
    state = answerOk(state, `${side}:0`);
    const sapo = state.sides[side].field[0]!;
    expect(sapo.swapStatsWhileElementChanged).toBe(true);
    expect(currentStats(sapo, state.sides[side].field)).toEqual({ attack: 3, defense: 1 });

    // destruída com o elemento alterado → o dono compra 1
    state = applyOk(state, { type: 'END_TURN', side });
    placeCreature(state, enemy, 0, 4); // Leviathan 3/3
    const deckBefore = state.sides[side].deck.length;
    state = applyOk(state, { type: 'ADVANCE_PHASE', side: enemy });
    state = applyOk(state, { type: 'ATTACK', side: enemy, slot: 0 });

    expect(state.sides[side].field[0]).toBeNull();
    expect(state.sides[side].deck.length).toBe(deckBefore - 1);
  });
});

describe('gatilhos de anexo em combate', () => {
  test('Reflexos de Morte (13): ao ser atacada, causa 1 de dano a uma criatura inimiga', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 0, 31); // Badur Urso 2/5 (atacante)
    const pirata = placeCreature(state, enemy, 0, 6); // Pirata 1/2 (agua)
    attachDirectly(pirata, 13); // +1 VIDA → 1/3, sobrevive ao golpe

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.sides[enemy].field[0]).not.toBeNull();
    expect(state.pending?.side).toBe(enemy);
    expect(state.pending?.type).toBe('choose_target');
    state = answerOk(state, `${side}:0`);
    // 1 de dano do combate + 1 do Reflexos
    expect(state.sides[side].field[0]!.damage).toBe(2);
  });

  test('Mapa do Tesouro (18): dano direto do portador permite comprar e descartar', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const attacker = placeCreature(state, side, 0, 4); // Leviathan 3/3
    attachDirectly(attacker, 18);
    const handBefore = state.sides[side].hand.length;

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 }); // coluna vazia → direto

    expect(state.pending?.type).toBe('yes_no');
    state = answerOk(state, 'yes');
    expect(state.pending?.type).toBe('choose_card');
    const discarded = state.pending!.options[0]!.id;
    state = answerOk(state, discarded);

    expect(state.sides[side].hand.length).toBe(handBefore); // +1 comprada, −1 descartada
    expect(state.sides[side].discard.some((card) => card.uid === discarded)).toBe(true);
  });

  test('Afogamento (14): quando a criatura escolhida morre, o anexo vai ao descarte', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    state.sides[side].hand.length = 0;
    placeCreature(state, side, 0, 4); // Leviathan 3/3 (agua)
    placeCreature(state, enemy, 0, 30); // Badur Bebê 0/2
    const afogamento = putInHand(state, side, 14);

    state = applyOk(state, { type: 'ATTACH', side, cardUid: afogamento, slot: 0 });
    expect(state.pending?.type).toBe('choose_target');
    state = answerOk(state, `${enemy}:0`);

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.sides[enemy].field[0]).toBeNull();
    expect(state.sides[side].field[0]!.attachments.length).toBe(0);
    expect(state.sides[side].discard.some((card) => card.cardId === 14)).toBe(true);
  });

  test('Resistência (44): reduz só a primeira leva de dano de cada turno', () => {
    const state = readyMatch();
    const target = placeCreature(state, 'a', 0, 6);
    attachDirectly(target, 44);

    expect(damageAfterReduction(target, state.sides.a.field, 3, 1)).toBe(2);
    expect(damageAfterReduction(target, state.sides.a.field, 3, 1)).toBe(3);
    expect(damageAfterReduction(target, state.sides.a.field, 3, 2)).toBe(2);
  });
});

describe('"outras criaturas": a fonte fica de fora', () => {
  test('Badur, o Urso Guardião (31): protege as OUTRAS Bestas Terra, não a si mesmo', () => {
    const state = readyMatch();
    const urso = placeCreature(state, 'a', 0, 31); // Besta/terra
    const lobo = placeCreature(state, 'a', 1, 28); // Besta/terra

    expect(damageAfterReduction(urso, state.sides.a.field, 3, 1)).toBe(3);
    expect(damageAfterReduction(lobo, state.sides.a.field, 3, 1)).toBe(2);
  });

  test('Esfera da Aura Espectral (17): +1 ATQ por OUTRO Espectro em campo', () => {
    const state = readyMatch();
    const ceifador = placeCreature(state, 'a', 0, 35); // Espectro 2/3
    attachDirectly(ceifador, 17);
    expect(currentStats(ceifador, state.sides.a.field).attack).toBe(2);

    placeCreature(state, 'a', 1, 34); // Poltergeist, outro Espectro
    expect(currentStats(ceifador, state.sides.a.field).attack).toBe(3);
  });
});

describe('invocação especial e cenário', () => {
  test('Leviathan (4): descarta-se da mão para invocar outro Esdras sobre uma criatura sua', () => {
    let state = readyMatch();
    const side = state.activeSide;
    state.sides[side].hand.length = 0;
    placeCreature(state, side, 0, 6); // Pirata, será coberto
    const cost = putInHand(state, side, 4);
    const summonable = putInHand(state, side, 4);

    state = applyOk(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: cost,
      abilityId: 'leviathan_special_summon',
    });
    expect(state.sides[side].discard.some((card) => card.uid === cost)).toBe(true);

    expect(state.pending?.type).toBe('choose_target');
    state = answerOk(state, `${side}:0`);
    expect(state.pending?.type).toBe('choose_card');
    state = answerOk(state, summonable);

    expect(state.sides[side].field[0]!.uid).toBe(summonable);
    expect(state.sides[side].field[0]!.cardId).toBe(4);
    expect(state.sides[side].discard.some((card) => card.cardId === 6)).toBe(true);
  });

  test('Caverna do Guardião Badur (45): Besta ao descarte dá +1 ATQ ao Urso até o fim do turno', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    state.sides[enemy].scenario = { uid: 'caverna', cardId: 45 };
    placeCreature(state, side, 0, 4); // Leviathan 3/3 (atacante)
    placeCreature(state, enemy, 0, 30); // Badur Bebê 0/2 (Besta, morre)
    placeCreature(state, enemy, 1, 31); // Badur, o Urso Guardião 2/5

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.pending?.side).toBe(enemy);
    state = answerOk(state, `${enemy}:1`);
    // 2 base + 1 do marcador do próprio Urso + 1 temporário do cenário
    const urso = state.sides[enemy].field[1]!;
    expect(currentStats(urso, state.sides[enemy].field).attack).toBe(4);

    state = applyOk(state, { type: 'END_TURN', side });
    const after = state.sides[enemy].field[1]!;
    expect(currentStats(after, state.sides[enemy].field).attack).toBe(3);
  });
});
