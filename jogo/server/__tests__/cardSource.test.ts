import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_CARDS, cardById } from '../../src/data/cards.ts';
import { canonicalCard } from '../../src/data/canonical.ts';
import {
  CATALOG_FILES,
  printCard,
  printTranslation,
  readCatalogArray,
  readTranslationMap,
  removeBlock,
  upsertBlock,
} from '../cardSource.ts';
import type { Card } from '../../src/data/types.ts';

const dataFolder = join(import.meta.dirname, '../../src/data');
const localesFolder = join(import.meta.dirname, '../../src/i18n/locales');

const sourceOf = (file: string) => readFileSync(join(dataFolder, file), 'utf8');

/** o literal impresso é JS válido: dá para ler de volta sem carregar módulo */
const parseLiteral = (literal: string): unknown =>
  new Function(`return (${literal});`)() as unknown;

describe('impressão de carta', () => {
  test('toda carta do catálogo volta igual depois de impressa', () => {
    for (const card of ALL_CARDS) {
      const canonical = canonicalCard(card);
      expect(parseLiteral(printCard(canonical)), `${card.id} — ${card.name}`).toEqual(canonical);
    }
  });

  test('canonizar duas vezes não muda nada', () => {
    for (const card of ALL_CARDS) {
      const once = canonicalCard(card);
      expect(canonicalCard(once), String(card.id)).toEqual(once);
    }
  });

  test('imprimir duas vezes dá o mesmo texto', () => {
    const card = canonicalCard(cardById(1));
    expect(printCard(card)).toBe(printCard(card));
  });

  test('a ordem dos campos é a do catálogo, não a de quem mandou', () => {
    const embaralhada = {
      edition: 'Abismos & Profundezas',
      health: 4,
      id: 1,
      name: 'Azzure, Sacerdotisa de Atlantis',
      type: 'creature',
      element: 'water',
      attack: 2,
      race: 'Aquarium',
      rarity: 'rare',
      text: null,
      img: '01.png',
    } as unknown as Card;

    const keys = Object.keys(canonicalCard(embaralhada));
    expect(keys).toEqual([
      'id',
      'type',
      'name',
      'race',
      'attack',
      'health',
      'text',
      'element',
      'rarity',
      'img',
      'edition',
    ]);
  });

  test('escapa aspas e quebras de linha do texto impresso', () => {
    const card = canonicalCard({
      ...cardById(46),
      text: "MARCIAL\n\nnão 'pode' ser \\ isso",
    } as Card);
    const back = parseLiteral(printCard(card)) as Card;
    expect(back.text).toBe("MARCIAL\n\nnão 'pode' ser \\ isso");
  });

  test('abre a lista que tem objeto e mantém inteira a que só tem texto', () => {
    const printed = printCard(canonicalCard(cardById(46)));
    expect(printed).toContain("keywords: ['martial']");
    expect(printed).toContain('\n    id: 46,');
  });
});

describe('localizar cartas no arquivo', () => {
  test('acha todas as criaturas do arquivo de criaturas', () => {
    const source = sourceOf('creatures.ts');
    const found = readCatalogArray(source, 'creatures');
    const creatures = ALL_CARDS.filter((card) => card.type === 'creature');
    expect(found.blocks.size).toBe(creatures.length);
    for (const card of creatures) expect(found.blocks.has(card.id), String(card.id)).toBe(true);
  });

  test('o bloco encontrado é exatamente aquela carta', () => {
    const source = sourceOf('creatures.ts');
    const block = readCatalogArray(source, 'creatures').blocks.get(1)!;
    const parsed = parseLiteral(source.slice(block.start, block.end)) as Card;
    expect(parsed.name).toBe(cardById(1).name);
  });

  test('comentário com chave dentro não confunde a contagem', () => {
    const source = `export const x: number[] = [\n  // { não conta }\n  { id: 1 },\n  { id: 2 },\n];\n`;
    expect(readCatalogArray(source, 'x').blocks.size).toBe(2);
  });

  test('chave dentro de texto não confunde a contagem', () => {
    const source = `export const x: number[] = [\n  { id: 1, text: 'a { b } c' },\n];\n`;
    const found = readCatalogArray(source, 'x');
    expect(found.blocks.size).toBe(1);
    expect(parseLiteral(source.slice(found.blocks.get(1)!.start, found.blocks.get(1)!.end))).toEqual(
      { id: 1, text: 'a { b } c' },
    );
  });

  test('acha todas as traduções', () => {
    const source = readFileSync(join(localesFolder, 'cards.en-US.ts'), 'utf8');
    const found = readTranslationMap(source);
    expect(found.blocks.size).toBe(ALL_CARDS.length);
  });
});

