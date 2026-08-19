/**
 * Escrita do catálogo de volta em `src/data/*.ts` e nas traduções de carta.
 *
 * A fonte da verdade continua sendo o CÓDIGO (decisão nº 22): o estúdio de cartas
 * não guarda carta em banco nenhum — ele reescreve o literal daquela carta no
 * arquivo, e o resto do arquivo fica byte a byte como estava. É isso que preserva o
 * typecheck dos efeitos, os testes que afirmam sobre cartas e o histórico no git.
 *
 * Duas peças: um impressor de TS (objeto → literal no estilo da casa) e um
 * localizador de blocos (acha onde começa e termina a carta de id N no arquivo).
 * Nada aqui toca disco — quem grava é `admin.ts`.
 */

import type { Card, CardType } from '../src/data/types.ts';

// ---------------------------------------------------------------------------
// Impressor
// ---------------------------------------------------------------------------

const WIDTH = 100;
const SAFE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const quote = (value: string): string =>
  `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}'`;

const printKey = (key: string): string => (SAFE_KEY.test(key) ? key : quote(key));

type Plain = Record<string, unknown>;

const entriesOf = (value: Plain): [string, unknown][] =>
  Object.entries(value).filter(([, item]) => item !== undefined);

/** tudo numa linha só; serve de medida para decidir se cabe */
function oneLine(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(oneLine).join(', ')}]`;

  const entries = entriesOf(value as Plain);
  if (!entries.length) return '{}';
  return `{ ${entries.map(([key, item]) => `${printKey(key)}: ${oneLine(item)}`).join(', ')} }`;
}

/**
 * Lista com objeto dentro sempre abre, mesmo cabendo: é assim que o catálogo
 * escrito à mão está, e uma linha por efeito é o que se consegue ler.
 */
function holdsObject(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => typeof item === 'object' && item !== null);
  if (typeof value === 'object' && value !== null) {
    return Object.values(value as Plain).some(holdsObject);
  }
  return false;
}

/**
 * Imprime `value` sabendo que a primeira linha já está posicionada em `indent`.
 * String nunca é quebrada (não há como), então linha longa de texto impresso é
 * esperada — o que decide abrir é o tamanho do objeto em volta.
 */
export function printValue(value: unknown, indent: number): string {
  if (typeof value !== 'object' || value === null) return oneLine(value);

  const flat = oneLine(value);
  if (indent + flat.length <= WIDTH && !holdsObject(value)) return flat;

  const inner = ' '.repeat(indent + 2);
  const outer = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const items = value.map((item) => `${inner}${printValue(item, indent + 2)},\n`).join('');
    return `[\n${items}${outer}]`;
  }

  const entries = entriesOf(value as Plain);
  if (!entries.length) return '{}';
  const lines = entries
    .map(([key, item]) => `${inner}${printKey(key)}: ${printValue(item, indent + 2)},\n`)
    .join('');
  return `{\n${lines}${outer}}`;
}

/** O literal da carta, sempre aberto, pronto para entrar num array indentado em `indent`. */
export function printCard(card: Card, indent = 2): string {
  const inner = ' '.repeat(indent + 2);
  const outer = ' '.repeat(indent);
  const lines = entriesOf(card as unknown as Plain)
    .map(([key, item]) => `${inner}${printKey(key)}: ${printValue(item, indent + 2)},\n`)
    .join('');
  return `{\n${lines}${outer}}`;
}

/** A entrada `NN: { name, text }` de um arquivo de tradução de cartas. */
export function printTranslation(id: number, name: string, text: string, indent = 2): string {
  const inner = ' '.repeat(indent + 2);
  const outer = ' '.repeat(indent);
  return `${id}: {\n${inner}name: ${quote(name)},\n${inner}text: ${quote(text)},\n${outer}}`;
}

// ---------------------------------------------------------------------------
// Localizador de blocos
// ---------------------------------------------------------------------------

export interface SourceBlock {
  /** índice do `{` que abre o literal */
  start: number;
  /** índice logo depois do `}` que o fecha */
  end: number;
}

/**
 * Avança um índice que está em cima de aspas, crase ou comentário até depois dele.
 * Devolve o mesmo índice quando não é nada disso.
 */
function skipInert(source: string, index: number): number {
  const char = source[index];

  if (char === '/' && source[index + 1] === '/') {
    const line = source.indexOf('\n', index);
    return line === -1 ? source.length : line;
  }
  if (char === '/' && source[index + 1] === '*') {
    const close = source.indexOf('*/', index + 2);
    return close === -1 ? source.length : close + 2;
  }
  if (char !== "'" && char !== '"' && char !== '`') return index;

  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === char) return cursor + 1;
    cursor += 1;
  }
  return source.length;
}

/**
 * O `[` ou `{` que abre o VALOR de `export const <name>`. Procurar o colchete a
 * partir do nome acharia o da anotação de tipo (`CreatureCard[]`), por isso o
 * ponto de partida é o `=` da atribuição.
 */
function openerOf(source: string, name: string, opener: '[' | '{'): number {
  const declaration = new RegExp(`export const ${name}\\b`).exec(source);
  if (!declaration) throw new Error(`export const ${name} não encontrado`);

  const assignment = /(?<![=!<>])=(?!=|>)/.exec(source.slice(declaration.index));
  if (!assignment) throw new Error(`${name} não é atribuído`);

  const found = source.indexOf(opener, declaration.index + assignment.index);
  if (found === -1) throw new Error(`${name} não abre com ${opener}`);
  return found;
}

