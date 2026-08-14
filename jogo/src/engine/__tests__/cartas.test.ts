import { describe, expect, test } from 'vitest';
import { aplicarComando } from '../reduzir.ts';
import { statsAtuais } from '../stats.ts';
import { ladoOposto, type EstadoDoJogo, type LadoId } from '../estado.ts';
import {
  anexarDireto,
  aplicarOk,
  colocarCriatura,
  deckDeTeste,
  partidaPronta,
  porNaMao,
  responderOk,
} from './ajuda.ts';

function comAtivo(estado: EstadoDoJogo, lado: LadoId): EstadoDoJogo {
  return estado.ladoAtivo === lado
    ? estado
    : aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado: estado.ladoAtivo });
}

describe('efeitos ao entrar em campo', () => {
  test('Atlas (5): descarta Tridente e busca carta com Atlantis no deck', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    estado.lados[lado].mao.length = 0;
    const atlas = porNaMao(estado, lado, 5);
    const tridente = porNaMao(estado, lado, 9);

    estado = aplicarOk(estado, { tipo: 'INVOCAR', lado, uidCarta: atlas, slot: 0 });
    expect(estado.pendencia?.tipo).toBe('escolher_carta');
    estado = responderOk(estado, tridente);
    expect(estado.lados[lado].descarte.some((c) => c.uid === tridente)).toBe(true);

    expect(estado.pendencia?.tipo).toBe('escolher_carta');
    const buscada = estado.pendencia!.opcoes[0]!.id;
    estado = responderOk(estado, buscada);
    expect(estado.lados[lado].mao.some((c) => c.uid === buscada)).toBe(true);
    expect(estado.pendencia).toBeNull();
  });

  test('Mamuthe (36): habilidade 1x/turno mói 2 e ganha +1 de vida por elemento', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const mamuthe = colocarCriatura(estado, lado, 0, 36);

    estado = aplicarOk(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: mamuthe.uid,
      habilidadeId: 'mamuthe_moer_e_crescer',
    });
    expect(estado.lados[lado].descarte.length).toBe(2);
    expect(estado.lados[lado].campo[0]!.marcadores.defense).toBeGreaterThanOrEqual(1);

    const repetida = aplicarComando(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: mamuthe.uid,
      habilidadeId: 'mamuthe_moer_e_crescer',
    });
    expect(repetida.erro).toBe('Habilidade já usada neste turno.');
  });

  test('Ceifador (35): embaralha Espectro do descarte e reduz ATQ inimigo até o fim do turno', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    estado.lados[lado].mao.length = 0;
    estado.lados[lado].descarte.push({ uid: 'poltergeist_desc', cartaId: 34 });
    colocarCriatura(estado, inimigo, 0, 6); // Pirata 1/2
    const ceifador = porNaMao(estado, lado, 35);

    const deckAntes = estado.lados[lado].deck.length;
    estado = aplicarOk(estado, { tipo: 'INVOCAR', lado, uidCarta: ceifador, slot: 1 });

    expect(estado.lados[lado].descarte.some((c) => c.uid === 'poltergeist_desc')).toBe(false);
    expect(estado.lados[lado].deck.length).toBe(deckAntes + 1);
    const pirata = estado.lados[inimigo].campo[0]!;
    expect(statsAtuais(pirata, estado.lados[inimigo].campo).attack).toBe(0); // 1 − 1
  });
});

