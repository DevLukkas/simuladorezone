import { describe, expect, test } from 'vitest';
import { reduce } from '../reduce.ts';
import { currentStats } from '../stats.ts';
import { oppositeSide, type GameState, type SideId } from '../state.ts';
import {
  attachDirectly,
  applyOk,
  placeCreature,
  testDeck,
  readyMatch,
  putInHand,
  answerOk,
} from './helpers.ts';

function withActive(state: GameState, side: SideId): GameState {
  return state.activeSide === side
    ? state
    : applyOk(state, { type: 'END_TURN', side: state.activeSide });
}

describe('efeitos ao entrar em campo', () => {
  test('Atlas (5): descarta Tridente e busca carta com Atlantis no deck', () => {
    let state = readyMatch();
    const side = state.activeSide;
    state.sides[side].hand.length = 0;
    const atlas = putInHand(state, side, 5);
    const tridente = putInHand(state, side, 9);

    state = applyOk(state, { type: 'SUMMON', side, cardUid: atlas, slot: 0 });
    expect(state.pending?.type).toBe('choose_card');
    state = answerOk(state, tridente);
    expect(state.sides[side].discard.some((c) => c.uid === tridente)).toBe(true);

    expect(state.pending?.type).toBe('choose_card');
    const searched = state.pending!.options[0]!.id;
    state = answerOk(state, searched);
    expect(state.sides[side].hand.some((c) => c.uid === searched)).toBe(true);
    expect(state.pending).toBeNull();
  });

  test('Mamuthe (36): habilidade 1x/turno mói 2 e ganha +1 de vida por elemento', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const mamuthe = placeCreature(state, side, 0, 36);

    state = applyOk(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: mamuthe.uid,
      abilityId: 'mamuthe_moer_e_crescer',
    });
    expect(state.sides[side].discard.length).toBe(2);
    expect(state.sides[side].field[0]!.markers.defense).toBeGreaterThanOrEqual(1);

    const repetida = reduce(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: mamuthe.uid,
      abilityId: 'mamuthe_moer_e_crescer',
    });
    expect(repetida.error).toBe('ability_already_used');
  });

  test('Ceifador (35): embaralha Espectro do descarte e reduz ATQ inimigo até o fim do turno', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    state.sides[side].hand.length = 0;
    state.sides[side].discard.push({ uid: 'poltergeist_desc', cardId: 34 });
    placeCreature(state, enemy, 0, 6); // Pirata 1/2
    const ceifador = putInHand(state, side, 35);

    const deckBefore = state.sides[side].deck.length;
    state = applyOk(state, { type: 'SUMMON', side, cardUid: ceifador, slot: 1 });

    expect(state.sides[side].discard.some((c) => c.uid === 'poltergeist_desc')).toBe(false);
    expect(state.sides[side].deck.length).toBe(deckBefore + 1);
    const pirata = state.sides[enemy].field[0]!;
    expect(currentStats(pirata, state.sides[enemy].field).attack).toBe(0); // 1 − 1
  });
});

describe('gatilhos de descarte (corrente)', () => {
  test('Mímico (8): morto em batalha, dono escolhe criatura aliada para o marcador', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 0, 4); // Leviathan 3/3
    placeCreature(state, enemy, 0, 8); // Mímico 2/2
    placeCreature(state, enemy, 1, 34); // Poltergeist (alvo do marcador)

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.sides[enemy].field[0]).toBeNull();
    expect(state.pending?.side).toBe(enemy);
    state = answerOk(state, 'yes');
    expect(state.pending?.type).toBe('choose_target');
    state = answerOk(state, `${enemy}:1`);
    const poltergeist = state.sides[enemy].field[1]!;
    expect(poltergeist.markers).toEqual({ attack: 1, defense: 1 });
  });

  test('Escolha as Cegas (22) com 2 Mímicos: corrente pede a ordem', () => {
    let state = readyMatch();
    const side = state.activeSide;
    placeCreature(state, side, 0, 6); // alvo dos marcadores
    state.sides[side].hand.length = 0;
    const command = putInHand(state, side, 22);
    putInHand(state, side, 8);
    putInHand(state, side, 8);

    state = applyOk(state, { type: 'PLAY_COMMAND', side, cardUid: command });
    // descartou 2, comprou 2
    expect(state.sides[side].hand.length).toBe(2);
    expect(state.pending?.type).toBe('choose_order');
    state = answerOk(state, '0');
    state = answerOk(state, 'yes');
    state = answerOk(state, `${side}:0`);
    // segundo mímico da corrente: recusado
    expect(state.pending?.type).toBe('yes_no');
    state = answerOk(state, 'no');
    expect(state.pending).toBeNull();
    expect(state.sides[side].field[0]!.markers).toEqual({ attack: 1, defense: 1 });
  });

  test('Badur, o Urso Guardião (31): +1/+1 quando outra Besta sua vai ao descarte', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 1, 4); // Leviathan atacante
    placeCreature(state, enemy, 0, 31); // Badur Urso
    placeCreature(state, enemy, 1, 29); // Lobo das Presas 2/1 (Besta)

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 1 });

    expect(state.sides[enemy].field[1]).toBeNull();
    expect(state.sides[enemy].field[0]!.markers).toEqual({ attack: 1, defense: 1 });
  });
});

