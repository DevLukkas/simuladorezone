import { describe, expect, test } from 'vitest';
import {
  creatureAbilityOffers,
  creatureActivations,
  handAbilityOffers,
  handActivations,
  type ActivationScope,
} from '../activation.ts';
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
    enemyField: state.sides[side === 'a' ? 'b' : 'a'].field,
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

  /**
   * A oferta da MÃO tem duas leituras, e a tela precisa das duas: `handActivations`
   * é o que dá para fazer agora (o ícone que pisca na carta), `handAbilityOffers` é
   * o que a carta SABE fazer (o botão, desligado, com o porquê no `title`). Sem a
   * segunda o Leviathan não desenhava botão nenhum e parecia carta quebrada.
   */
  test('Leviathan (4): a oferta existe desligada, e o porquê é a recusa do motor', () => {
    const state = readyMatch();
    const side = state.activeSide;
    state.sides[side].hand.length = 0;
    const leviathan = putInHand(state, side, 4);
    const inHand = state.sides[side].hand[0]!;

    const [blocked] = handAbilityOffers(inHand, scopeOf(state, side));
    expect(blocked?.available).toBe(false);
    expect(blocked?.blocked).toBe('needs_creature_and_card');
    expect(blocked?.cost).toBe('discard_self');
    expect(engineAccepts(state, side, leviathan, 'leviathan_special_summon')).toBe(false);

    placeCreature(state, side, 0, 31);
    putInHand(state, side, 4);
    const [ready] = handAbilityOffers(inHand, scopeOf(state, side));
    expect(ready?.available).toBe(true);
    expect(ready?.blocked).toBeUndefined();
    expect(engineAccepts(state, side, leviathan, 'leviathan_special_summon')).toBe(true);
  });

  /**
   * A oferta EM CAMPO tem as mesmas duas leituras da mão. O painel dizia "esta
   * criatura não tem habilidade ativável" para o Bebê Urso sem o Urso no
   * descarte — o texto da carta prometia uma habilidade, e a tela negava a
   * existência dela (relato do DevLukkas).
   */
  test('Badur bebê (30): a oferta existe desligada, dizendo o que falta', () => {
    const state = readyMatch();
    const side = state.activeSide;
    const bebe = placeCreature(state, side, 0, 30);

    const [blocked] = creatureAbilityOffers(bebe, 0, scopeOf(state, side));
    expect(blocked?.available).toBe(false);
    expect(blocked?.blocked).toBe('no_discard_target');
    expect(blocked?.cost).toBe('sacrifice_self');

    state.sides[side].discard.push({ uid: 'badur-morto', cardId: 31 });
    const [ready] = creatureAbilityOffers(bebe, 0, scopeOf(state, side));
    expect(ready?.available).toBe(true);
    expect(ready?.blocked).toBeUndefined();
  });

  test('Mysticus (3): sem Tridente, a oferta diz que o custo não dá para pagar', () => {
    const state = readyMatch();
    const side = state.activeSide;
    const mysticus = placeCreature(state, side, 0, 3);
    expect(creatureAbilityOffers(mysticus, 0, scopeOf(state, side))[0]?.blocked).toBe(
      'cost_not_paid',
    );
  });

  test('Feiticeiro Tribal (32): a oferta explica que é habilidade de reação', () => {
    const state = readyMatch();
    const side = state.activeSide;
    const feiticeiro = placeCreature(state, side, 0, 32);
    const [offer] = creatureAbilityOffers(feiticeiro, 0, scopeOf(state, side));
    expect(offer?.available).toBe(false);
    expect(offer?.blocked).toBe('reaction_only_ability');
    // e continua fora da lista do que dá para ativar agora
    expect(creatureActivations(feiticeiro, 0, scopeOf(state, side))).toEqual([]);
  });

  test('carta sem habilidade de mão não oferece nada', () => {
    const state = readyMatch();
    const side = state.activeSide;
    state.sides[side].hand.length = 0;
    putInHand(state, side, 31); // Badur, o Urso Guardião: invocação normal
    expect(handAbilityOffers(state.sides[side].hand[0]!, scopeOf(state, side))).toEqual([]);
  });
});
