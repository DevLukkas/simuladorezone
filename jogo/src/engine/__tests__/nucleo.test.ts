import { describe, expect, test } from 'vitest';
import { aplicarComando } from '../reduzir.ts';
import { statsAtuais } from '../stats.ts';
import { criarPartida } from '../criar.ts';
import { cartaPorId } from '../../data/cartas.ts';
import { ladoOposto, type EstadoDoJogo, type LadoId } from '../estado.ts';
import {
  anexarDireto,
  aplicarOk,
  colocarCriatura,
  deckDeTeste,
  irParaBatalha,
  partidaPronta,
} from './ajuda.ts';

describe('início da partida e mulligan', () => {
  test('cada lado começa com 5 cartas na mão e 35 no deck', () => {
    const criada = criarPartida({
      seed: 7,
      decks: {
        a: { heroi: 'badur', cartas: deckDeTeste([1, 2, 5, 6]) },
        b: { heroi: 'ispisher', cartas: deckDeTeste([1, 2, 5, 6]) },
      },
    });
    for (const lado of ['a', 'b'] as const) {
      expect(criada.estado.lados[lado].mao.length).toBe(5);
      expect(criada.estado.lados[lado].deck.length).toBe(35);
    }
    expect(criada.estado.fase).toBe('mulligan');
  });

  test('mulligan troca a mão; a partida começa quando ambos decidem', () => {
    const criada = criarPartida({
      seed: 7,
      decks: {
        a: { heroi: 'badur', cartas: deckDeTeste([1, 2, 5, 6, 28, 29]) },
        b: { heroi: 'ispisher', cartas: deckDeTeste([1, 2, 5, 6, 28, 29]) },
      },
    });
    const maoAntes = criada.estado.lados.a.mao.map((carta) => carta.uid).join(',');
    let estado = aplicarOk(criada.estado, { tipo: 'DECIDIR_MULLIGAN', lado: 'a', trocar: true });
    const maoDepois = estado.lados.a.mao.map((carta) => carta.uid).join(',');
    expect(maoDepois).not.toBe(maoAntes);
    expect(estado.lados.a.mao.length).toBe(5);
    expect(estado.fase).toBe('mulligan');

    estado = aplicarOk(estado, { tipo: 'DECIDIR_MULLIGAN', lado: 'b', trocar: false });
    expect(estado.fase).toBe('principal');
  });

  test('não se compra carta no primeiro turno; compra-se a partir do segundo', () => {
    const estado = partidaPronta();
    const ativo = estado.ladoAtivo;
    expect(estado.lados[ativo].mao.length).toBe(5);

    const proximo = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado: ativo });
    expect(proximo.lados[proximo.ladoAtivo].mao.length).toBe(6);
  });
});

describe('invocação', () => {
  test('uma invocação por turno, em slot vazio', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const criaturaNaMao = estado.lados[lado].mao.find((naMao) => {
      const carta = cartaPorId(naMao.cartaId);
      return carta.tipo === 'criatura' && carta.summonRule?.normal !== false;
    });
    expect(criaturaNaMao).toBeDefined();

    estado = aplicarOk(estado, { tipo: 'INVOCAR', lado, uidCarta: criaturaNaMao!.uid, slot: 2 });
    expect(estado.lados[lado].campo[2]?.uid).toBe(criaturaNaMao!.uid);

    const outra = estado.lados[lado].mao.find(
      (naMao) => cartaPorId(naMao.cartaId).tipo === 'criatura',
    );
    if (outra) {
      const recusa = aplicarComando(estado, { tipo: 'INVOCAR', lado, uidCarta: outra.uid, slot: 3 });
      expect(recusa.erro).toBeTruthy();
    }
  });

  test('criatura invocada não ataca no mesmo turno ("summoning sickness")', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const criaturaNaMao = estado.lados[lado].mao.find((naMao) => {
      const carta = cartaPorId(naMao.cartaId);
      return carta.tipo === 'criatura' && carta.summonRule?.normal !== false;
    })!;
    estado = aplicarOk(estado, { tipo: 'INVOCAR', lado, uidCarta: criaturaNaMao.uid, slot: 0 });
    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    const recusa = aplicarComando(estado, { tipo: 'ATACAR', lado, slot: 0 });
    expect(recusa.erro).toBeTruthy();
  });
});

describe('anexos', () => {
  test('habilidade exige elemento compatível; item anexa sempre', () => {
    const estado = partidaPronta();
    const lobo = colocarCriatura(estado, 'a', 0, 28); // terra
    const pirata = colocarCriatura(estado, 'a', 1, 6); // agua

    // Resistência (terra): compatível com o lobo, não com o pirata
    anexarDireto(lobo, 44);
    expect(statsAtuais(lobo, estado.lados.a.campo)).toEqual({ attack: 1, defense: 5 });

    // stats do pirata seguem os impressos
    expect(statsAtuais(pirata, estado.lados.a.campo)).toEqual({ attack: 1, defense: 2 });
  });

  test('aura de Azzure dá +1/+1 às OUTRAS Acquarium, nunca a ela mesma', () => {
    const estado = partidaPronta();
    const azzure = colocarCriatura(estado, 'a', 0, 1);
    const atlas = colocarCriatura(estado, 'a', 1, 5); // Acquarium 2/2
    const lobo = colocarCriatura(estado, 'a', 2, 28); // Besta — fora da aura

    expect(statsAtuais(azzure, estado.lados.a.campo)).toEqual({ attack: 2, defense: 4 });
    expect(statsAtuais(atlas, estado.lados.a.campo)).toEqual({ attack: 3, defense: 3 });
    expect(statsAtuais(lobo, estado.lados.a.campo)).toEqual({ attack: 1, defense: 3 });
  });
});

