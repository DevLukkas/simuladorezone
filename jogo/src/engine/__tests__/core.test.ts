import { describe, expect, test } from 'vitest';
import { reduce } from '../reduce.ts';
import { currentStats } from '../stats.ts';
import { createMatch } from '../createMatch.ts';
import { cardById } from '../../data/cards.ts';
import { oppositeSide, type GameState, type SideId } from '../state.ts';
import {
  attachDirectly,
  applyOk,
  placeCreature,
  testDeck,
  goToBattle,
  readyMatch,
} from './helpers.ts';

describe('início da partida e mulligan', () => {
  test('cada lado começa com 5 cartas na mão e 35 no deck', () => {
    const created = createMatch({
      seed: 7,
      decks: {
        a: { hero: 'badur', cards: testDeck([1, 2, 5, 6]) },
        b: { hero: 'ispisher', cards: testDeck([1, 2, 5, 6]) },
      },
    });
    for (const side of ['a', 'b'] as const) {
      expect(created.state.sides[side].hand.length).toBe(5);
      expect(created.state.sides[side].deck.length).toBe(35);
    }
    expect(created.state.phase).toBe('mulligan');
  });

  test('mulligan troca a mão; a partida começa quando ambos decidem', () => {
    const created = createMatch({
      seed: 7,
      decks: {
        a: { hero: 'badur', cards: testDeck([1, 2, 5, 6, 28, 29]) },
        b: { hero: 'ispisher', cards: testDeck([1, 2, 5, 6, 28, 29]) },
      },
    });
    const handBefore = created.state.sides.a.hand.map((card) => card.uid).join(',');
    let state = applyOk(created.state, { type: 'DECIDE_MULLIGAN', side: 'a', swap: true });
    const handAfter = state.sides.a.hand.map((card) => card.uid).join(',');
    expect(handAfter).not.toBe(handBefore);
    expect(state.sides.a.hand.length).toBe(5);
    expect(state.phase).toBe('mulligan');

    state = applyOk(state, { type: 'DECIDE_MULLIGAN', side: 'b', swap: false });
    expect(state.phase).toBe('main');
  });

  test('não se compra carta no primeiro turno; compra-se a partir do segundo', () => {
    const state = readyMatch();
    const active = state.activeSide;
    expect(state.sides[active].hand.length).toBe(5);

    const proximo = applyOk(state, { type: 'END_TURN', side: active });
    expect(proximo.sides[proximo.activeSide].hand.length).toBe(6);
  });
});

describe('invocação', () => {
  test('uma invocação por turno, em slot vazio', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const creatureInHand = state.sides[side].hand.find((inHand) => {
      const card = cardById(inHand.cardId);
      return card.type === 'creature' && card.summonRule?.normal !== false;
    });
    expect(creatureInHand).toBeDefined();

    state = applyOk(state, { type: 'SUMMON', side, cardUid: creatureInHand!.uid, slot: 2 });
    expect(state.sides[side].field[2]?.uid).toBe(creatureInHand!.uid);

    const other = state.sides[side].hand.find(
      (inHand) => cardById(inHand.cardId).type === 'creature',
    );
    if (other) {
      const refusal = reduce(state, { type: 'SUMMON', side, cardUid: other.uid, slot: 3 });
      expect(refusal.error).toBeTruthy();
    }
  });

  test('criatura invocada não ataca no mesmo turno ("summoning sickness")', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const creatureInHand = state.sides[side].hand.find((inHand) => {
      const card = cardById(inHand.cardId);
      return card.type === 'creature' && card.summonRule?.normal !== false;
    })!;
    state = applyOk(state, { type: 'SUMMON', side, cardUid: creatureInHand.uid, slot: 0 });
    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    const refusal = reduce(state, { type: 'ATTACK', side, slot: 0 });
    expect(refusal.error).toBeTruthy();
  });
});

describe('anexos', () => {
  test('habilidade exige elemento compatível; item anexa sempre', () => {
    const state = readyMatch();
    const lobo = placeCreature(state, 'a', 0, 28); // terra
    const pirata = placeCreature(state, 'a', 1, 6); // agua

    // Resistência (terra): compatível com o lobo, não com o pirata
    attachDirectly(lobo, 44);
    expect(currentStats(lobo, state.sides.a.field)).toEqual({ attack: 1, defense: 5 });

    // stats do pirata seguem os impressos
    expect(currentStats(pirata, state.sides.a.field)).toEqual({ attack: 1, defense: 2 });
  });

  test('aura de Azzure dá +1/+1 às OUTRAS Acquarium, nunca a ela mesma', () => {
    const state = readyMatch();
    const azzure = placeCreature(state, 'a', 0, 1);
    const atlas = placeCreature(state, 'a', 1, 5); // Acquarium 2/2
    const lobo = placeCreature(state, 'a', 2, 28); // Besta — fora da aura

    expect(currentStats(azzure, state.sides.a.field)).toEqual({ attack: 2, defense: 4 });
    expect(currentStats(atlas, state.sides.a.field)).toEqual({ attack: 3, defense: 3 });
    expect(currentStats(lobo, state.sides.a.field)).toEqual({ attack: 1, defense: 3 });
  });
});