describe('anexos com gatilho', () => {
  test('Tridente Poderoso de Atlas (9) em dobro: oponente descarta 1 aleatória', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 0, 6); // Pirata (agua)
    state.sides[side].hand.length = 0;
    const first = putInHand(state, side, 9);
    const second = putInHand(state, side, 9);
    const enemyHand = state.sides[enemy].hand.length;

    state = applyOk(state, { type: 'ATTACH', side, cardUid: first, slot: 0 });
    expect(state.sides[enemy].hand.length).toBe(enemyHand);
    state = applyOk(state, { type: 'ATTACH', side, cardUid: second, slot: 0 });
    expect(state.sides[enemy].hand.length).toBe(enemyHand - 1);
    expect(state.sides[enemy].discard.length).toBe(1);
  });

  test('Tridente Mágico de Corais (12): ao atacar, escolhe inimiga que não atacará', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    const attacker = placeCreature(state, side, 0, 6);
    attachDirectly(attacker, 12);
    placeCreature(state, enemy, 0, 31); // Badur Urso 2/5 (sobrevive)
    placeCreature(state, enemy, 1, 6);

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });
    expect(state.pending?.type).toBe('choose_target');
    state = answerOk(state, `${enemy}:1`);

    state = applyOk(state, { type: 'END_TURN', side });
    state = applyOk(state, { type: 'ADVANCE_PHASE', side: enemy });
    const refusal = reduce(state, { type: 'ATTACK', side: enemy, slot: 1 });
    expect(refusal.error).toBeTruthy();
  });

  test('Afogamento (14): -1 de vida por anexo da criatura escolhida', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    const mine = placeCreature(state, side, 0, 6);
    void mine;
    const target = placeCreature(state, enemy, 0, 6); // Pirata 1/2
    attachDirectly(target, 10);
    attachDirectly(target, 10); // 2 anexos → −2 de vida
    state.sides[side].hand.length = 0;
    const afogamento = putInHand(state, side, 14);

    state = applyOk(state, { type: 'ATTACH', side, cardUid: afogamento, slot: 0 });
    expect(state.pending?.type).toBe('choose_target');
    state = answerOk(state, `${enemy}:0`);
    // 2 de vida − 2 = 0 → destruída
    expect(state.sides[enemy].field[0]).toBeNull();
  });

  test('Manopla do Poder (19): +3 ATQ e 1 de dano no fim do próximo turno', () => {
    // heróis sem cura para o dano adiado não ser desfeito pelo Ispisher
    let state = readyMatch({
      decks: {
        a: { hero: 'morgon', cards: testDeck([1, 2, 5, 6]) },
        b: { hero: 'morgon', cards: testDeck([1, 2, 5, 6]) },
      },
    });
    const side = state.activeSide;
    placeCreature(state, side, 0, 6); // Pirata 1/2
    state.sides[side].hand.length = 0;
    const manopla = putInHand(state, side, 19);

    state = applyOk(state, { type: 'ATTACH', side, cardUid: manopla, slot: 0 });
    expect(currentStats(state.sides[side].field[0]!, state.sides[side].field).attack).toBe(4);

    state = applyOk(state, { type: 'END_TURN', side });
    expect(state.sides[side].field[0]!.damage).toBe(0);
    state = applyOk(state, { type: 'END_TURN', side: oppositeSide(side) });
    expect(state.sides[side].field[0]!.damage).toBe(1);
  });

  test('Pote da Sereia (20) muda o elemento; Dheron (2) reage com +1 de vida', () => {
    let state = readyMatch();
    const side = state.activeSide;
    placeCreature(state, side, 0, 2); // Dheron (Anfibio, agua)
    state.sides[side].hand.length = 0;
    const pote = putInHand(state, side, 20);

    state = applyOk(state, { type: 'ATTACH', side, cardUid: pote, slot: 0 });
    expect(state.pending?.type).toBe('choose_element');
    state = answerOk(state, 'fire');

    const dheron = state.sides[side].field[0]!;
    expect(dheron.changedElement).toBe('fire');
    expect(dheron.markers.defense).toBe(1); // gatilho do próprio Dheron
  });

  test('Esfera da Aura Espectral (17): cria ficha e dá +1 ATQ por Espectro', () => {
    let state = readyMatch();
    const side = state.activeSide;
    placeCreature(state, side, 0, 6); // Pirata
    state.sides[side].hand.length = 0;
    const esfera = putInHand(state, side, 17);

    state = applyOk(state, { type: 'ATTACH', side, cardUid: esfera, slot: 0 });
    const token = state.sides[side].field.find((c) => c?.cardId === null);
    expect(token?.token?.race).toBe('Ghost');
    expect(currentStats(state.sides[side].field[0]!, state.sides[side].field).attack).toBe(2); // 1 + 1
  });

  test('Corpo Translúcido (42): bloqueia atacantes com 3+ de vida atual', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 0, 4); // Leviathan 3/3
    placeCreature(state, side, 1, 6); // Pirata 1/2
    const protected_ = placeCreature(state, enemy, 0, 34);
    attachDirectly(protected_, 42);
    const protegida2 = placeCreature(state, enemy, 1, 34);
    attachDirectly(protegida2, 42);

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    const blocked = reduce(state, { type: 'ATTACK', side, slot: 0 });
    expect(blocked.error).toBeTruthy();
    state = applyOk(state, { type: 'ATTACK', side, slot: 1 });
    expect(state.sides[enemy].field[1]!.damage).toBe(1);
  });

  test('Proteção do Escudeiro (43): defensor nega o ataque descartando a carta', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    placeCreature(state, side, 0, 4); // Leviathan
    const contos = placeCreature(state, enemy, 0, 33); // Sapotristan ("Contos")
    attachDirectly(contos, 43);

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });
    expect(state.pending?.side).toBe(enemy);
    state = answerOk(state, 'yes');

    const defender = state.sides[enemy].field[0]!;
    expect(defender.damage).toBe(0);
    expect(defender.attachments.length).toBe(0);
    // o atacante não gastou o ataque; sem o escudo (+1/+2), o segundo ataque
    // encontra Sapotristan em 1/3 e o destrói (rara → 1 ponto)
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });
    expect(state.sides[enemy].field[0]).toBeNull();
    expect(state.sides[side].points).toBe(1);
  });

  test('Guardião Enlouquecido (39): buff nas OUTRAS Bestas; destrói a anexada se não atacar', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const lobo = placeCreature(state, side, 0, 28); // Lobo do Uivo (Besta, terra) 1/3
    placeCreature(state, side, 1, 30); // Badur, o Bebê Urso (Besta) 0/2
    attachDirectly(lobo, 39); // +2/+2

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 }); // coluna vazia → direto
    // o buff é só das OUTRAS Bestas: a atacante fica em 1+2, a parceira ganha +1
    expect(currentStats(state.sides[side].field[0]!, state.sides[side].field).attack).toBe(3);
    expect(currentStats(state.sides[side].field[1]!, state.sides[side].field).attack).toBe(1);
    state = applyOk(state, { type: 'END_TURN', side });
    expect(state.sides[side].field[0]).not.toBeNull(); // atacou, sobreviveu

    state = withActive(state, side);
    state = applyOk(state, { type: 'END_TURN', side }); // não atacou
    expect(state.sides[side].field[0]).toBeNull();
    expect(state.sides[side].points).toBe(0); // destruição por efeito não pontua
  });

  test('Posse de Objetos Inanimados (41): descartada por substituição, permite comprar', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const poltergeist = placeCreature(state, side, 0, 34); // vazio
    attachDirectly(poltergeist, 41); // Posse (vazio)
    attachDirectly(poltergeist, 42); // Corpo (vazio)
    const posseUid = poltergeist.attachments[0]!.uid;
    state.sides[side].hand.length = 0;
    const newBody = putInHand(state, side, 42);
    const handBefore = state.sides[side].hand.length;

    state = applyOk(state, {
      type: 'ATTACH',
      side,
      cardUid: newBody,
      slot: 0,
      replaceAttachmentUid: posseUid,
    });
    expect(state.pending?.type).toBe('yes_no');
    state = answerOk(state, 'yes');
    expect(state.sides[side].hand.length).toBe(handBefore); // anexou 1 (−1), comprou 1 (+1)
  });
});

