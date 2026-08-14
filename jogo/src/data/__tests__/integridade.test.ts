import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TODAS_AS_CARTAS, cartaPorId, cartasDoFormato, formatoDaCarta } from '../cartas.ts';
import { herois } from '../herois.ts';
import { validarDeck } from '../regras.ts';
import { FORMATOS, type PalavraChave } from '../tipos.ts';

const publico = join(import.meta.dirname, '../../../public');
const arquivosEm = (pasta: string) => new Set(readdirSync(join(publico, pasta)));

/** Clássico ocupa 1..45; cada formato seguinte começa depois do anterior. */
const PRIMEIRO_ID = { classico: 1, 'quatro-elementos': 46 } as const;

describe('catálogo de cartas', () => {
  test('ids são únicos em todo o catálogo', () => {
    const ids = TODAS_AS_CARTAS.map((carta) => carta.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('nomes são únicos em todo o catálogo', () => {
    const nomes = TODAS_AS_CARTAS.map((carta) => carta.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  test('cada formato ocupa uma faixa de ids contígua e própria', () => {
    for (const formato of FORMATOS) {
      const cartas = cartasDoFormato(formato);
      if (!cartas.length) continue;
      const ids = cartas.map((carta) => carta.id).sort((a, b) => a - b);
      expect(ids[0], `${formato} começa no id errado`).toBe(PRIMEIRO_ID[formato]);
      expect(ids, `${formato} tem lacuna ou repetição de id`).toEqual(
        Array.from({ length: ids.length }, (_, i) => PRIMEIRO_ID[formato] + i),
      );
    }
  });

  test('cartaPorId devolve a carta certa e rejeita id inexistente', () => {
    expect(cartaPorId(31).nome).toBe('Badur, o Urso Guardião');
    expect(() => cartaPorId(999)).toThrow();
  });
});

describe('formato clássico', () => {
  const classicas = cartasDoFormato('classico');

  test('são 45 cartas', () => {
    expect(classicas.length).toBe(45);
  });

  test('a arte impressa de cada carta corresponde ao id (01.png ... 45.png)', () => {
    for (const carta of classicas) {
      expect(carta.img).toBe(`${String(carta.id).padStart(2, '0')}.png`);
    }
  });

  test('todas as artes impressas existem em public/assets/cards', () => {
    const arquivos = arquivosEm('assets/cards');
    for (const carta of classicas) {
      expect(arquivos.has(carta.img ?? ''), `falta a arte ${carta.img}`).toBe(true);
    }
  });

  test('toda carta tem a ilustração recortada usada pela carta composta', () => {
    const arquivos = arquivosEm('assets/arte');
    for (const carta of classicas) {
      const ilustracao = (carta.img ?? '').replace(/\.png$/, '.webp');
      expect(arquivos.has(ilustracao), `falta a ilustração ${ilustracao}`).toBe(true);
    }
  });
});

describe('formato quatro elementos', () => {
  const novas = cartasDoFormato('quatro-elementos');

  test('são as 33 cartas dos baralhos iniciais do Figma', () => {
    expect(novas.length).toBe(33);
  });

  test('a distribuição por tipo bate com as seções do quadro do Figma', () => {
    const conta = (tipo: string) => novas.filter((carta) => carta.tipo === tipo).length;
    expect({
      criatura: conta('criatura'),
      item: conta('item'),
      habilidade: conta('habilidade'),
      comando: conta('comando'),
    }).toEqual({ criatura: 13, item: 5, habilidade: 10, comando: 5 });
  });

  test('todas têm texto de regras e código de coleção', () => {
    for (const carta of novas) {
      expect(carta.efeito, `${carta.nome} sem texto`).toBeTruthy();
      expect(carta.ref, `${carta.nome} sem ref`).toMatch(/^GES-\d{4}$/);
    }
  });

  /** nunca foram impressas: existe a ilustração, não a carta pronta — só o modo composto */
  test('não têm carta impressa, e por isso só renderizam compostas', () => {
    for (const carta of novas) {
      expect(carta.img, `${carta.nome} ganhou carta impressa — atualize o teste`).toBeUndefined();
    }
  });

  test('a ilustração de cada carta vem do Figma e corresponde ao id', () => {
    const arquivos = arquivosEm('assets/arte');
    for (const carta of novas) {
      expect(carta.arte, `${carta.nome} sem ilustração`).toBe(`${carta.id}.webp`);
      expect(arquivos.has(carta.arte ?? ''), `falta a ilustração ${carta.arte}`).toBe(true);
    }
  });

  test('elemento segue o baralho: vento, fogo, terra, e neutro em item e comando', () => {
    for (const carta of novas) {
      if (carta.tipo === 'item' || carta.tipo === 'comando') {
        expect(carta.elemento, `${carta.nome} deveria ser neutro`).toBe('neutro');
      } else {
        expect(['vento', 'fogo', 'terra']).toContain(carta.elemento);
      }
    }
  });

  /**
   * A palavra-chave é regra fechada e vale em jogo mesmo com a carta pendente,
   * então texto impresso e campo declarado têm de dizer a mesma coisa — e uma
   * palavra nova em caixa alta não pode entrar sem definição no motor.
   */
  test('palavra-chave impressa e campo declarado dizem a mesma coisa', () => {
    const PALAVRAS_CHAVE = Object.keys({
      atropelar: true,
      marcial: true,
      vorpal: true,
      regenerar: true,
    } satisfies Record<PalavraChave, true>) as PalavraChave[];

    for (const carta of novas) {
      const primeiraLinha = (carta.efeito ?? '').split('\n')[0]!.trim();
      const impressa = PALAVRAS_CHAVE.find((chave) => chave.toUpperCase() === primeiraLinha);
      const declaradas = carta.tipo === 'criatura' ? (carta.palavrasChave ?? []) : [];

      expect(declaradas, `${carta.nome}: texto impresso e palavrasChave discordam`).toEqual(
        impressa ? [impressa] : [],
      );
      expect(
        /^[A-ZÀ-Ú]{4,}$/.test(primeiraLinha) && !impressa,
        `${carta.nome} abre com "${primeiraLinha}", que o motor não conhece como palavra-chave`,
      ).toBe(false);
    }
  });

  /**
   * Enquanto `efeitoPendente`, a carta é baunilha: existe no catálogo e não resolve
   * nada — fora a palavra-chave, que é implementada à parte (as 6 com MARCIAL,
   * VORPAL ou REGENERAR seguem devendo só o parágrafo em prosa).
   */
  test('carta marcada como pendente não declara comportamento nenhum', () => {
    for (const carta of novas.filter((c) => c.efeitoPendente)) {
      const blocos = [
        'effects' in carta ? carta.effects : undefined,
        'triggeredAbilities' in carta ? carta.triggeredAbilities : undefined,
        'activatedAbilities' in carta ? carta.activatedAbilities : undefined,
        'onEnter' in carta ? carta.onEnter : undefined,
      ];
      for (const bloco of blocos) {
        expect(bloco, `${carta.nome} tem bloco declarativo e ainda está marcada pendente`)
          .toBeUndefined();
      }
    }
  });
});

describe('peças do molde da carta composta', () => {
  const necessarias = [
    'moldura',
    'pill-nome',
    'pill-subtitulo',
    'caixa-efeito',
    'barra-rodape',
    'badge-ataque',
    'badge-vida',
    // 7 elementos + símbolos de item, cenário e comando
    ...Array.from({ length: 9 }, (_, i) => `hexagono-${i + 1}`),
    // 3 raridades, cada uma com base e símbolo
    ...Array.from({ length: 6 }, (_, i) => `diamante-${i + 1}`),
  ];

  test('todas as peças foram baixadas do Figma', () => {
    for (const peca of necessarias) {
      expect(existsSync(join(publico, 'assets/molde', `${peca}.webp`)), `falta ${peca}.webp`).toBe(
        true,
      );
    }
  });

  test('as fontes estão self-hospedadas', () => {
    expect(existsSync(join(publico, 'assets/fontes/fontes.css'))).toBe(true);
  });
});

describe('heróis', () => {
  test('são 5, com retratos em public/assets/heroes', () => {
    expect(herois.length).toBe(5);
    const arquivos = arquivosEm('assets/heroes');
    for (const heroi of herois) {
      expect(arquivos.has(heroi.img), `falta o retrato ${heroi.img}`).toBe(true);
    }
  });
});

describe('validarDeck', () => {
  const deckValido = {
    nome: 'Matilha de Badur',
    heroi: 'badur',
    cartas: { 28: 3, 29: 3, 30: 3, 31: 2, 36: 3, 37: 3, 38: 3, 43: 3, 44: 3 },
  };

  test('aceita um deck dentro das regras', () => {
    expect(validarDeck(deckValido)).toEqual([]);
  });

  test('rejeita mais de 3 cópias', () => {
    const problemas = validarDeck({ ...deckValido, cartas: { ...deckValido.cartas, 28: 4 } });
    expect(problemas.some((p) => p.includes('cópias'))).toBe(true);
  });

  test('rejeita mais de 40 cartas', () => {
    const cartas: Record<number, number> = {};
    for (let id = 1; id <= 20; id++) cartas[id] = 3;
    const problemas = validarDeck({ ...deckValido, cartas });
    expect(problemas.some((p) => p.includes('máximo 40'))).toBe(true);
  });

  test('rejeita herói e carta inexistentes', () => {
    const problemas = validarDeck({ nome: 'x', heroi: 'zeus', cartas: { 999: 1 } });
    expect(problemas.length).toBeGreaterThanOrEqual(2);
  });

  test('rejeita carta de outro formato', () => {
    const deOutroFormato = TODAS_AS_CARTAS.find((carta) => formatoDaCarta(carta) !== 'classico');
    if (!deOutroFormato) return; // só há um formato povoado por enquanto
    const problemas = validarDeck({
      ...deckValido,
      formato: 'classico',
      cartas: { ...deckValido.cartas, [deOutroFormato.id]: 1 },
    });
    expect(problemas.some((p) => p.includes('formato'))).toBe(true);
  });

  test('um deck do formato novo não aceita carta clássica', () => {
    const problemas = validarDeck({
      nome: 'misto',
      heroi: 'badur',
      formato: 'quatro-elementos',
      cartas: { 1: 1 },
    });
    expect(problemas.some((p) => p.includes('formato'))).toBe(true);
  });
});