/**
 * Percorre o corpo de um literal e devolve os blocos `{...}` do primeiro nível,
 * mais o índice do fechamento do próprio literal.
 */
function topLevelBlocks(source: string, open: number): { blocks: SourceBlock[]; close: number } {
  const blocks: SourceBlock[] = [];
  let depth = 0;
  let start = -1;
  let cursor = open + 1;

  while (cursor < source.length) {
    const skipped = skipInert(source, cursor);
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }

    const char = source[cursor];
    if (char === '{' || char === '[') {
      if (depth === 0 && char === '{') start = cursor;
      depth += 1;
    } else if (char === '}' || char === ']') {
      if (depth === 0) return { blocks, close: cursor };
      depth -= 1;
      if (depth === 0 && start !== -1) {
        blocks.push({ start, end: cursor + 1 });
        start = -1;
      }
    }
    cursor += 1;
  }

  throw new Error('literal sem fechamento');
}

/**
 * O id da carta é o único `id:` numérico de um bloco — os das habilidades e das
 * fichas são texto entre aspas. Por isso não depende de o campo estar em linha
 * própria: carta escrita numa linha só também é encontrada.
 */
const ID_IN_BLOCK = /\bid:\s*(\d+)/;

/** o `name:` da carta vem antes de qualquer bloco, então o primeiro é sempre o dela */
const NAME_IN_BLOCK = /\bname:\s*'((?:[^'\\]|\\.)*)'/;

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t' };

/** Lê o nome direto do literal, sem avaliar código — só para conferir repetição. */
export function nameInBlock(literal: string): string | null {
  const found = NAME_IN_BLOCK.exec(literal);
  if (!found) return null;
  return found[1]!.replace(/\\(.)/g, (_, char: string) => ESCAPES[char] ?? char);
}

export interface CatalogArray {
  blocks: Map<number, SourceBlock>;
  /** índice do `]` que fecha o array */
  close: number;
}

/** Mapeia id → posição do literal daquela carta dentro de `export const <name>`. */
export function readCatalogArray(source: string, name: string): CatalogArray {
  const { blocks, close } = topLevelBlocks(source, openerOf(source, name, '['));
  const byId = new Map<number, SourceBlock>();

  for (const block of blocks) {
    const found = ID_IN_BLOCK.exec(source.slice(block.start, block.end));
    if (found) byId.set(Number(found[1]), block);
  }

  return { blocks: byId, close };
}

/** Mapeia id → posição da entrada daquele id dentro de `export const cards`. */
export function readTranslationMap(source: string): CatalogArray {
  const open = openerOf(source, 'cards', '{');
  const { blocks, close } = topLevelBlocks(source, open);
  const byId = new Map<number, SourceBlock>();

  for (const block of blocks) {
    // a chave vem antes do `{`: "  46: {"
    const before = source.slice(Math.max(0, block.start - 20), block.start);
    const found = /(\d+)\s*:\s*$/.exec(before);
    if (found) byId.set(Number(found[1]), { start: block.start - found[0].length, end: block.end });
  }

  return { blocks: byId, close };
}

// ---------------------------------------------------------------------------
// Edição
// ---------------------------------------------------------------------------

/** Substitui o bloco de `id`, ou insere no lugar certo quando ainda não existe. */
export function upsertBlock(
  source: string,
  found: CatalogArray,
  id: number,
  literal: string,
  indent = 2,
): string {
  const existing = found.blocks.get(id);
  if (existing) {
    return source.slice(0, existing.start) + literal + source.slice(existing.end);
  }

  // entra antes do primeiro id maior, para a lista seguir ordenada
  const next = [...found.blocks.entries()]
    .filter(([other]) => other > id)
    .sort((a, b) => a[0] - b[0])[0];

  const pad = ' '.repeat(indent);
  if (next) {
    const at = next[1].start;
    return `${source.slice(0, at)}${literal},\n${pad}${source.slice(at)}`;
  }

  // no fim: recua até depois da última vírgula/quebra antes do fechamento
  const tail = source.slice(0, found.close).replace(/\s*$/, '');
  return `${tail}\n${pad}${literal},\n${source.slice(found.close)}`;
}

/** Remove o bloco de `id` junto com a vírgula e a indentação da linha. */
export function removeBlock(source: string, found: CatalogArray, id: number): string {
  const block = found.blocks.get(id);
  if (!block) return source;

  let start = block.start;
  while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;

  let end = block.end;
  if (source[end] === ',') end += 1;
  if (source[end] === '\n') end += 1;

  return source.slice(0, start) + source.slice(end);
}

// ---------------------------------------------------------------------------
// Onde cada tipo de carta mora
// ---------------------------------------------------------------------------

export const CATALOG_FILES: Record<CardType, { file: string; exportName: string }> = {
  creature: { file: 'creatures.ts', exportName: 'creatures' },
  ability: { file: 'abilities.ts', exportName: 'abilities' },
  item: { file: 'items.ts', exportName: 'items' },
  command: { file: 'commands.ts', exportName: 'commands' },
  scenario: { file: 'scenarios.ts', exportName: 'scenarios' },
};
