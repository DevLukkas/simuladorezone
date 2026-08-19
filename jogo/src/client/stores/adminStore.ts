import { create } from 'zustand';
import { api, ApiError } from '../services/api.ts';
import { DEFAULT_LOCALE, LOCALES, cardTextsIn, type Locale } from '../../i18n/index.ts';
import { ALL_CARDS } from '../../data/cards.ts';
import type { Card } from '../../data/types.ts';
import type { TextRef } from '../../shared/text.ts';

/**
 * Estado do estúdio de cartas (decisão nº 22).
 *
 * O catálogo NÃO passa por aqui: quem lê carta é o import de `ALL_CARDS`, que o HMR
 * do Vite recarrega sozinho quando o servidor reescreve o arquivo. Esta store cuida
 * só do que é do estúdio — a chave, o rascunho aberto e o resultado da gravação.
 */

export const TRANSLATED_LOCALES: readonly Locale[] = LOCALES.filter(
  (locale) => locale !== DEFAULT_LOCALE,
);

export type CardTranslations = Record<string, { name: string; text: string }>;

/** rascunho aberto: a carta em edição mais as traduções dela */
export interface Draft {
  card: Card;
  translations: CardTranslations;
  /** id ainda não existe no catálogo */
  fresh: boolean;
}

const KEY_STORAGE = 'ezone:studio-key';

/**
 * Gravar reescreve `src/data/*.ts`, e o HMR do Vite responde a isso RECARREGANDO a
 * página — é assim que a carta nova aparece na lista sem o estúdio manter catálogo
 * próprio. O preço é o React perder o estado, então a carta aberta fica anotada
 * aqui e a tela a reabre ao montar. Some sozinho ao fechar a aba (sessionStorage).
 */
const OPEN_STORAGE = 'ezone:studio-open';

const rememberOpen = (cardId: number | null): void => {
  if (cardId === null) sessionStorage.removeItem(OPEN_STORAGE);
  else sessionStorage.setItem(OPEN_STORAGE, String(cardId));
};

/** o id que estava aberto antes do recarregamento, se aquela carta ainda existe */
export function reopenableId(): number | null {
  const stored = Number(sessionStorage.getItem(OPEN_STORAGE));
  if (!Number.isInteger(stored) || stored < 1) return null;
  return ALL_CARDS.some((card) => card.id === stored) ? stored : null;
}

const studioHeaders = (key: string): Record<string, string> => ({ 'x-ezone-studio': key });

interface AdminState {
  enabled: boolean | null;
  key: string;
  draft: Draft | null;
  busy: boolean;
  /** recusa do servidor, já pronta para traduzir */
  error: TextRef | null;
  problems: TextRef[];
  savedTo: string | null;

  checkEnabled: () => Promise<void>;
  setKey: (key: string) => void;
  edit: (cardId: number) => void;
  create: () => void;
  close: () => void;
  change: (card: Card) => void;
  translate: (locale: string, entry: { name: string; text: string }) => void;
  save: () => Promise<boolean>;
  remove: () => Promise<boolean>;
  uploadArt: (file: File, name: string) => Promise<boolean>;
}

/** o próximo id livre: o catálogo é contíguo por formato, então é o maior + 1 */
export function nextFreeId(): number {
  return ALL_CARDS.reduce((biggest, card) => Math.max(biggest, card.id), 0) + 1;
}

const emptyCard = (id: number): Card =>
  ({
    id,
    type: 'creature',
    name: '',
    race: 'Beast',
    attack: 1,
    health: 1,
    text: '',
    element: 'neutral',
    rarity: 'common',
    edition: 'Quatro Elementos',
  }) as Card;

const translationsOf = (card: Card): CardTranslations => {
  const out: CardTranslations = {};
  for (const locale of TRANSLATED_LOCALES) {
    const stored = cardTextsIn(locale, card.id);
    out[locale] = { name: stored?.name ?? '', text: stored?.text ?? '' };
  }
  return out;
};

const emptyTranslations = (): CardTranslations => {
  const out: CardTranslations = {};
  for (const locale of TRANSLATED_LOCALES) out[locale] = { name: '', text: '' };
  return out;
};

const asRefs = (error: unknown): { error: TextRef | null; problems: TextRef[] } =>
  error instanceof ApiError
    ? { error: error.ref, problems: error.details }
    : { error: null, problems: [] };

export const useAdminStore = create<AdminState>((set, get) => ({
  enabled: null,
  key: localStorage.getItem(KEY_STORAGE) ?? '',
  draft: null,
  busy: false,
  error: null,
  problems: [],
  savedTo: null,

  checkEnabled: async () => {
    const reply = await api<{ enabled: boolean }>('GET', '/api/admin/status').catch(() => null);
    set({ enabled: reply?.enabled ?? false });
  },

  setKey: (key) => {
    localStorage.setItem(KEY_STORAGE, key);
    set({ key, error: null });
  },

  edit: (cardId) => {
    const card = ALL_CARDS.find((candidate) => candidate.id === cardId);
    if (!card) return;
    rememberOpen(cardId);
    set({
      draft: {
        card: structuredClone(card) as Card,
        translations: translationsOf(card),
        fresh: false,
      },
      error: null,
      problems: [],
      savedTo: null,
    });
  },

  create: () => {
    rememberOpen(null);
    set({
      draft: { card: emptyCard(nextFreeId()), translations: emptyTranslations(), fresh: true },
      error: null,
      problems: [],
      savedTo: null,
    });
  },

  close: () => {
    rememberOpen(null);
    set({ draft: null, error: null, problems: [], savedTo: null });
  },

  change: (card) => {
    const draft = get().draft;
    if (draft) set({ draft: { ...draft, card }, savedTo: null });
  },

  translate: (locale, entry) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: { ...draft, translations: { ...draft.translations, [locale]: entry } },
      savedTo: null,
    });
  },

  save: async () => {
    const { draft, key } = get();
    if (!draft) return false;

    set({ busy: true, error: null, problems: [] });
    try {
      const reply = await api<{ file: string }>(
        'PUT',
        `/api/admin/cards/${draft.card.id}`,
        { card: draft.card, translations: draft.translations },
        studioHeaders(key),
      );
      // a página vai recarregar sozinha pelo HMR; a anotação traz a carta de volta
      rememberOpen(draft.card.id);
      set({ busy: false, savedTo: reply.file, draft: { ...draft, fresh: false } });
      return true;
    } catch (error) {
      set({ busy: false, ...asRefs(error) });
      return false;
    }
  },

  remove: async () => {
    const { draft, key } = get();
    if (!draft) return false;

    set({ busy: true, error: null, problems: [] });
    try {
      await api('DELETE', `/api/admin/cards/${draft.card.id}`, undefined, studioHeaders(key));
      rememberOpen(null);
      set({ busy: false, draft: null });
      return true;
    } catch (error) {
      set({ busy: false, ...asRefs(error) });
      return false;
    }
  },

  uploadArt: async (file, name) => {
    const { key } = get();
    set({ busy: true, error: null, problems: [] });
    try {
      const data = await fileToBase64(file);
      await api('POST', '/api/admin/art', { file: name, data }, studioHeaders(key));
      set({ busy: false });
      return true;
    } catch (error) {
      set({ busy: false, ...asRefs(error) });
      return false;
    }
  },
}));

/** o corpo é JSON, então a imagem viaja em base64 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('leitura falhou'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}