describe('gatilhos de descarte (corrente)', () => {
  test('Mímico (8): morto em batalha, dono escolhe criatura aliada para o marcador', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3
    colocarCriatura(estado, inimigo, 0, 8); // Mímico 2/2
    colocarCriatura(estado, inimigo, 1, 34); // Poltergeist (alvo do marcador)

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.lados[inimigo].campo[0]).toBeNull();
    expect(estado.pendencia?.lado).toBe(inimigo);
    estado = responderOk(estado, 'sim');
    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    estado = responderOk(estado, `${inimigo}:1`);
    const poltergeist = estado.lados[inimigo].campo[1]!;
    expect(poltergeist.marcadores).toEqual({ attack: 1, defense: 1 });
  });

  test('Escolha as Cegas (22) com 2 Mímicos: corrente pede a ordem', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    colocarCriatura(estado, lado, 0, 6); // alvo dos marcadores
    estado.lados[lado].mao.length = 0;
    const comando = porNaMao(estado, lado, 22);
    porNaMao(estado, lado, 8);
    porNaMao(estado, lado, 8);

    estado = aplicarOk(estado, { tipo: 'JOGAR_COMANDO', lado, uidCarta: comando });
    // descartou 2, comprou 2
    expect(estado.lados[lado].mao.length).toBe(2);
    expect(estado.pendencia?.tipo).toBe('escolher_ordem');
    estado = responderOk(estado, '0');
    estado = responderOk(estado, 'sim');
    estado = responderOk(estado, `${lado}:0`);
    // segundo mímico da corrente: recusado
    expect(estado.pendencia?.tipo).toBe('sim_nao');
    estado = responderOk(estado, 'nao');
    expect(estado.pendencia).toBeNull();
    expect(estado.lados[lado].campo[0]!.marcadores).toEqual({ attack: 1, defense: 1 });
  });

  test('Badur, o Urso Guardião (31): +1/+1 quando outra Besta sua vai ao descarte', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    colocarCriatura(estado, lado, 1, 4); // Leviathan atacante
    colocarCriatura(estado, inimigo, 0, 31); // Badur Urso
    colocarCriatura(estado, inimigo, 1, 29); // Lobo das Presas 2/1 (Besta)

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 1 });

    expect(estado.lados[inimigo].campo[1]).toBeNull();
    expect(estado.lados[inimigo].campo[0]!.marcadores).toEqual({ attack: 1, defense: 1 });
  });
});