describe('combate', () => {
  test('dano simultâneo destrói os dois lados e pontua por raridade', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const oposto = lado === 'a' ? 'b' : 'a';
    colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3 (rara)
    colocarCriatura(estado, oposto, 0, 4); // Leviathan 3/3 (rara)

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    // 3 de dano de cada lado: os dois morrem e cada um pontua 1 pela rara
    expect(estado.lados[lado].campo[0]).toBeNull();
    expect(estado.lados[oposto].campo[0]).toBeNull();
    expect(estado.lados[oposto].pontos).toBe(1);
    expect(estado.lados[lado].pontos).toBe(1);
  });

  test('coluna vazia = dano direto; 5 de dano acumulado vira 1 ponto', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const oposto = lado === 'a' ? 'b' : 'a';
    colocarCriatura(estado, lado, 0, 4); // Leviathan atk 3

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });
    expect(estado.lados[oposto].danoDireto).toBe(3);
    expect(estado.lados[lado].pontos).toBe(0);

    // turno do oponente passa, ataca de novo: 3+3=6 → 1 ponto e sobra 1
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    estado = irParaBatalha(estado, lado);
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });
    expect(estado.lados[lado].pontos).toBe(1);
    expect(estado.lados[oposto].danoDireto).toBe(1);
  });

  test('Resistência reduz 1 de dano de combate', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const oposto = lado === 'a' ? 'b' : 'a';
    colocarCriatura(estado, lado, 0, 4); // Leviathan 3/3
    const lobo = colocarCriatura(estado, oposto, 0, 28); // Lobo do Uivo 1/3
    anexarDireto(lobo, 44); // Resistência: +0/+2, ignora 1

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    const loboDepois = estado.lados[oposto].campo[0];
    expect(loboDepois?.dano).toBe(2); // 3 de ataque − 1 de Resistência
    expect(statsAtuais(loboDepois!, estado.lados[oposto].campo).defense).toBe(3); // 3+2−2
  });

  test('Atropelar converte o excedente em dano direto', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const oposto = lado === 'a' ? 'b' : 'a';
    const atacante = colocarCriatura(estado, lado, 0, 29); // Lobo das Presas 2/1
    anexarDireto(atacante, 38); // Estouro da Manada: +1/+1 e Atropelar → 3/2
    colocarCriatura(estado, oposto, 0, 6); // Pirata Afogado 1/2

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.lados[oposto].campo[0]).toBeNull(); // pirata morre (2 de vida, 3 de dano)
    expect(estado.lados[oposto].danoDireto).toBe(1); // excedente 3−2
  });

  test('3 pontos encerram a partida', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    estado.lados[lado].pontos = 2;
    estado.lados[lado === 'a' ? 'b' : 'a'].danoDireto = 4;
    colocarCriatura(estado, lado, 0, 4); // atk 3 → completa 5 de dano direto

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.vencedor).toBe(lado);
    expect(estado.motivoDoFim).toBe('pontos');
    const recusa = aplicarComando(estado, { tipo: 'ENCERRAR_TURNO', lado });
    expect(recusa.erro).toBeTruthy();
  });
});

/**
 * MARCIAL, VORPAL e REGENERAR (Quatro Elementos). Os dois heróis são badur nos
 * testes de palavra-chave para tirar do caminho a cura de início de turno do
 * Ispisher, que mexeria no mesmo dano que a regeneração cura.
 */
