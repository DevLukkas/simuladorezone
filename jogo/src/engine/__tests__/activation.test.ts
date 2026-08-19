import { describe, expect, test } from 'vitest';
import { creatureActivations, handActivations, type ActivationScope } from '../activation.ts';
import { reduce } from '../reduce.ts';
import type { Element } from '../../data/types.ts';
import type { GameState, SideId } from '../state.ts';
import { attachDirectly, applyOk, placeCreature, putInHand, readyMatch } from './helpers.ts';

/**
 * O acordo: o que `activation.ts` oferece à tela é exatamente o que
 * `activateAbility` aceita. Cada caso abaixo confere a oferta CONTRA o motor —
 * habilidade nova que só mexa num dos dois lados cai aqui.
 */
function scopeOf(state: GameState, side: SideId): ActivationScope {
  return {
    turn: state.turn,
    field: state.sides[side].field,
    discard: state.sides[side].discard,
    hand: state.sides[side].hand,
  };
}

/** o motor aceitaria este comando agora? (sem alterar o estado de quem pergunta) */
function engineAccepts(
  state: GameState,
  side: SideId,
  sourceUid: string,
  abilityId: string,
  element?: Element,
): boolean {
  const result = reduce(structuredClone(state), {
    type: 'ACTIVATE_ABILITY',
    side,
    sourceUid,
    abilityId,
    ...(element ? { element } : {}),
  });
  return !result.error;
}

describe('oferta de habilidade ativada', () => {
  test('Mysticus (3): só oferece com um Tridente anexado — e o motor concorda', () => {
    const state = readyMatch();
    const side = state.activeSide;
    const mysticus = placeCreature(state, side, 0, 3);

    expect(creatureActivations(mysticus, 0, scopeOf(state, side))).toEqual([]);
    expect(engineAccepts(state, side, mysticus.uid, 'mysticus_destroy_tridente')).toBe(false);

    attachDirectly(mysticus, 9); // Tridente de Atlas
    const options = creatureActivations(mysticus, 0, scopeOf(state, side));
    expect(options).toHaveLength(1);
    expect(options[0]!.abilityId).toBe('mysticus_destroy_tridente');
    expect(engineAccepts(state, side, mysticus.uid, 'mysticus_destroy_tridente')).toBe(true);
  });

  test('Mamuthe (36): a oferta some depois do uso 1x/turno', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const mamuthe = placeCreature(state, side, 0, 36);

    expect(creatureActivations(mamuthe, 0, scopeOf(state, side))).toHaveLength(1);

    state = applyOk(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: mamuthe.uid,
      abilityId: 'mamuthe_moer_e_crescer',
    });
    const used = state.sides[side].field[0]!;
    expect(creatureActivations(used, 0, scopeOf(state, side))).toEqual([]);
    expect(engineAccepts(state, side, used.uid, 'mamuthe_moer_e_crescer')).toBe(false);
  });

  test('Badur bebê (30): sem o Badur no descarte não há o que invocar', () => {
    const state = readyMatch();
    const side = state.activeSide;
    const bebe = placeCreature(state, side, 0, 30);

    expect(creatureActivations(bebe, 0, scopeOf(state, side))).toEqual([]);
    expect(engineAccepts(state, side, bebe.uid, 'badur_bebe_sacrifice')).toBe(false);

    state.sides[side].discard.push({ uid: 'badur-morto', cardId: 31 });
    expect(creatureActivations(bebe, 0, scopeOf(state, side))).toHaveLength(1);
    expect(engineAccepts(state, side, bebe.uid, 'badur_bebe_sacrifice')).toBe(true);
  });

  test('Feiticeiro Tribal (32): habilidade de reação não aparece no turno do dono', () => {
    const state = readyMatch();
    const side = state.activeSide;
    const feiticeiro = placeCreature(state, side, 0, 32);

    expect(creatureActivations(feiticeiro, 0, scopeOf(state, side))).toEqual([]);
    expect(engineAccepts(state, side, feiticeiro.uid, 'feiticeiro_tribal_forcar_ataque')).toBe(
      false,
    );
  });

  test('Sapocalibur (16): só oferece em Anfíbio, e com os elementos para escolher', () => {
    const state = readyMatch();
    const side = state.activeSide;
    const besta = placeCreature(state, side, 0, 31); // Besta
    attachDirectly(besta, 16);
    expect(creatureActivations(besta, 0, scopeOf(state, side))).toEqual([]);

    const sapo = placeCreature(state, side, 1, 7); // Anfíbio
    attachDirectly(sapo, 16);
    const options = creatureActivations(sapo, 1, scopeOf(state, side));
    expect(options).toHaveLength(1);
    expect(options[0]!.elements).toContain('fire');
    expect(options[0]!.sourceUid).toBe(sapo.attachments[0]!.uid);
    expect(
      engineAccepts(state, side, sapo.attachments[0]!.uid, 'sapocalibur_change_element', 'fire'),
    ).toBe(true);
  });

  test('Leviathan (4): da mão, só com criatura em campo e um Esdras para invocar', () => {
    const state = readyMatch();
    const side = state.activeSide;
    state.sides[side].hand.length = 0;
    const leviathan = putInHand(state, side, 4);
    const inHand = state.sides[side].hand[0]!;

    expect(handActivations(inHand, scopeOf(state, side))).toEqual([]);

    placeCreature(state, side, 0, 31);
    expect(handActivations(inHand, scopeOf(state, side))).toEqual([]);

    putInHand(state, side, 4); // outra cópia: Mutante de nome Esdras
    const options = handActivations(inHand, scopeOf(state, side));
    expect(options).toHaveLength(1);
    expect(options[0]!.sourceUid).toBe(leviathan);
    expect(engineAccepts(state, side, leviathan, 'leviathan_special_summon')).toBe(true);
  });
});
