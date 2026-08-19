import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildServer } from '../app.ts';
import { CATALOG_FILES, readCatalogArray, readTranslationMap } from '../cardSource.ts';
import type { Card } from '../../src/data/types.ts';
import type { Db } from '../db.ts';
import type http from 'node:http';

/**
 * O estúdio grava em arquivo, então o teste monta uma cópia da árvore de fontes num
 * temporário e aponta o servidor para lá — nenhum caso aqui toca o repositório.
 */

const KEY = 'chave-de-teste';
const projectRoot = path.join(import.meta.dirname, '../..');

let root: string;
let base: string;
let server: http.Server;
let db: Db;
let token: string;
let original: Record<string, string>;

const dataFile = (file: string) => path.join(root, 'src', 'data', file);
const localeFile = (locale: string) => path.join(root, 'src', 'i18n', 'locales', `cards.${locale}.ts`);
const read = (file: string) => fs.readFileSync(file, 'utf8');

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  route: string,
  body?: unknown,
  options: { key?: string | null; token?: string | null } = {},
): Promise<Reply> {
  const useToken = options.token === undefined ? token : options.token;
  const useKey = options.key === undefined ? KEY : options.key;

  const reply = await fetch(base + route, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(useToken ? { authorization: `Bearer ${useToken}` } : {}),
      ...(useKey ? { 'x-ezone-studio': useKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: reply.status, body: (await reply.json()) as Record<string, unknown> };
}

const newCard = (over: Partial<Card> = {}): Record<string, unknown> => ({
  id: 500,
  type: 'creature',
  name: 'Sentinela de Teste',
  race: 'Beast',
  attack: 2,
  health: 3,
  text: 'Quando entra em campo: compre uma carta.',
  element: 'earth',
  rarity: 'common',
  edition: 'Quatro Elementos',
  ref: 'GES-9999',
  author: 'Equipe Ezone',
  onEnter: [{ type: 'draw', count: 1 }],
  ...over,
});

const translations = {
  'en-US': { name: 'Test Sentinel', text: 'When it enters the field: draw a card.' },
  'es-ES': { name: 'Centinela de Prueba', text: 'Cuando entra en el campo: roba una carta.' },
};

const parseLiteral = (literal: string): unknown => new Function(`return (${literal});`)() as unknown;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ezone-studio-'));
  fs.mkdirSync(path.join(root, 'src', 'data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'i18n', 'locales'), { recursive: true });

  original = {};
  for (const where of Object.values(CATALOG_FILES)) {
    const from = path.join(projectRoot, 'src', 'data', where.file);
    fs.copyFileSync(from, dataFile(where.file));
    original[where.file] = read(dataFile(where.file));
  }
  for (const locale of ['en-US', 'es-ES']) {
    const from = path.join(projectRoot, 'src', 'i18n', 'locales', `cards.${locale}.ts`);
    fs.copyFileSync(from, localeFile(locale));
    original[`cards.${locale}.ts`] = read(localeFile(locale));
  }

  const built = buildServer(path.join(root, 'teste.db'), null, { root, key: KEY });
  server = built.server;
  db = built.db;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('sem porta');
  base = `http://127.0.0.1:${address.port}`;

  const guest = await call('POST', '/api/guest', { nickname: 'Autor' }, { token: null, key: null });
  token = guest.body.token as string;
});

afterAll(() => {
  server.close();
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('portaria do estúdio', () => {
  test('anuncia que está habilitado', async () => {
    const reply = await call('GET', '/api/admin/status', undefined, { token: null, key: null });
    expect(reply.body.enabled).toBe(true);
  });

  test('sem conta não grava', async () => {
    const reply = await call('PUT', '/api/admin/cards/500', { card: newCard() }, { token: null });
    expect(reply.status).toBe(401);
  });

  test('com conta mas sem a chave não grava', async () => {
    const reply = await call('PUT', '/api/admin/cards/500', { card: newCard() }, { key: null });
    expect(reply.status).toBe(403);
  });

  test('com a chave errada não grava', async () => {
    const reply = await call('PUT', '/api/admin/cards/500', { card: newCard() }, { key: 'outra' });
    expect(reply.status).toBe(403);
  });
});

describe('recusas', () => {
  test('carta fora do vocabulário volta com o caminho do problema', async () => {
    const card = newCard({ rarity: 'mítica' } as unknown as Partial<Card>);
    const reply = await call('PUT', '/api/admin/cards/500', { card, translations });

    expect(reply.status).toBe(422);
    const details = reply.body.details as { key: string; params: { path: string } }[];
    expect(details.some((item) => item.params.path === 'rarity')).toBe(true);
  });

  test('efeito com campo faltando é acusado antes de gravar', async () => {
    const card = newCard({ onEnter: [{ type: 'draw' }] } as unknown as Partial<Card>);
    const reply = await call('PUT', '/api/admin/cards/500', { card, translations });

    expect(reply.status).toBe(422);
    const details = reply.body.details as { params: { path: string } }[];
    expect(details.some((item) => item.params.path === 'onEnter[0].count')).toBe(true);
    expect(read(dataFile('creatures.ts'))).toBe(original['creatures.ts']);
  });

  test('sem tradução não grava', async () => {
    const reply = await call('PUT', '/api/admin/cards/500', {
      card: newCard(),
      translations: { 'en-US': { name: 'Only English', text: 'x' } },
    });
    expect(reply.status).toBe(422);
  });

  test('nome repetido não grava', async () => {
    const card = newCard({ name: 'Azzure, Sacerdotisa de Atlantis' });
    const reply = await call('PUT', '/api/admin/cards/500', { card, translations });
    expect(reply.status).toBe(409);
  });

  test('id do caminho tem de bater com o da carta', async () => {
    const reply = await call('PUT', '/api/admin/cards/501', { card: newCard(), translations });
    expect(reply.status).toBe(400);
  });
});

describe('gravar, mudar de tipo e apagar', () => {
  test('carta nova entra no arquivo e nos dois dicionários', async () => {
    const reply = await call('PUT', '/api/admin/cards/500', { card: newCard(), translations });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ id: 500, file: 'creatures.ts', created: true });

    const source = read(dataFile('creatures.ts'));
    const block = readCatalogArray(source, 'creatures').blocks.get(500)!;
    const written = parseLiteral(source.slice(block.start, block.end)) as Card;
    expect(written).toMatchObject({
      id: 500,
      name: 'Sentinela de Teste',
      author: 'Equipe Ezone',
      ref: 'GES-9999',
      onEnter: [{ type: 'draw', count: 1 }],
    });

    for (const locale of ['en-US', 'es-ES'] as const) {
      const text = read(localeFile(locale));
      expect(readTranslationMap(text).blocks.has(500), locale).toBe(true);
      expect(text).toContain(translations[locale].name);
    }
  });

  test('regravar com efeito novo troca só aquela carta', async () => {
    const card = newCard({
      text: 'Recebe +1/+1 enquanto estiver em campo.',
      onEnter: [{ type: 'add_marker', target: 'self', stats: ['attack', 'defense'], value: 1 }],
    } as unknown as Partial<Card>);

    const reply = await call('PUT', '/api/admin/cards/500', { card, translations });
    expect(reply.status).toBe(200);
    expect(reply.body.created).toBe(false);

    const source = read(dataFile('creatures.ts'));
    const block = readCatalogArray(source, 'creatures').blocks.get(500)!;
    expect((parseLiteral(source.slice(block.start, block.end)) as Card & { onEnter: unknown[] })
      .onEnter[0]).toEqual({
      type: 'add_marker',
      target: 'self',
      stats: ['attack', 'defense'],
      value: 1,
    });

    // a carta 1 seguiu byte a byte igual
    const first = readCatalogArray(source, 'creatures').blocks.get(1)!;
    const before = readCatalogArray(original['creatures.ts']!, 'creatures').blocks.get(1)!;
    expect(source.slice(first.start, first.end)).toBe(
      original['creatures.ts']!.slice(before.start, before.end),
    );
  });

  test('trocar o tipo move a carta de arquivo', async () => {
    const card = {
      id: 500,
      type: 'item',
      name: 'Sentinela de Teste',
      text: 'A criatura anexada recebe +1 de ATQ.',
      element: 'neutral',
      rarity: 'common',
      edition: 'Quatro Elementos',
      effects: [{ type: 'modify_stat', target: 'host', stat: 'attack', value: 1 }],
    };

    const reply = await call('PUT', '/api/admin/cards/500', { card, translations });
    expect(reply.status).toBe(200);
    expect(reply.body.file).toBe('items.ts');

    expect(readCatalogArray(read(dataFile('creatures.ts')), 'creatures').blocks.has(500)).toBe(
      false,
    );
    expect(readCatalogArray(read(dataFile('items.ts')), 'items').blocks.has(500)).toBe(true);
  });

  test('apagar devolve os arquivos ao estado original', async () => {
    const reply = await call('DELETE', '/api/admin/cards/500');
    expect(reply.status).toBe(200);

    for (const [file, before] of Object.entries(original)) {
      const written = file.startsWith('cards.')
        ? read(localeFile(file.slice('cards.'.length, -'.ts'.length)))
        : read(dataFile(file));
      expect(written, file).toBe(before);
    }
  });

  test('apagar carta que não existe é 404', async () => {
    expect((await call('DELETE', '/api/admin/cards/500')).status).toBe(404);
  });
});

describe('ilustração', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  test('grava em public/assets/arte', async () => {
    const reply = await call('POST', '/api/admin/art', {
      file: '500.png',
      data: png.toString('base64'),
    });

    expect(reply.status).toBe(200);
    expect(fs.readFileSync(path.join(root, 'public', 'assets', 'arte', '500.png'))).toEqual(png);
  });

  test('recusa caminho que sai da pasta', async () => {
    const reply = await call('POST', '/api/admin/art', {
      file: '../../../evil.png',
      data: png.toString('base64'),
    });

    expect(reply.status).toBe(400);
    expect(fs.existsSync(path.join(root, 'evil.png'))).toBe(false);
  });

  test('recusa extensão que não é imagem', async () => {
    const reply = await call('POST', '/api/admin/art', {
      file: 'malicia.ts',
      data: png.toString('base64'),
    });
    expect(reply.status).toBe(400);
  });
});

describe('servidor sem --admin', () => {
  test('não monta rota de escrita', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ezone-sem-studio-'));
    const built = buildServer(path.join(folder, 'teste.db'), null);
    await new Promise<void>((resolve) => built.server.listen(0, '127.0.0.1', resolve));

    const address = built.server.address();
    if (typeof address !== 'object' || !address) throw new Error('sem porta');
    const other = `http://127.0.0.1:${address.port}`;

    const status = await fetch(`${other}/api/admin/status`);
    expect(((await status.json()) as { enabled: boolean }).enabled).toBe(false);

    const write = await fetch(`${other}/api/admin/cards/1`, { method: 'PUT', body: '{}' });
    expect(write.status).toBe(404);

    built.server.close();
    built.db.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });
});