describe('anexos com gatilho', () => {
  test('Tridente Poderoso de Atlas (9) em dobro: oponente descarta 1 aleatória', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    colocarCriatura(estado, lado, 0, 6); // Pirata (agua)
    estado.lados[lado].mao.length = 0;
    const primeiro = porNaMao(estado, lado, 9);
    const segundo = porNaMao(estado, lado, 9);
    const maoInimiga = estado.lados[inimigo].mao.length;

    estado = aplicarOk(estado, { tipo: 'ANEXAR', lado, uidCarta: primeiro, slot: 0 });
    expect(estado.lados[inimigo].mao.length).toBe(maoInimiga);
    estado = aplicarOk(estado, { tipo: 'ANEXAR', lado, uidCarta: segundo, slot: 0 });
    expect(estado.lados[inimigo].mao.length).toBe(maoInimiga - 1);
    expect(estado.lados[inimigo].descarte.length).toBe(1);
  });

  test('Tridente Mágico de Corais (12): ao atacar, escolhe inimiga que não atacará', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    const atacante = colocarCriatura(estado, lado, 0, 6);
    anexarDireto(atacante, 12);
    colocarCriatura(estado, inimigo, 0, 31); // Badur Urso 2/5 (sobrevive)
    colocarCriatura(estado, inimigo, 1, 6);

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });
    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    estado = responderOk(estado, `${inimigo}:1`);

    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado: inimigo });
    const recusa = aplicarComando(estado, { tipo: 'ATACAR', lado: inimigo, slot: 1 });
    expect(recusa.erro).toBeTruthy();
  });

  test('Afogamento (14): -1 de vida por anexo da criatura escolhida', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    const minha = colocarCriatura(estado, lado, 0, 6);
    void minha;
    const alvo = colocarCriatura(estado, inimigo, 0, 6); // Pirata 1/2
    anexarDireto(alvo, 10);
    anexarDireto(alvo, 10); // 2 anexos → −2 de vida
    estado.lados[lado].mao.length = 0;
    const afogamento = porNaMao(estado, lado, 14);

    estado = aplicarOk(estado, { tipo: 'ANEXAR', lado, uidCarta: afogamento, slot: 0 });
    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    estado = responderOk(estado, `${inimigo}:0`);
    // 2 de vida − 2 = 0 → destruída
    expect(estado.lados[inimigo].campo[0]).toBeNull();
  });

  test('Manopla do Poder (19): +3 ATQ e 1 de dano no fim do próximo turno', () => {
    // heróis sem cura para o dano adiado não ser desfeito pelo Ispisher
    let estado = partidaPronta({
      decks: {
        a: { heroi: 'morgon', cartas: deckDeTeste([1, 2, 5, 6]) },
        b: { heroi: 'morgon', cartas: deckDeTeste([1, 2, 5, 6]) },
      },
    });
    const lado = estado.ladoAtivo;
    colocarCriatura(estado, lado, 0, 6); // Pirata 1/2
    estado.lados[lado].mao.length = 0;
    const manopla = porNaMao(estado, lado, 19);

    estado = aplicarOk(estado, { tipo: 'ANEXAR', lado, uidCarta: manopla, slot: 0 });
    expect(statsAtuais(estado.lados[lado].campo[0]!, estado.lados[lado].campo).attack).toBe(4);

    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    expect(estado.lados[lado].campo[0]!.dano).toBe(0);
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado: ladoOposto(lado) });
    expect(estado.lados[lado].campo[0]!.dano).toBe(1);
  });

  test('Pote da Sereia (20) muda o elemento; Dheron (2) reage com +1 de vida', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    colocarCriatura(estado, lado, 0, 2); // Dheron (Anfibio, agua)
    estado.lados[lado].mao.length = 0;
    const pote = porNaMao(estado, lado, 20);

    estado = aplicarOk(estado, { tipo: 'ANEXAR', lado, uidCarta: pote, slot: 0 });
    expect(estado.pendencia?.tipo).toBe('escolher_elemento');
    estado = responderOk(estado, 'fogo');

    const dheron = estado.lados[lado].campo[0]!;
    expect(dheron.elementoAlterado).toBe('fogo');
    expect(dheron.marcadores.defense).toBe(1); // gatilho do próprio Dheron
  });

  test('Esfera da Aura Espectral (17): cria ficha e dá +1 ATQ por Espectro', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    colocarCriatura(estado, lado, 0, 6); // Pirata
    estado.lados[lado].mao.length = 0;
    const esfera = porNaMao(estado, lado, 17);

    estado = aplicarOk(estado, { tipo: 'ANEXAR', lado, uidCarta: esfera, slot: 0 });
    const ficha = estado.lados[lado].campo.find((c) => c?.cartaId === null);
    expect(ficha?.ficha?.raca).toBe('Espectro');
    expect(statsAtuais(estado.lados[lado].campo[0]!, estado.lados[lado].campo).attack).toBe(2); // 1 + 1
  });

  test('Corpo Translúcido (42): bloqueia atacantes com 3+ de vida atual', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3
    colocarCriatura(estado, lado, 1, 6); // Pirata 1/2
    const protegida = colocarCriatura(estado, inimigo, 0, 34);
    anexarDireto(protegida, 42);
    const protegida2 = colocarCriatura(estado, inimigo, 1, 34);
    anexarDireto(protegida2, 42);

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    const bloqueado = aplicarComando(estado, { tipo: 'ATACAR', lado, slot: 0 });
    expect(bloqueado.erro).toBeTruthy();
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 1 });
    expect(estado.lados[inimigo].campo[1]!.dano).toBe(1);
  });

  test('Proteção do Escudeiro (43): defensor nega o ataque descartando a carta', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    colocarCriatura(estado, lado, 0, 4); // Leviathan
    const contos = colocarCriatura(estado, inimigo, 0, 33); // Sapotristan ("Contos")
    anexarDireto(contos, 43);

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });
    expect(estado.pendencia?.lado).toBe(inimigo);
    estado = responderOk(estado, 'sim');

    const defensor = estado.lados[inimigo].campo[0]!;
    expect(defensor.dano).toBe(0);
    expect(defensor.anexos.length).toBe(0);
    // o atacante não gastou o ataque; sem o escudo (+1/+2), o segundo ataque
    // encontra Sapotristan em 1/3 e o destrói (rara → 1 ponto)
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });
    expect(estado.lados[inimigo].campo[0]).toBeNull();
    expect(estado.lados[lado].pontos).toBe(1);
  });

  test('Guardião Enlouquecido (39): buff nas OUTRAS Bestas; destrói a anexada se não atacar', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const lobo = colocarCriatura(estado, lado, 0, 28); // Lobo do Uivo (Besta, terra) 1/3
    colocarCriatura(estado, lado, 1, 30); // Badur, o Bebê Urso (Besta) 0/2
    anexarDireto(lobo, 39); // +2/+2

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 }); // coluna vazia → direto
    // o buff é só das OUTRAS Bestas: a atacante fica em 1+2, a parceira ganha +1
    expect(statsAtuais(estado.lados[lado].campo[0]!, estado.lados[lado].campo).attack).toBe(3);
    expect(statsAtuais(estado.lados[lado].campo[1]!, estado.lados[lado].campo).attack).toBe(1);
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    expect(estado.lados[lado].campo[0]).not.toBeNull(); // atacou, sobreviveu

    estado = comAtivo(estado, lado);
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado }); // não atacou
    expect(estado.lados[lado].campo[0]).toBeNull();
    expect(estado.lados[lado].pontos).toBe(0); // destruição por efeito não pontua
  });

  test('Posse de Objetos Inanimados (41): descartada por substituição, permite comprar', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const poltergeist = colocarCriatura(estado, lado, 0, 34); // vazio
    anexarDireto(poltergeist, 41); // Posse (vazio)
    anexarDireto(poltergeist, 42); // Corpo (vazio)
    const posseUid = poltergeist.anexos[0]!.uid;
    estado.lados[lado].mao.length = 0;
    const novoCorpo = porNaMao(estado, lado, 42);
    const maoAntes = estado.lados[lado].mao.length;

    estado = aplicarOk(estado, {
      tipo: 'ANEXAR',
      lado,
      uidCarta: novoCorpo,
      slot: 0,
      substituirAnexoUid: posseUid,
    });
    expect(estado.pendencia?.tipo).toBe('sim_nao');
    estado = responderOk(estado, 'sim');
    expect(estado.lados[lado].mao.length).toBe(maoAntes); // anexou 1 (−1), comprou 1 (+1)
  });
});

