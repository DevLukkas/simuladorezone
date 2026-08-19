/**
 * Estúdio de cartas: as rotas que gravam o catálogo (decisão nº 22).
 *
 * Não existem por padrão. O servidor só as monta quando sobe com `--admin`, e
 * mesmo aí exigem conta E a chave impressa no console — o `vite.config.ts` deste
 * projeto já serve o dev por túnel público, então uma rota que escreve arquivo do
 * repositório não pode depender de "ninguém sabe o endereço".
 *
 * O que estas rotas fazem é reescrever o literal de UMA carta em `src/data/*.ts` e
 * as entradas dela nos dicionários de idioma. O catálogo em memória do servidor
 * segue o de quando ele subiu — quem enxerga a mudança na hora é o cliente, pelo
 * HMR do Vite. Para as PARTIDAS usarem a carta nova é preciso reiniciar o servidor.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { validateCard, type CardProblem } from '../src/data/validate.ts';
import { canonicalCard } from '../src/data/canonical.ts';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../src/i18n/index.ts';
import { text } from '../src/shared/text.ts';
import { withAccount } from './accounts.ts';
import { ok, rejected } from './http.ts';
import {
  CATALOG_FILES,
  nameInBlock,
  printCard,
  printTranslation,
  readCatalogArray,
  readTranslationMap,
  removeBlock,
  upsertBlock,
} from './cardSource.ts';
import type { Card, CardType } from '../src/data/types.ts';
import type { Db } from './db.ts';
import type { TextKey } from '../src/i18n/keys.ts';
import type { ApiReply, ApiRequest, Route } from './http.ts';

export interface AdminOptions {
  /** a pasta `jogo/`: dentro dela ficam src/ e public/ */
  root: string;
  /** chave exigida no cabeçalho `x-ezone-studio` */
  key: string;
}

const TRANSLATED: readonly Locale[] = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/** imagem de carta é maior que o teto normal de corpo */
const MAX_ART_BYTES = 8 * 1024 * 1024;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const problemText = (problem: CardProblem) =>
  text(`admin.problem.${problem.problem}` as TextKey, { path: problem.path || '·' });

const refuse = (problems: CardProblem[]): ApiReply =>
  rejected(422, 'card_malformed', undefined, problems.map(problemText));

// ---------------------------------------------------------------------------
// Onde as coisas estão no disco
// ---------------------------------------------------------------------------

const places = (root: string) => ({
  data: path.join(root, 'src', 'data'),
  locales: path.join(root, 'src', 'i18n', 'locales'),
  art: path.join(root, 'public', 'assets', 'arte'),
});

interface Located {
  type: CardType;
  file: string;
  source: string;
}

/**
 * Em que arquivo a carta de `id` está HOJE — lido do disco, não do catálogo que o
 * servidor importou. É o que permite editar duas cartas seguidas sem reiniciar.
 */
async function locate(root: string, id: number): Promise<Located | null> {
  for (const [type, where] of Object.entries(CATALOG_FILES)) {
    const file = path.join(places(root).data, where.file);
    const source = await fs.readFile(file, 'utf8');
    if (readCatalogArray(source, where.exportName).blocks.has(id)) {
      return { type: type as CardType, file, source };
    }
  }
  return null;
}