describe('palavras-chave', () => {
  function partidaSemCuraDeHeroi(): EstadoDoJogo {
    return partidaPronta({
      decks: {
        a: { heroi: 'badur', cartas: deckDeTeste([1, 2, 5, 6, 28, 29, 30, 36]) },
        b: { heroi: 'badur', cartas: deckDeTeste([1, 2, 5, 6, 28, 29, 30, 36]) },
      },
    });
  }

  /** Devolve a partida em batalha com atacante e defensor na mesma coluna. */
  function batalhaEntre(
    atacanteId: number,
    defensorId: number,
  ): { estado: EstadoDoJogo; lado: LadoId; oposto: LadoId } {
    let estado = partidaSemCuraDeHeroi();
    const lado = estado.ladoAtivo;
    const oposto = ladoOposto(lado);
    colocarCriatura(estado, lado, 0, atacanteId);
    colocarCriatura(estado, oposto, 0, defensorId);
    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });
    return { estado, lado, oposto };
  }

  test('MARCIAL atacando: mata o defensor e não sofre dano', () => {
    // Devoradora de Virgens (46) 2/2 MARCIAL contra Atlas (5) 2/2
    const { estado, lado, oposto } = batalhaEntre(46, 5);
    expect(estado.lados[oposto].campo[0]).toBeNull();
    expect(estado.lados[lado].campo[0]!.dano).toBe(0);
  });

  test('MARCIAL defendendo: derruba o atacante antes do revide', () => {
    const { estado, lado, oposto } = batalhaEntre(5, 46);
    expect(estado.lados[lado].campo[0]).toBeNull();
    expect(estado.lados[oposto].campo[0]!.dano).toBe(0);
  });

  test('MARCIAL não anula o revide quando o golpe não mata', () => {
    // Mysticus (3) 1/5 aguenta os 2 da Devoradora e devolve 1
    const { estado, lado, oposto } = batalhaEntre(46, 3);
    expect(estado.lados[oposto].campo[0]!.dano).toBe(2);
    expect(estado.lados[lado].campo[0]!.dano).toBe(1);
  });

  test('MARCIAL dos dois lados: o dano volta a ser simultâneo', () => {
    const { estado, lado, oposto } = batalhaEntre(46, 46);
    expect(estado.lados[lado].campo[0]).toBeNull();
    expect(estado.lados[oposto].campo[0]).toBeNull();
  });

  test('VORPAL: destruiu a criatura inimiga → ATQ impresso vira dano direto', () => {
    // Éria (47) 2/3 VORPAL destrói o Badur bebê (30) 0/2
    const { estado, oposto } = batalhaEntre(47, 30);
    expect(estado.lados[oposto].campo[0]).toBeNull();
    expect(estado.lados[oposto].danoDireto).toBe(2);
  });

  test('VORPAL usa o ATQ impresso, não o modificado por marcadores', () => {
    let estado = partidaSemCuraDeHeroi();
    const lado = estado.ladoAtivo;
    const oposto = ladoOposto(lado);
    const eria = colocarCriatura(estado, lado, 0, 47); // 2/3
    eria.marcadores.attack = 2; // ataca com 4
    colocarCriatura(estado, oposto, 0, 5); // Atlas 2/2

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado });
    estado = aplicarOk(estado, { tipo: 'ATACAR', lado, slot: 0 });

    expect(estado.lados[oposto].campo[0]).toBeNull();
    expect(estado.lados[oposto].danoDireto).toBe(2);
  });

  test('VORPAL não dispara quando a criatura inimiga sobrevive', () => {
    const { estado, oposto } = batalhaEntre(47, 3); // Mysticus 1/5 aguenta
    expect(estado.lados[oposto].campo[0]).not.toBeNull();
    expect(estado.lados[oposto].danoDireto).toBe(0);
  });

  test('VORPAL defendendo: quem atacou leva o dano direto', () => {
    const { estado, lado, oposto } = batalhaEntre(5, 47);
    expect(estado.lados[lado].campo[0]).toBeNull();
    expect(estado.lados[oposto].campo[0]!.dano).toBe(2);
    expect(estado.lados[lado].danoDireto).toBe(2);
  });

  test('REGENERAR: recupera 1 de vida no início do turno do dono, sem passar do topo', () => {
    let estado = partidaSemCuraDeHeroi();
    const lado = estado.ladoAtivo;
    const oposto = ladoOposto(lado);
    const wargh = colocarCriatura(estado, lado, 0, 50); // 0/4 REGENERAR
    wargh.dano = 2;

    // turno do oponente: a criatura não regenera
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    expect(estado.lados[lado].campo[0]!.dano).toBe(2);

    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado: oposto });
    expect(estado.lados[lado].campo[0]!.dano).toBe(1);

    // de volta ao dono já curado: para em 0, não vira vida extra
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado: oposto });
    expect(estado.lados[lado].campo[0]!.dano).toBe(0);
    expect(statsAtuais(estado.lados[lado].campo[0]!, estado.lados[lado].campo).defense).toBe(4);

    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado: oposto });
    expect(estado.lados[lado].campo[0]!.dano).toBe(0);
  });
});

describe('fim de turno', () => {
  test('modificadores temporários expiram no fim do turno em que nasceram', () => {
    let estado = partidaPronta();
    const lado = estado.ladoAtivo;
    const criatura = colocarCriatura(estado, lado, 0, 6);
    criatura.modificadoresTemporarios.push({
      attack: 2,
      defense: 0,
      expiraAposTurno: estado.turno,
    });
    expect(statsAtuais(criatura, estado.lados[lado].campo).attack).toBe(3);

    estado = aplicarOk(estado, { tipo: 'ENCERRAR_TURNO', lado });
    const depois = estado.lados[lado].campo[0]!;
    expect(depois.modificadoresTemporarios.length).toBe(0);
    expect(statsAtuais(depois, estado.lados[lado].campo).attack).toBe(1);
  });

  test('conceder dá a vitória ao oponente', () => {
    const estado = partidaPronta();
    const resultado = aplicarComando(estado, { tipo: 'CONCEDER', lado: 'a' });
    expect(resultado.estado.vencedor).toBe('b');
    expect(resultado.estado.motivoDoFim).toBe('desistencia');
  });
});