describe('editar o arquivo', () => {
  const creatures = () => sourceOf('creatures.ts');

  test('regravar a carta sem mudança deixa o arquivo idêntico', () => {
    const source = creatures();
    const found = readCatalogArray(source, 'creatures');
    const block = found.blocks.get(1)!;
    const literal = source.slice(block.start, block.end);
    expect(upsertBlock(source, found, 1, literal)).toBe(source);
  });

  test('trocar uma carta não mexe no resto do arquivo', () => {
    const source = creatures();
    const found = readCatalogArray(source, 'creatures');
    const changed = upsertBlock(
      source,
      found,
      2,
      printCard(canonicalCard({ ...cardById(2), attack: 9 } as Card)),
    );

    const before = readCatalogArray(changed, 'creatures');
    expect(before.blocks.size).toBe(found.blocks.size);
    const block = before.blocks.get(2)!;
    expect((parseLiteral(changed.slice(block.start, block.end)) as Card & { attack: number }).attack)
      .toBe(9);

    // a carta anterior e a seguinte seguem intactas
    for (const id of [1, 3]) {
      const same = before.blocks.get(id)!;
      const old = found.blocks.get(id)!;
      expect(changed.slice(same.start, same.end)).toBe(source.slice(old.start, old.end));
    }
  });

  test('carta nova entra ordenada e sai sem deixar rastro', () => {
    const source = creatures();
    const novel = canonicalCard({
      id: 20,
      type: 'creature',
      name: 'Teste',
      race: 'Beast',
      attack: 1,
      health: 1,
      text: null,
      element: 'fire',
      rarity: 'common',
      edition: 'Quatro Elementos',
    } as Card);

    const added = upsertBlock(source, readCatalogArray(source, 'creatures'), 20, printCard(novel));
    const found = readCatalogArray(added, 'creatures');
    expect(found.blocks.has(20)).toBe(true);

    const ids = [...found.blocks.keys()];
    expect(ids).toEqual([...ids].sort((a, b) => a - b));

    expect(removeBlock(added, found, 20)).toBe(source);
  });

  test('carta nova com id maior que todas entra no fim', () => {
    const source = creatures();
    const novel = canonicalCard({
      id: 900,
      type: 'creature',
      name: 'Última',
      race: 'Beast',
      attack: 1,
      health: 1,
      text: null,
      element: 'fire',
      rarity: 'common',
      edition: 'Quatro Elementos',
    } as Card);

    const added = upsertBlock(source, readCatalogArray(source, 'creatures'), 900, printCard(novel));
    const found = readCatalogArray(added, 'creatures');
    expect(found.blocks.has(900)).toBe(true);
    expect([...found.blocks.keys()].at(-1)).toBe(900);
    expect(removeBlock(added, found, 900)).toBe(source);
  });

  test('tradução entra e sai do dicionário', () => {
    const source = readFileSync(join(localesFolder, 'cards.en-US.ts'), 'utf8');
    const literal = printTranslation(200, 'Name', 'Rules text');
    const added = upsertBlock(source, readTranslationMap(source), 200, literal);

    const found = readTranslationMap(added);
    expect(found.blocks.size).toBe(ALL_CARDS.length + 1);
    expect(removeBlock(added, found, 200)).toBe(source);
  });

  test('todo tipo de carta sabe em que arquivo mora', () => {
    for (const [type, where] of Object.entries(CATALOG_FILES)) {
      const source = sourceOf(where.file);
      const found = readCatalogArray(source, where.exportName);
      const expected = ALL_CARDS.filter((card) => card.type === type).length;
      expect(found.blocks.size, type).toBe(expected);
    }
  });
});