describe('comandos', () => {
  test('Olho do Antigo Oráculo (24): revela 2, devolve 1 ao baralho do oponente', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    state.sides[side].hand.length = 0;
    const command = putInHand(state, side, 24);
    const enemyHand = state.sides[enemy].hand.length;
    const enemyDeck = state.sides[enemy].deck.length;

    state = applyOk(state, { type: 'PLAY_COMMAND', side, cardUid: command });
    expect(state.pending?.type).toBe('choose_card');
    expect(state.pending?.side).toBe(side);
    state = answerOk(state, state.pending!.options[0]!.id);

    expect(state.sides[enemy].hand.length).toBe(enemyHand - 1);
    expect(state.sides[enemy].deck.length).toBe(enemyDeck + 1);
  });

  test('Ritual da Esfera Espectral (25): sacrifica e invoca Espectros que não atacam já', () => {
    let state = readyMatch({
      decks: {
        a: { hero: 'morgon', cards: testDeck([34, 35, 6, 1]) },
        b: { hero: 'morgon', cards: testDeck([34, 35, 6, 1]) },
      },
    });
    const side = state.activeSide;
    placeCreature(state, side, 0, 6); // sacrifício
    state.sides[side].hand.length = 0;
    const ritual = putInHand(state, side, 25);

    state = applyOk(state, {
      type: 'PLAY_COMMAND',
      side,
      cardUid: ritual,
      target: { side, slot: 0 },
    });

    const espectros = state.sides[side].field.filter(
      (c) => c !== null && c.cardId !== null && [34, 35].includes(c.cardId),
    );
    expect(espectros.length).toBe(2);
    for (const espectro of espectros) {
      expect(espectro!.canAttackFromTurn).toBe(state.turn + 1);
    }
    expect(state.sides[side].points).toBe(0); // sacrifício não pontua
    expect(state.sides[oppositeSide(side)].points).toBe(0);
    expect(state.sides[side].discard.some((c) => c.cardId === 6)).toBe(true);
  });

  test('Lua Sangrenta de Esdras (26): +1/+1 por "Esdras" no descarte, até o fim do turno', () => {
    let state = readyMatch();
    const side = state.activeSide;
    placeCreature(state, side, 0, 6); // Pirata 1/2
    state.sides[side].discard.push({ uid: 'esdras1', cardId: 4 }); // Leviathan de Esdras
    state.sides[side].hand.length = 0;
    const lua = putInHand(state, side, 26);

    state = applyOk(state, { type: 'PLAY_COMMAND', side, cardUid: lua, target: { side, slot: 0 } });
    expect(currentStats(state.sides[side].field[0]!, state.sides[side].field)).toEqual({
      attack: 2,
      defense: 3,
    });
    state = applyOk(state, { type: 'END_TURN', side });
    expect(currentStats(state.sides[side].field[0]!, state.sides[side].field)).toEqual({
      attack: 1,
      defense: 2,
    });
  });
});