describe('combate', () => {
  test('dano simultâneo destrói os dois lados e pontua por raridade', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const opposite = side === 'a' ? 'b' : 'a';
    placeCreature(state, side, 0, 4); // Leviathan 3/3 (rara)
    placeCreature(state, opposite, 0, 4); // Leviathan 3/3 (rara)

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    // 3 de dano de cada lado: os dois morrem e cada um pontua 1 pela rara
    expect(state.sides[side].field[0]).toBeNull();
    expect(state.sides[opposite].field[0]).toBeNull();
    expect(state.sides[opposite].points).toBe(1);
    expect(state.sides[side].points).toBe(1);
  });

  test('coluna vazia = dano direto; 5 de dano acumulado vira 1 ponto', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const opposite = side === 'a' ? 'b' : 'a';
    placeCreature(state, side, 0, 4); // Leviathan atk 3

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });
    expect(state.sides[opposite].directDamage).toBe(3);
    expect(state.sides[side].points).toBe(0);

    // turno do oponente passa, ataca de novo: 3+3=6 → 1 ponto e sobra 1
    state = applyOk(state, { type: 'END_TURN', side });
    state = goToBattle(state, side);
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });
    expect(state.sides[side].points).toBe(1);
    expect(state.sides[opposite].directDamage).toBe(1);
  });

  test('Resistência reduz 1 de dano de combate', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const opposite = side === 'a' ? 'b' : 'a';
    placeCreature(state, side, 0, 4); // Leviathan 3/3
    const lobo = placeCreature(state, opposite, 0, 28); // Lobo do Uivo 1/3
    attachDirectly(lobo, 44); // Resistência: +0/+2, ignora 1

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    const loboDepois = state.sides[opposite].field[0];
    expect(loboDepois?.damage).toBe(2); // 3 de ataque − 1 de Resistência
    expect(currentStats(loboDepois!, state.sides[opposite].field).defense).toBe(3); // 3+2−2
  });

  test('Atropelar converte o excedente em dano direto', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const opposite = side === 'a' ? 'b' : 'a';
    const attacker = placeCreature(state, side, 0, 29); // Lobo das Presas 2/1
    attachDirectly(attacker, 38); // Estouro da Manada: +1/+1 e Atropelar → 3/2
    placeCreature(state, opposite, 0, 6); // Pirata Afogado 1/2

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.sides[opposite].field[0]).toBeNull(); // pirata morre (2 de vida, 3 de dano)
    expect(state.sides[opposite].directDamage).toBe(1); // excedente 3−2
  });

  test('3 pontos encerram a partida', () => {
    let state = readyMatch();
    const side = state.activeSide;
    state.sides[side].points = 2;
    state.sides[side === 'a' ? 'b' : 'a'].directDamage = 4;
    placeCreature(state, side, 0, 4); // atk 3 → completa 5 de dano direto

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.winner).toBe(side);
    expect(state.endReason).toBe('points');
    const refusal = reduce(state, { type: 'END_TURN', side });
    expect(refusal.error).toBeTruthy();
  });
});

/**
 * MARCIAL, VORPAL e REGENERAR (Quatro Elementos). Os dois heróis são badur nos
 * testes de palavra-chave para tirar do caminho a cura de início de turno do
 * Ispisher, que mexeria no mesmo dano que a regeneração cura.
 */
