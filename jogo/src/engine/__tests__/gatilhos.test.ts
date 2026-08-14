import { describe, expect, test } from 'vitest';
import { danoAposReducao } from '../combate.ts';
import { statsAtuais } from '../stats.ts';
import { ladoOposto } from '../estado.ts';
import {
  anexarDireto,
  aplicarOk,
  colocarCriatura,
  partidaPronta,
  porNaMao,
  responderOk,
} from './ajuda.ts';

/**
 * Gatilhos e efeitos que o legado declarava nas cartas mas nunca resolvia.
 * Cada teste cita a carta pelo id da arte (`public/assets/cards/NN.png`).
 */

describe('sent_from_field_to_your_discard', () => {
  test('Ceifador (35): morto em batalha, cria a ficha Espectro 1/1', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3
    colocarCriatura(estado, inimigo, 0, 35); // Ceifador 2/3

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    const ficha = estado.lados[inimigo].campo.find((criatura) => criatura?.ficha);
    expect(ficha?.ficha?.nome).toBe('Ficha Espectro');
    expect(ficha?.cartaId).toBeNull();
    expect(estado.lados[inimigo].descarte.some((carta) => carta.cartaId === 35)).toBe(true);
  });

  test('Poltergeist (34): do campo ao descarte, impede o ataque de uma inimiga', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3
    colocarCriatura(estado, inimigo, 0, 34); // Poltergeist 1/2

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.pendencia?.lado).toBe(inimigo);
    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    estado = responderOk(estado, `${lado}:0`);
    expect(estado.lados[lado].campo[0]!.naoPodeAtacarAteTurno).toBe(estado.turno + 1);
  });

  test('Lobo das Presas Prateadas (29): do campo ao descarte, invoca outra cópia do deck', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3
    colocarCriatura(estado, inimigo, 0, 29); // Lobo 2/1

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.pendencia?.lado).toBe(inimigo);
    estado = responderOk(estado, 'sim');
    const invocada = estado.lados[inimigo].campo.find((criatura) => criatura?.cartaId === 29);
    expect(invocada).toBeTruthy();
    expect(invocada!.podeAtacarAPartirDoTurno).toBe(estado.turno + 1);
  });
});

describe('self_element_changed', () => {
  test('Sapomerlim (7): empresta um elemento a outro Anfíbio até o fim do turno', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const sapomerlim = colocarCriatura(estado, lado, 0, 7); // Anfibio 2/3
    colocarCriatura(estado, lado, 1, 2); // Dheron, Anfibio 1/2
    anexarDireto(sapomerlim, 16); // Sapocalibur muda o elemento do portador
    const espada = sapomerlim.anexos[0]!.uid;

    estado = aplicarOk(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: espada,
      habilidadeId: 'sapocalibur_change_element',
      elemento: 'fogo',
    });
    expect(estado.lados[lado].campo[0]!.elementoAlterado).toBe('fogo');

    // o gatilho da própria criatura não pode mirar nela mesma
    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    expect(estado.pendencia!.opcoes.map((opcao) => opcao.id)).toEqual([`${lado}:1`]);
    estado = responderOk(estado, `${lado}:1`);
    expect(estado.pendencia?.tipo).toBe('escolher_elemento');
    estado = responderOk(estado, 'vento');

    const dheron = estado.lados[lado].campo[1]!;
    expect(dheron.elementoAlterado).toBe('vento');
    expect(dheron.elementoAlteradoAteTurno).toBe(estado.turno);

    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    expect(estado.lados[lado].campo[1]!.elementoAlterado).toBeUndefined();
  });

  test('Sapotristan (33): troca ATQ/VIDA com o elemento alterado e compra ao morrer', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    estado.lados[lado].mao.length = 0;
    colocarCriatura(estado, lado, 0, 33); // Sapotristan 1/3, "Contos"
    const pote = porNaMao(estado, lado, 20); // Pote da Sereia altera o elemento

    estado = aplicarOk(estado, { tipo: 'ANEXAR', lado, uidCarta: pote, slot: 0 });
    expect(estado.pendencia?.tipo).toBe('escolher_elemento');
    estado = responderOk(estado, 'fogo');

    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    estado = responderOk(estado, `${lado}:0`);
    const sapo = estado.lados[lado].campo[0]!;
    expect(sapo.trocaDeStatsComElementoAlterado).toBe(true);
    expect(statsAtuais(sapo, estado.lados[lado].campo)).toEqual({ attack: 3, defense: 1 });

    // destruída com o elemento alterado → o dono compra 1
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    colocarCriatura(estado, inimigo, 0, 4); // Leviathan 3/3
    const deckAntes = estado.lados[lado].deck.length;
    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado: inimigo });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado: inimigo, slot: 0 });

    expect(estado.lados[lado].campo[0]).toBeNull();
    expect(estado.lados[lado].deck.length).toBe(deckAntes - 1);
  });
});

