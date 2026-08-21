import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_CARDS, cardById } from '../cards.ts';
import { heroes } from '../heroes.ts';
import { validateDeck } from '../deckRules.ts';
import { validateCard } from '../validate.ts';
import type { Keyword } from '../types.ts';
import ptBR from '../../i18n/locales/pt-BR.ts';

const publicFolder = join(import.meta.dirname, '../../../public');
const filesIn = (folder: string) => new Set(readdirSync(join(publicFolder, folder)));

/**
 * As duas levas que ENTRARAM prontas: 1..45 são as impressas do legado e 46..78 as
 * importadas do frame do Figma. O que se afirma sobre elas — quantas são, como se
 * distribuem por tipo, que elemento têm — é fato histórico daquelas levas, não regra
 * do catálogo: desde o estúdio de cartas (decisão nº 22) o DevLukkas cria carta pela
 * tela, e uma carta nova não tem por que caber nessas contas. Por isso os blocos
 * abaixo são recortados por faixa de id, e o que vale para toda carta — arte no
 * lugar, palavra-chave batendo com o texto, pendente sem comportamento — vale
 * também para as criadas depois.
 */
const LAST_PRINTED = 45;
const LAST_IMPORTED = 78;

const isPrinted = (card: { id: number }) => card.id <= LAST_PRINTED;
const isImported = (card: { id: number }) => card.id > LAST_PRINTED && card.id <= LAST_IMPORTED;