/** id → nome de TODAS as cartas, lido dos arquivos: uniqueness sem catálogo velho. */
async function currentNames(root: string): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (const where of Object.values(CATALOG_FILES)) {
    const source = await fs.readFile(path.join(places(root).data, where.file), 'utf8');
    const found = readCatalogArray(source, where.exportName);
    for (const [id, block] of found.blocks) {
      const name = nameInBlock(source.slice(block.start, block.end));
      if (name !== null) names.set(id, name);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

type Translations = Record<string, { name: string; text: string }>;

function readTranslations(body: Record<string, unknown>): Translations | Locale {
  const given = isObject(body.translations) ? body.translations : {};
  const out: Translations = {};

  for (const locale of TRANSLATED) {
    const entry = given[locale];
    if (!isObject(entry)) return locale;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const rules = typeof entry.text === 'string' ? entry.text.trim() : '';
    if (!name || !rules) return locale;
    out[locale] = { name, text: rules };
  }

  return out;
}

async function writeCard(root: string, card: Card, previous: Located | null): Promise<string> {
  const where = CATALOG_FILES[card.type];
  const folder = places(root).data;
  const target = path.join(folder, where.file);

  // trocou de tipo: sai do arquivo antigo antes de entrar no novo
  if (previous && previous.type !== card.type) {
    const old = CATALOG_FILES[previous.type];
    const cleaned = removeBlock(
      previous.source,
      readCatalogArray(previous.source, old.exportName),
      card.id,
    );
    await fs.writeFile(previous.file, cleaned, 'utf8');
  }

  const source =
    previous && previous.type === card.type
      ? previous.source
      : await fs.readFile(target, 'utf8');

  const found = readCatalogArray(source, where.exportName);
  await fs.writeFile(target, upsertBlock(source, found, card.id, printCard(card)), 'utf8');
  return where.file;
}

async function writeTranslations(
  root: string,
  id: number,
  translations: Translations,
): Promise<void> {
  for (const locale of TRANSLATED) {
    const entry = translations[locale];
    if (!entry) continue;
    const file = path.join(places(root).locales, `cards.${locale}.ts`);
    const source = await fs.readFile(file, 'utf8');
    const literal = printTranslation(id, entry.name, entry.text);
    await fs.writeFile(file, upsertBlock(source, readTranslationMap(source), id, literal), 'utf8');
  }
}

async function dropTranslations(root: string, id: number): Promise<void> {
  for (const locale of TRANSLATED) {
    const file = path.join(places(root).locales, `cards.${locale}.ts`);
    const source = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, removeBlock(source, readTranslationMap(source), id), 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Ilustração
// ---------------------------------------------------------------------------

const ART_EXTENSIONS = ['.png', '.webp', '.jpg'];

/** nome de arquivo cru: sem pasta, sem `..`, com extensão de imagem conhecida */
function safeArtName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name !== path.basename(name)) return null;
  if (!ART_EXTENSIONS.includes(path.extname(name).toLowerCase())) return null;
  return name;
}

// ---------------------------------------------------------------------------
// As rotas
// ---------------------------------------------------------------------------

export const adminRoutes = (db: Db, options: AdminOptions | null): Route[] => {
  const status: Route = {
    method: 'GET',
    pattern: '/api/admin/status',
    handle: () => ok({ enabled: options !== null }),
  };

  if (!options) return [status];
  const { root, key } = options;

  /** conta válida E a chave do console; sem os dois, a rota nem parece existir */
  const guarded = (
    handle: (request: ApiRequest) => Promise<ApiReply> | ApiReply,
  ): ((request: ApiRequest) => Promise<ApiReply> | ApiReply) =>
    withAccount(db, (request) => {
      const given = request.headers['x-ezone-studio'];
      if (typeof given !== 'string' || given !== key) return rejected(403, 'admin_key_required');
      return handle(request);
    });

  return [
    status,
    {
      method: 'PUT',
      pattern: '/api/admin/cards/:id',
      handle: guarded(async (request) => {
        const id = Number(request.params.id);
        if (!Number.isInteger(id) || id < 1) return rejected(400, 'card_malformed');
        if (!isObject(request.body)) return rejected(400, 'card_malformed');

        const candidate = request.body.card;
        if (!isObject(candidate) || candidate.id !== id) return rejected(400, 'card_malformed');

        const problems = validateCard(candidate);
        // o dicionário exige texto de todo mundo: carta sem texto quebra o teste de i18n
        if (typeof candidate.text !== 'string' || !candidate.text.trim()) {
          problems.push({ path: 'text', problem: 'empty_text' });
        }
        if (problems.length) return refuse(problems);

        const translations = readTranslations(request.body);
        if (typeof translations === 'string') {
          return rejected(422, 'translation_required', { locale: translations });
        }

        const names = await currentNames(root);
        for (const [otherId, name] of names) {
          if (otherId !== id && name === candidate.name) return rejected(409, 'card_name_taken');
        }

        const card = canonicalCard(candidate as unknown as Card);
        const previous = await locate(root, id);
        const file = await writeCard(root, card, previous);
        await writeTranslations(root, id, translations);

        return ok({ id, file, created: previous === null });
      }),
    },
    {
      method: 'DELETE',
      pattern: '/api/admin/cards/:id',
      handle: guarded(async (request) => {
        const id = Number(request.params.id);
        const previous = await locate(root, id);
        if (!previous) return rejected(404, 'card_not_found');

        const where = CATALOG_FILES[previous.type];
        const found = readCatalogArray(previous.source, where.exportName);
        await fs.writeFile(previous.file, removeBlock(previous.source, found, id), 'utf8');
        await dropTranslations(root, id);

        return ok({ id, removed: true });
      }),
    },
    {
      method: 'POST',
      pattern: '/api/admin/art',
      maxBody: MAX_ART_BYTES,
      handle: guarded(async (request) => {
        if (!isObject(request.body)) return rejected(400, 'art_malformed');

        const name = safeArtName(request.body.file);
        const data = request.body.data;
        if (!name || typeof data !== 'string') return rejected(400, 'art_malformed');

        const bytes = Buffer.from(data, 'base64');
        if (!bytes.length) return rejected(400, 'art_malformed');

        const folder = places(root).art;
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(path.join(folder, name), bytes);

        return ok({ file: name, bytes: bytes.length });
      }),
    },
  ];
};