describe('gatilhos de anexo em combate', () => {
  test('Reflexos de Morte (13): ao ser atacada, causa 1 de dano a uma criatura inimiga', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    colocarCriatura(estado, lado, 0, 31); // Badur Urso 2/5 (atacante)
    const pirata = colocarCriatura(estado, inimigo, 0, 6); // Pirata 1/2 (agua)
    anexarDireto(pirata, 13); // +1 VIDA → 1/3, sobrevive ao golpe

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.lados[inimigo].campo[0]).not.toBeNull();
    expect(estado.pendencia?.lado).toBe(inimigo);
    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    estado = responderOk(estado, `${lado}:0`);
    // 1 de dano do combate + 1 do Reflexos
    expect(estado.lados[lado].campo[0]!.dano).toBe(2);
  });

  test('Mapa do Tesouro (18): dano direto do portador permite comprar e descartar', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const atacante = colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3
    anexarDireto(atacante, 18);
    const maoAntes = estado.lados[lado].mao.length;

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 }); // coluna vazia → direto

    expect(estado.pendencia?.tipo).toBe('sim_nao');
    estado = responderOk(estado, 'sim');
    expect(estado.pendencia?.tipo).toBe('escolher_carta');
    const descartada = estado.pendencia!.opcoes[0]!.id;
    estado = responderOk(estado, descartada);

    expect(estado.lados[lado].mao.length).toBe(maoAntes); // +1 comprada, −1 descartada
    expect(estado.lados[lado].descarte.some((carta) => carta.uid === descartada)).toBe(true);
  });

  test('Afogamento (14): quando a criatura escolhida morre, o anexo vai ao descarte', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    estado.lados[lado].mao.length = 0;
    colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3 (agua)
    colocarCriatura(estado, inimigo, 0, 30); // Badur Bebê 0/2
    const afogamento = porNaMao(estado, lado, 14);

    estado = aplicarOk(estado, { tipo: 'ANEXAR', lado, uidCarta: afogamento, slot: 0 });
    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    estado = responderOk(estado, `${inimigo}:0`);

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.lados[inimigo].campo[0]).toBeNull();
    expect(estado.lados[lado].campo[0]!.anexos.length).toBe(0);
    expect(estado.lados[lado].descarte.some((carta) => carta.cartaId === 14)).toBe(true);
  });

  test('Resistência (44): reduz só a primeira leva de dano de cada turno', () => {
    const estado = partidaPronta();
    const alvo = colocarCriatura(estado, 'a', 0, 6);
    anexarDireto(alvo, 44);

    expect(danoAposReducao(alvo, estado.lados.a.campo, 3, 1)).toBe(2);
    expect(danoAposReducao(alvo, estado.lados.a.campo, 3, 1)).toBe(3);
    expect(danoAposReducao(alvo, estado.lados.a.campo, 3, 2)).toBe(2);
  });
});

describe('"outras criaturas": a fonte fica de fora', () => {
  test('Badur, o Urso Guardião (31): protege as OUTRAS Bestas Terra, não a si mesmo', () => {
    const estado = partidaPronta();
    const urso = colocarCriatura(estado, 'a', 0, 31); // Besta/terra
    const lobo = colocarCriatura(estado, 'a', 1, 28); // Besta/terra

    expect(danoAposReducao(urso, estado.lados.a.campo, 3, 1)).toBe(3);
    expect(danoAposReducao(lobo, estado.lados.a.campo, 3, 1)).toBe(2);
  });

  test('Esfera da Aura Espectral (17): +1 ATQ por OUTRO Espectro em campo', () => {
    const estado = partidaPronta();
    const ceifador = colocarCriatura(estado, 'a', 0, 35); // Espectro 2/3
    anexarDireto(ceifador, 17);
    expect(statsAtuais(ceifador, estado.lados.a.campo).attack).toBe(2);

    colocarCriatura(estado, 'a', 1, 34); // Poltergeist, outro Espectro
    expect(statsAtuais(ceifador, estado.lados.a.campo).attack).toBe(3);
  });
});

describe('invocação especial e cenário', () => {
  test('Leviathan (4): descarta-se da mão para invocar outro Esdras sobre uma criatura sua', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    estado.lados[lado].mao.length = 0;
    colocarCriatura(estado, lado, 0, 6); // Pirata, será coberto
    const custo = porNaMao(estado, lado, 4);
    const invocavel = porNaMao(estado, lado, 4);

    estado = aplicarOk(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: custo,
      habilidadeId: 'leviathan_special_summon',
    });
    expect(estado.lados[lado].descarte.some((carta) => carta.uid === custo)).toBe(true);

    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    estado = responderOk(estado, `${lado}:0`);
    expect(estado.pendencia?.tipo).toBe('escolher_carta');
    estado = responderOk(estado, invocavel);

    expect(estado.lados[lado].campo[0]!.uid).toBe(invocavel);
    expect(estado.lados[lado].campo[0]!.cartaId).toBe(4);
    expect(estado.lados[lado].descarte.some((carta) => carta.cartaId === 6)).toBe(true);
  });

  test('Caverna do Guardião Badur (45): Besta ao descarte dá +1 ATQ ao Urso até o fim do turno', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    estado.lados[inimigo].cenario = { uid: 'caverna', cartaId: 45 };
    colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3 (atacante)
    colocarCriatura(estado, inimigo, 0, 30); // Badur Bebê 0/2 (Besta, morre)
    colocarCriatura(estado, inimigo, 1, 31); // Badur, o Urso Guardião 2/5

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.pendencia?.lado).toBe(inimigo);
    estado = responderOk(estado, `${inimigo}:1`);
    // 2 base + 1 do marcador do próprio Urso + 1 temporário do cenário
    const urso = estado.lados[inimigo].campo[1]!;
    expect(statsAtuais(urso, estado.lados[inimigo].campo).attack).toBe(4);

    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    const depois = estado.lados[inimigo].campo[1]!;
    expect(statsAtuais(depois, estado.lados[inimigo].campo).attack).toBe(3);
  });
});