describe('habilidades ativadas', () => {
  test('Mysticus (3): destrói anexo Tridente como custo, uma vez por turno', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const mysticus = placeCreature(state, side, 0, 3);
    attachDirectly(mysticus, 10); // Tridente do Assassino
    attachDirectly(mysticus, 10);
    const uid = mysticus.uid;

    state = applyOk(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: uid,
      abilityId: 'mysticus_destroy_tridente',
    });
    const after = state.sides[side].field[0]!;
    expect(after.attachments.length).toBe(1);
    // "não pode atacar durante o SEU próximo turno": o dono é o lado ativo, e o
    // próximo turno dele é dois à frente (decisão nº 33)
    expect(after.cannotAttackUntilTurn).toBe(state.turn + 2);

    const again = reduce(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: uid,
      abilityId: 'mysticus_destroy_tridente',
    });
    expect(again.error).toBeTruthy();
  });

  test('Badur, o Bebê Urso (30): sacrifica e invoca o Urso Guardião do descarte', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const bebe = placeCreature(state, side, 0, 30);
    state.sides[side].discard.push({ uid: 'urso_desc', cardId: 31 });

    state = applyOk(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: bebe.uid,
      abilityId: 'badur_bebe_sacrifice',
    });
    const urso = state.sides[side].field.find((c) => c?.cardId === 31);
    expect(urso).toBeDefined();
    expect(state.sides[side].discard.some((c) => c.cardId === 30)).toBe(true);
  });

  test('Sapocalibur (16): muda o elemento do Anfibio anexado, uma vez por turno', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const sapomerlim = placeCreature(state, side, 0, 7); // Anfibio
    attachDirectly(sapomerlim, 16);
    const attachmentUid = sapomerlim.attachments[0]!.uid;

    state = applyOk(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: attachmentUid,
      abilityId: 'sapocalibur_change_element',
      element: 'wind',
    });
    expect(state.sides[side].field[0]!.changedElement).toBe('wind');

    const again = reduce(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: attachmentUid,
      abilityId: 'sapocalibur_change_element',
      element: 'fire',
    });
    expect(again.error).toBeTruthy();
  });

  test('Feiticeiro Tribal (32): recusado fora do turno do oponente', () => {
    const state = readyMatch();
    const side = state.activeSide;
    const feiticeiro = placeCreature(state, side, 0, 32);
    const refusal = reduce(state, {
      type: 'ACTIVATE_ABILITY',
      side,
      sourceUid: feiticeiro.uid,
      abilityId: 'feiticeiro_tribal_forcar_ataque',
    });
    expect(refusal.error).toBeTruthy();
  });
});