describe('catálogo de cartas', () => {
  test('ids são únicos em todo o catálogo', () => {
    const ids = ALL_CARDS.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('nomes são únicos em todo o catálogo', () => {
    const names = ALL_CARDS.map((card) => card.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * As duas PROCEDÊNCIAS não dividem id: as impressas do legado ocupam 1..45 e as
   * importadas do Figma começam em 46. Não é mais divisa de formato (decisão
   * nº 36) — as duas jogam no mesmo pool —, mas segue sendo o que amarra id a
   * arte e a código de coleção, e é por faixa de id que os blocos abaixo separam
   * o que se pode afirmar de cada leva.
   */
  test('as duas levas de origem não dividem id', () => {
    const printed = ALL_CARDS.filter(isPrinted).map((card) => card.id);
    const imported = ALL_CARDS.filter(isImported).map((card) => card.id);
    expect(Math.min(...printed)).toBe(1);
    expect(Math.min(...imported)).toBe(LAST_PRINTED + 1);
    expect(printed.some((id) => imported.includes(id))).toBe(false);
  });

  test('cartaPorId devolve a carta certa e rejeita id inexistente', () => {
    expect(cardById(31).name).toBe('Badur, o Urso Guardião');
    expect(() => cardById(999)).toThrow();
  });
});

describe('as 45 impressas do legado', () => {
  const classicCards = ALL_CARDS.filter(isPrinted);

  test('são 45 cartas', () => {
    expect(classicCards.length).toBe(45);
  });

  test('a arte impressa de cada carta corresponde ao id (01.png ... 45.png)', () => {
    for (const card of classicCards) {
      expect(card.img).toBe(`${String(card.id).padStart(2, '0')}.png`);
    }
  });

  test('todas as artes impressas existem em public/assets/cards', () => {
    const files = filesIn('assets/cards');
    for (const card of classicCards) {
      expect(files.has(card.img ?? ''), `falta a arte ${card.img}`).toBe(true);
    }
  });

  test('toda carta tem a ilustração recortada usada pela carta composta', () => {
    const files = filesIn('assets/arte');
    for (const card of classicCards) {
      const artwork = (card.img ?? '').replace(/\.png$/, '.webp');
      expect(files.has(artwork), `falta a ilustração ${artwork}`).toBe(true);
    }
  });
});

describe('as 33 importadas do Figma', () => {
  const fresh = ALL_CARDS.filter(isImported);

  test('são as 33 cartas dos baralhos iniciais do Figma', () => {
    expect(fresh.length).toBe(33);
  });

  test('a distribuição por tipo bate com as seções do quadro do Figma', () => {
    const account = (type: string) => fresh.filter((card) => card.type === type).length;
    expect({
      creature: account('creature'),
      item: account('item'),
      ability: account('ability'),
      command: account('command'),
    }).toEqual({ creature: 13, item: 5, ability: 10, command: 5 });
  });

  test('todas têm texto de regras e código de coleção', () => {
    for (const card of fresh) {
      expect(card.text, `${card.name} sem texto`).toBeTruthy();
      expect(card.ref, `${card.name} sem ref`).toMatch(/^GES-\d{4}$/);
    }
  });

  /** nunca foram impressas: existe a ilustração, não a carta pronta — só o modo composto */
  test('não têm carta impressa, e por isso só renderizam compostas', () => {
    for (const card of fresh) {
      expect(card.img, `${card.name} ganhou carta impressa — atualize o teste`).toBeUndefined();
    }
  });

  test('a ilustração de cada carta vem do Figma e corresponde ao id', () => {
    const files = filesIn('assets/arte');
    for (const card of fresh) {
      expect(card.art, `${card.name} sem ilustração`).toBe(`${card.id}.webp`);
      expect(files.has(card.art ?? ''), `falta a ilustração ${card.art}`).toBe(true);
    }
  });

  test('elemento segue o baralho: vento, fogo, terra, e neutro em item e comando', () => {
    for (const card of fresh) {
      if (card.type === 'item' || card.type === 'command') {
        expect(card.element, `${card.name} deveria ser neutro`).toBe('neutral');
      } else {
        expect(['wind', 'fire', 'earth']).toContain(card.element);
      }
    }
  });

});

/**
 * Vale para toda carta que não é uma das 45 impressas — as importadas do Figma e as
 * que o estúdio criar depois. É aqui que uma carta escrita na tela é cobrada.
 */
describe('toda carta não impressa', () => {
  const modern = ALL_CARDS.filter((card) => !isPrinted(card));

  test('tem texto de regras', () => {
    for (const card of modern) expect(card.text, `${card.name} sem texto`).toBeTruthy();
  });

  test('não finge ter carta impressa que não existe', () => {
    const files = filesIn('assets/cards');
    for (const card of modern) {
      if (card.img === undefined) continue;
      expect(files.has(card.img), `${card.name} aponta ${card.img}, que não existe`).toBe(true);
    }
  });

  test('a ilustração declarada existe em public/assets/arte', () => {
    const files = filesIn('assets/arte');
    for (const card of modern) {
      if (card.art === undefined) continue;
      expect(files.has(card.art), `falta a ilustração ${card.art} (${card.name})`).toBe(true);
    }
  });

  /**
   * A palavra-chave é regra fechada e vale em jogo mesmo com a carta pendente,
   * então texto impresso e campo declarado têm de dizer a mesma coisa — e uma
   * palavra nova em caixa alta não pode entrar sem definição no motor.
   */
  test('palavra-chave impressa e campo declarado dizem a mesma coisa', () => {
    const KEYWORDS = Object.keys({
      aggressive: true,
      trample: true,
      martial: true,
      vorpal: true,
      regenerate: true,
    } satisfies Record<Keyword, true>) as Keyword[];

    for (const card of modern) {
      const firstLine = (card.text ?? '').split('\n')[0]!.trim();
      // a palavra impressa está em pt-BR (idioma-fonte das cartas)
      const printed = KEYWORDS.find((key) => ptBR.ui.keyword[key] === firstLine);
      const declared = card.type === 'creature' ? (card.keywords ?? []) : [];

      expect(declared, `${card.name}: texto impresso e palavrasChave discordam`).toEqual(
        printed ? [printed] : [],
      );
      expect(
        /^[A-ZÀ-Ú]{4,}$/.test(firstLine) && !printed,
        `${card.name} abre com "${firstLine}", que o motor não conhece como palavra-chave`,
      ).toBe(false);
    }
  });

  /**
   * Enquanto `behaviorPending`, a carta é baunilha: existe no catálogo e não resolve
   * nada — fora a palavra-chave, que é implementada à parte (as 6 com MARCIAL,
   * VORPAL ou REGENERAR seguem devendo só o parágrafo em prosa).
   */
  test('carta marcada como pendente não declara comportamento nenhum', () => {
    for (const card of modern.filter((c) => c.behaviorPending)) {
      const blocks = [
        'effects' in card ? card.effects : undefined,
        'triggeredAbilities' in card ? card.triggeredAbilities : undefined,
        'activatedAbilities' in card ? card.activatedAbilities : undefined,
        'onEnter' in card ? card.onEnter : undefined,
      ];
      for (const block of blocks) {
        expect(block, `${card.name} tem bloco declarativo e ainda está marcada pendente`)
          .toBeUndefined();
      }
    }
  });

  /** o estúdio valida antes de gravar; isto pega quem editou o arquivo à mão */
  test('todo bloco declarativo casa com o vocabulário do motor', () => {
    for (const card of ALL_CARDS) {
      expect(validateCard(card), `${card.id} — ${card.name}`).toEqual([]);
    }
  });
});

describe('peças do molde da carta composta', () => {
  const required = [
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
    for (const piece of required) {
      expect(existsSync(join(publicFolder, 'assets/molde', `${piece}.webp`)), `falta ${piece}.webp`).toBe(
        true,
      );
    }
  });

  test('as fontes estão self-hospedadas', () => {
    expect(existsSync(join(publicFolder, 'assets/fontes/fontes.css'))).toBe(true);
  });
});

describe('heróis', () => {
  test('são 5, com retratos em public/assets/heroes', () => {
    expect(heroes.length).toBe(5);
    const files = filesIn('assets/heroes');
    for (const hero of heroes) {
      expect(files.has(hero.img), `falta o retrato ${hero.img}`).toBe(true);
    }
  });
});

describe('validarDeck', () => {
  const validDeck = {
    name: 'Matilha de Badur',
    hero: 'badur',
    cards: { 28: 3, 29: 3, 30: 3, 31: 2, 36: 3, 37: 3, 38: 3, 43: 3, 44: 3 },
  };

  test('aceita um deck dentro das regras', () => {
    expect(validateDeck(validDeck)).toEqual([]);
  });

  test('rejeita mais de 3 cópias', () => {
    const problems = validateDeck({ ...validDeck, cards: { ...validDeck.cards, 28: 4 } });
    expect(problems.some((p) => p.key === 'deckRule.too_many_copies')).toBe(true);
  });

  test('rejeita mais de 40 cartas', () => {
    const cards: Record<number, number> = {};
    for (let id = 1; id <= 20; id++) cards[id] = 3;
    const problems = validateDeck({ ...validDeck, cards });
    expect(problems.some((p) => p.key === 'deckRule.too_many_cards')).toBe(true);
  });

  test('rejeita herói e carta inexistentes', () => {
    const problems = validateDeck({ name: 'x', hero: 'zeus', cards: { 999: 1 } });
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });

  /* formato único (decisão nº 37): edições diferentes no mesmo deck são legais */
  test('aceita cartas das duas edições no mesmo deck', () => {
    const imported = ALL_CARDS.find(isImported)!;
    const problems = validateDeck({
      ...validDeck,
      cards: { ...validDeck.cards, [imported.id]: 1 },
    });
    expect(problems).toEqual([]);
  });
});