describe('comandos', () => {
  test('Olho do Antigo Oráculo (24): revela 2, devolve 1 ao baralho do oponente', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    estado.lados[lado].mao.length = 0;
    const comando = porNaMao(estado, lado, 24);
    const maoInimiga = estado.lados[inimigo].mao.length;
    const deckInimigo = estado.lados[inimigo].deck.length;

    estado = aplicarOk(estado, { tipo: 'JOGAR_COMANDO', lado, uidCarta: comando });
    expect(estado.pendencia?.tipo).toBe('escolher_carta');
    expect(estado.pendencia?.lado).toBe(lado);
    estado = responderOk(estado, estado.pendencia!.opcoes[0]!.id);

    expect(estado.lados[inimigo].mao.length).toBe(maoInimiga - 1);
    expect(estado.lados[inimigo].deck.length).toBe(deckInimigo + 1);
  });

  test('Ritual da Esfera Espectral (25): sacrifica e invoca Espectros que não atacam já', () => {
    let estado = partidaPronta({
      decks: {
        a: { heroi: 'morgon', cartas: deckDeTeste([34, 35, 6, 1]) },
        b: { heroi: 'morgon', cartas: deckDeTeste([34, 35, 6, 1]) },
      },
    });
    const lado = estado.ladoAtivo;
    colocarCriatura(estado, lado, 0, 6); // sacrifício
    estado.lados[lado].mao.length = 0;
    const ritual = porNaMao(estado, lado, 25);

    estado = aplicarOk(estado, {
      tipo: 'JOGAR_COMANDO',
      lado,
      uidCarta: ritual,
      alvo: { lado, slot: 0 },
    });

    const espectros = estado.lados[lado].campo.filter(
      (c) => c !== null && c.cartaId !== null && [34, 35].includes(c.cartaId),
    );
    expect(espectros.length).toBe(2);
    for (const espectro of espectros) {
      expect(espectro!.podeAtacarAPartirDoTurno).toBe(estado.turno + 1);
    }
    expect(estado.lados[lado].pontos).toBe(0); // sacrifício não pontua
    expect(estado.lados[ladoOposto(lado)].pontos).toBe(0);
    expect(estado.lados[lado].descarte.some((c) => c.cartaId === 6)).toBe(true);
  });

  test('Lua Sangrenta de Esdras (26): +1/+1 por "Esdras" no descarte, até o fim do turno', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    colocarCriatura(estado, lado, 0, 6); // Pirata 1/2
    estado.lados[lado].descarte.push({ uid: 'esdras1', cartaId: 4 }); // Leviathan de Esdras
    estado.lados[lado].mao.length = 0;
    const lua = porNaMao(estado, lado, 26);

    estado = aplicarOk(estado, { tipo: 'JOGAR_COMANDO', lado, uidCarta: lua, alvo: { lado, slot: 0 } });
    expect(statsAtuais(estado.lados[lado].campo[0]!, estado.lados[lado].campo)).toEqual({
      attack: 2,
      defense: 3,
    });
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    expect(statsAtuais(estado.lados[lado].campo[0]!, estado.lados[lado].campo)).toEqual({
      attack: 1,
      defense: 2,
    });
  });
});