describe('heróis e cenário', () => {
  test('Ispisher: cura 1 da criatura ferida com menos vida no início do turno', () => {
    let state = readyMatch(); // lado b tem Ispisher
    state = withActive(state, 'a');
    const wounded = placeCreature(state, 'b', 0, 31); // Badur Urso 2/5
    wounded.damage = 3;

    state = applyOk(state, { type: 'END_TURN', side: 'a' });
    expect(state.sides.b.field[0]!.damage).toBe(2);
  });

  test('Badur (herói): criatura Terra ganha +1 de vida máxima ao entrar', () => {
    let state = readyMatch(); // lado a tem Badur
    state = withActive(state, 'a');
    state.sides.a.hand.length = 0;
    const lobo = putInHand(state, 'a', 28); // terra

    state = applyOk(state, { type: 'SUMMON', side: 'a', cardUid: lobo, slot: 0 });
    const creature = state.sides.a.field[0]!;
    expect(creature.markers.defense).toBe(1);
    expect(creature.stoneSkinApplied).toBe(true);
  });

  test('Caverna do Guardião Badur (45): compra 1 na primeira destruição inimiga em batalha', () => {
    let state = readyMatch();
    const side = state.activeSide;
    const enemy = oppositeSide(side);
    state.sides[side].scenario = { uid: 'caverna', cardId: 45 };
    placeCreature(state, side, 0, 4); // Leviathan (atacante)
    placeCreature(state, enemy, 0, 6); // Pirata 1/2 (morre)
    const handBefore = state.sides[side].hand.length;

    state = applyOk(state, { type: 'ADVANCE_PHASE', side });
    state = applyOk(state, { type: 'ATTACK', side, slot: 0 });

    expect(state.sides[enemy].field[0]).toBeNull();
    expect(state.sides[side].hand.length).toBe(handBefore + 1);
    // e o Pirata devolveu 1 de dano ao destruidor (vingança)
    expect(state.sides[side].field[0]!.damage).toBeGreaterThanOrEqual(1);
  });
});