describe('palavras-chave', () => {
  function matchWithoutHeroHeal(): GameState {
    return readyMatch({
      decks: {
        a: { hero: 'badur', cards: testDeck([1, 2, 5, 6, 28, 29, 30, 36]) },
        b: { hero: 'badur', cards: testDeck([1, 2, 5, 6, 28, 29, 30, 36]) },
      },
    });
  }

  /** Devolve a partida em batalha com atacante e defensor na mesma coluna. */
  function battleBetween(
    attackerId: number,
    defenderId: number,
  ): { state: GameState; side: SideId; opposite: SideId } {
    let state = matchWithoutHeroHeal();
    const side = state.activeSide;
    const opposite = oppositeSide(side);
    placeCreature(state, side, 0, attackerId);
    placeCreature(state, opposite, 0, defenderId);
    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });
    return { state, side, opposite };
  }

  test('MARCIAL atacando: mata o defensor e não sofre dano', () => {
    // Devoradora de Virgens (46) 2/2 MARCIAL contra Atlas (5) 2/2
    const { state, side, opposite } = battleBetween(46, 5);
    expect(state.sides[opposite].field[0]).toBeNull();
    expect(state.sides[side].field[0]!.damage).toBe(0);
  });

  test('MARCIAL defendendo: derruba o atacante antes do revide', () => {
    const { state, side, opposite } = battleBetween(5, 46);
    expect(state.sides[side].field[0]).toBeNull();
    expect(state.sides[opposite].field[0]!.damage).toBe(0);
  });

  test('MARCIAL não anula o revide quando o golpe não mata', () => {
    // Mysticus (3) 1/5 aguenta os 2 da Devoradora e devolve 1
    const { state, side, opposite } = battleBetween(46, 3);
    expect(state.sides[opposite].field[0]!.damage).toBe(2);
    expect(state.sides[side].field[0]!.damage).toBe(1);
  });

  test('MARCIAL dos dois lados: o dano volta a ser simultâneo', () => {
    const { state, side, opposite } = battleBetween(46, 46);
    expect(state.sides[side].field[0]).toBeNull();
    expect(state.sides[opposite].field[0]).toBeNull();
  });

  test('VORPAL: destruiu a criatura inimiga → ATQ impresso vira dano direto', () => {
    // Éria (47) 2/3 VORPAL destrói o Badur bebê (30) 0/2
    const { state, opposite } = battleBetween(47, 30);
    expect(state.sides[opposite].field[0]).toBeNull();
    expect(state.sides[opposite].directDamage).toBe(2);
  });

  test('VORPAL usa o ATQ impresso, não o modificado por marcadores', () => {
    let state = matchWithoutHeroHeal();
    const side = state.activeSide;
    const opposite = oppositeSide(side);
    const eria = placeCreature(state, side, 0, 47); // 2/3
    eria.markers.attack = 2; // ataca com 4
    placeCreature(state, opposite, 0, 5); // Atlas 2/2

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.sides[opposite].field[0]).toBeNull();
    expect(state.sides[opposite].directDamage).toBe(2);
  });

  test('VORPAL não dispara quando a criatura inimiga sobrevive', () => {
    const { state, opposite } = battleBetween(47, 3); // Mysticus 1/5 aguenta
    expect(state.sides[opposite].field[0]).not.toBeNull();
    expect(state.sides[opposite].directDamage).toBe(0);
  });

  test('VORPAL defendendo: quem atacou leva o dano direto', () => {
    const { state, side, opposite } = battleBetween(5, 47);
    expect(state.sides[side].field[0]).toBeNull();
    expect(state.sides[opposite].field[0]!.damage).toBe(2);
    expect(state.sides[side].directDamage).toBe(2);
  });

  test('REGENERAR: recupera 1 de vida no início do turno do dono, sem passar do topo', () => {
    let state = matchWithoutHeroHeal();
    const side = state.activeSide;
    const opposite = oppositeSide(side);
    const wargh = placeCreature(state, side, 0, 50); // 0/4 REGENERAR
    wargh.damage = 2;

    // turno do oponente: a criatura não regenera
    state = applyOk(state, { type: 'END_TURN', side });
    expect(state.sides[side].field[0]!.damage).toBe(2);

    state = applyOk(state, { type: 'END_TURN', side: opposite });
    expect(state.sides[side].field[0]!.damage).toBe(1);

    // de volta ao dono já curado: para em 0, não vira vida extra
    state = applyOk(state, { type: 'END_TURN', side });
    state = applyOk(state, { type: 'END_TURN', side: opposite });
    expect(state.sides[side].field[0]!.damage).toBe(0);
    expect(currentStats(state.sides[side].field[0]!, state.sides[side].field).defense).toBe(4);

    state = applyOk(state, { type: 'END_TURN', side });
    state = applyOk(state, { type: 'END_TURN', side: opposite });
    expect(state.sides[side].field[0]!.damage).toBe(0);
  });
});

describe('fim de turno', () => {
  test('modificadores temporários expiram no fim do turno em que nasceram', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const creature = placeCreature(state, side, 0, 6);
    creature.temporaryModifiers.push({
      attack: 2,
      defense: 0,
      expiresAfterTurn: state.turn,
    });
    expect(currentStats(creature, state.sides[side].field).attack).toBe(3);

    state = applyOk(state, { type: 'END_TURN', side });
    const after = state.sides[side].field[0]!;
    expect(after.temporaryModifiers.length).toBe(0);
    expect(currentStats(after, state.sides[side].field).attack).toBe(1);
  });

  test('conceder dá a vitória ao oponente', () => {
    const state = readyMatch();
    const result = reduce(state, { type: 'CONCEDE', side: 'a' });
    expect(result.state.winner).toBe('b');
    expect(result.state.endReason).toBe('concede');
  });
});