describe('habilidades ativadas', () => {
  test('Mysticus (3): destrói anexo Tridente como custo, uma vez por turno', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const mysticus = colocarCriatura(estado, lado, 0, 3);
    anexarDireto(mysticus, 10); // Tridente do Assassino
    anexarDireto(mysticus, 10);
    const uid = mysticus.uid;

    estado = aplicarOk(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: uid,
      habilidadeId: 'mysticus_destroy_tridente',
    });
    const depois = estado.lados[lado].campo[0]!;
    expect(depois.anexos.length).toBe(1);
    expect(depois.naoPodeAtacarAteTurno).toBe(estado.turno + 1);

    const denovo = aplicarComando(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: uid,
      habilidadeId: 'mysticus_destroy_tridente',
    });
    expect(denovo.erro).toBeTruthy();
  });

  test('Badur, o Bebê Urso (30): sacrifica e invoca o Urso Guardião do descarte', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const bebe = colocarCriatura(estado, lado, 0, 30);
    estado.lados[lado].descarte.push({ uid: 'urso_desc', cartaId: 31 });

    estado = aplicarOk(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: bebe.uid,
      habilidadeId: 'badur_bebe_sacrifice',
    });
    const urso = estado.lados[lado].campo.find((c) => c?.cartaId === 31);
    expect(urso).toBeDefined();
    expect(estado.lados[lado].descarte.some((c) => c.cartaId === 30)).toBe(true);
  });

  test('Sapocalibur (16): muda o elemento do Anfibio anexado, uma vez por turno', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const sapomerlim = colocarCriatura(estado, lado, 0, 7); // Anfibio
    anexarDireto(sapomerlim, 16);
    const anexoUid = sapomerlim.anexos[0]!.uid;

    estado = aplicarOk(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: anexoUid,
      habilidadeId: 'sapocalibur_change_element',
      elemento: 'vento',
    });
    expect(estado.lados[lado].campo[0]!.elementoAlterado).toBe('vento');

    const denovo = aplicarComando(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: anexoUid,
      habilidadeId: 'sapocalibur_change_element',
      elemento: 'fogo',
    });
    expect(denovo.erro).toBeTruthy();
  });

  test('Feiticeiro Tribal (32): recusado fora do turno do oponente', () => {
    const estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const feiticeiro = colocarCriatura(estado, lado, 0, 32);
    const recusa = aplicarComando(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado,
      origemUid: feiticeiro.uid,
      habilidadeId: 'feiticeiro_tribal_forcar_ataque',
    });
    expect(recusa.erro).toBeTruthy();
  });
});

describe('heróis e cenário', () => {
  test('Ispisher: cura 1 da criatura ferida com menos vida no início do turno', () => {
    let estado = partidaPronta(); // lado b tem Ispisher
    estado = comAtivo(estado, 'a');
    const ferida = colocarCriatura(estado, 'b', 0, 31); // Badur Urso 2/5
    ferida.dano = 3;

    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado: 'a' });
    expect(estado.lados.b.campo[0]!.dano).toBe(2);
  });

  test('Badur (herói): criatura Terra ganha +1 de vida máxima ao entrar', () => {
    let estado = partidaPronta(); // lado a tem Badur
    estado = comAtivo(estado, 'a');
    estado.lados.a.mao.length = 0;
    const lobo = porNaMao(estado, 'a', 28); // terra

    estado = aplicarOk(estado, { tipo: 'INVOCAR', lado: 'a', uidCarta: lobo, slot: 0 });
    const criatura = estado.lados.a.campo[0]!;
    expect(criatura.marcadores.defense).toBe(1);
    expect(criatura.peleDePedraAplicada).toBe(true);
  });

  test('Caverna do Guardião Badur (45): compra 1 na primeira destruição inimiga em batalha', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const inimigo = ladoOposto(lado);
    estado.lados[lado].cenario = { uid: 'caverna', cartaId: 45 };
    colocarCriatura(estado, lado, 0, 4); // Leviathan (atacante)
    colocarCriatura(estado, inimigo, 0, 6); // Pirata 1/2 (morre)
    const maoAntes = estado.lados[lado].mao.length;

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.lados[inimigo].campo[0]).toBeNull();
    expect(estado.lados[lado].mao.length).toBe(maoAntes + 1);
    // e o Pirata devolveu 1 de dano ao destruidor (vingança)
    expect(estado.lados[lado].campo[0]!.dano).toBeGreaterThanOrEqual(1);
  });
});
