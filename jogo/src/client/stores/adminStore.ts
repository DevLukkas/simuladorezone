import { create } from 'zustand';
import { api, ApiError } from '../services/api.ts';
import { DEFAULT_LOCALE, LOCALES, cardTextsIn, type Locale } from '../../i18n/index.ts';
import { ALL_CARDS, cardStatus } from '../../data/cards.ts';
import { blankCard } from '../../data/defaults.ts';
import { validateCard } from '../../data/validate.ts';
import type { Card, CardStatus } from '../../data/types.ts';
import type { TextRef } from '../../shared/text.ts';

/**
 * Estado do estúdio de cartas (decisões nº 22 e nº 41).
 *
 * O catálogo NÃO passa por aqui: quem lê carta é o import de `ALL_CARDS`, que o HMR
 * do Vite recarrega sozinho quando o servidor reescreve o arquivo. Esta store cuida
 * só do que é do estúdio — a chave, a aba aberta, o rascunho em edição, a biblioteca
 * de imagens e o resultado de cada gravação.
 */

export const TRANSLATED_LOCALES: readonly Locale[] = LOCALES.filter(
  (locale) => locale !== DEFAULT_LOCALE,
);

export type CardTranslations = Record<string, { name: string; text: string }>;

/** as três salas do estúdio; a do meio é o catálogo que o estúdio mesmo criou */
export type StudioTab = 'form' | 'cards' | 'library';

/** rascunho aberto: a carta em edição mais as traduções dela */
export interface Draft {
  card: Card;
  translations: CardTranslations;
  /** id ainda não existe no catálogo */
  fresh: boolean;
}

/**
 * Uma ilustração de `public/assets/arte`, com o que o servidor sabe dela.
 *
 * `final` e `archived` são as marcas do índice (`library.json`); `usedBy` é a carta
 * que aponta para o arquivo hoje, e é ele que impede apagar arte em uso.
 */
export interface ArtFile {
  file: string;
  bytes: number;
  width: number | null;
  height: number | null;
  final: boolean;
  archived: boolean;
  usedBy: number | null;
}

/** o que a tela quer estar mostrando depois que o rascunho aberto se resolver */
export type Intent = { kind: 'edit'; id: number } | { kind: 'create' } | { kind: 'none' };

const KEY_STORAGE = 'ezone:studio-key';

/**
 * Gravar reescreve `src/data/*.ts`, e o HMR do Vite responde a isso RECARREGANDO a
 * página — é assim que a carta nova aparece na lista sem o estúdio manter catálogo
 * próprio. O preço é o React perder o estado, então o que a tela deveria estar
 * mostrando fica anotado aqui e ela reencena ao montar. Some sozinho ao fechar a
 * aba (sessionStorage).
 *
 * É uma INTENÇÃO, e não só o id aberto, porque "gravar e ir para a outra carta"
 * precisa sobreviver ao recarregamento: sem isso a gravação sempre reabria a carta
 * gravada e a troca pedida se perdia no caminho.
 */
const INTENT_STORAGE = 'ezone:studio-open';
/** e a aba junto: publicar uma carta pela lista não pode devolver o autor ao formulário */
const TAB_STORAGE = 'ezone:studio-tab';

const rememberIntent = (intent: Intent): void => {
  if (intent.kind === 'none') sessionStorage.removeItem(INTENT_STORAGE);
  else sessionStorage.setItem(INTENT_STORAGE, JSON.stringify(intent));
};

/** o que estava aberto antes do recarregamento, se ainda fizer sentido abrir */
export function rememberedIntent(): Intent {
  const raw = sessionStorage.getItem(INTENT_STORAGE);
  if (!raw) return { kind: 'none' };
  try {
    const stored = JSON.parse(raw) as Intent;
    if (stored.kind === 'create') return stored;
    if (stored.kind === 'edit' && ALL_CARDS.some((card) => card.id === stored.id)) return stored;
  } catch {
    // anotação estragada: começa do zero
  }
  return { kind: 'none' };
}

const TABS: readonly StudioTab[] = ['form', 'cards', 'library'];

function rememberedTab(): StudioTab {
  const saved = sessionStorage.getItem(TAB_STORAGE);
  return TABS.includes(saved as StudioTab) ? (saved as StudioTab) : 'form';
}

const studioHeaders = (key: string): Record<string, string> => ({ 'x-ezone-studio': key });

/**
 * O que a portaria sabe da chave guardada.
 *
 * A chave é do PROCESSO do servidor: sem `EZONE_ADMIN_KEY` ela é sorteada a cada
 * `--admin`, então reiniciar o servidor mata a que está no navegador sem ninguém
 * avisar. Guardar a chave e confiar nela era o que deixava a tela abrir inteira com
 * uma chave morta — a descoberta vinha no 403 da GRAVAÇÃO, com a carta já editada.
 *
 * - `unknown` — ainda não perguntamos (a tela acabou de montar)
 * - `missing` — não há chave guardada: a portaria pede uma
 * - `ok` — o servidor aceitou
 * - `stale` — a chave morreu com a tela JÁ aberta (403 no meio de uma gravação)
 *
 * Recusa NA ENTRADA não vira estado: `verifyKey` devolve `'refused'`, a chave morta
 * é esquecida e quem manda a tela embora é o próprio estúdio.
 */
export type KeyStatus = 'unknown' | 'missing' | 'ok' | 'stale';

/** o que a conferência da chave achou; `refused` é a que tira o autor da tela */
export type KeyVerdict = 'ok' | 'missing' | 'refused';

interface AdminState {
  enabled: boolean | null;
  key: string;
  keyStatus: KeyStatus;
  tab: StudioTab;
  /**
   * A biblioteca foi aberta para ESCOLHER a arte da carta em edição. Não é uma aba
   * à parte: é a mesma biblioteca, com a faixa de aviso em cima e o clique na
   * imagem valendo "usar esta", em vez de "abrir a ficha".
   */
  picking: boolean;
  draft: Draft | null;
  busy: boolean;
  /** recusa do servidor, já pronta para traduzir */
  error: TextRef | null;
  problems: TextRef[];
  savedTo: string | null;
  /** o rascunho como estava ao abrir (ou ao gravar): a régua do "foi mexido" */
  pristine: string | null;
  /**
   * A troca que está esperando o autor decidir o que fazer com as mudanças.
   * `intent: null` é "não mexa no rascunho, só me deixe sair" — sair do estúdio não
   * fecha a carta aberta, senão voltar para cá pediria para reabri-la à mão.
   */
  pending: { intent: Intent | null; after: (() => void) | null } | null;
  /** as ilustrações no disco; `null` enquanto ninguém pediu a lista */
  artFiles: ArtFile[] | null;
  /**
   * Quando cada ilustração foi regravada nesta sessão do estúdio.
   *
   * A prévia e a biblioteca apontam para `/assets/arte/<arquivo>`, e regravar o
   * arquivo NÃO muda esse endereço — o navegador segue mostrando o que já tem na
   * memória. Inclusive quando o que ele tem é a FALHA de quando o arquivo ainda não
   * existia: em dev quem serve `public/` é o Vite, e imagem que ele não acha cai no
   * fallback da SPA e volta como index.html com status 200, que não decodifica. Era
   * a ilustração enviada que "não aparecia, ficava link quebrado". O carimbo entra
   * na query e faz o endereço mudar junto com o arquivo.
   */
  artStamps: Record<string, number>;

  checkEnabled: () => Promise<void>;
  /** confere a chave guardada contra o servidor; a morta é esquecida no caminho */
  verifyKey: () => Promise<KeyVerdict>;
  /** guarda a chave digitada SÓ se o servidor a aceitar */
  submitKey: (key: string) => Promise<boolean>;
  /** esquece a chave e volta à portaria, sem sair da tela */
  lock: () => void;
  goTab: (tab: StudioTab) => void;
  /** abre a biblioteca no modo "escolher arte para a carta aberta" */
  pickArt: () => void;
  cancelPick: () => void;
  edit: (cardId: number) => void;
  create: () => void;
  close: () => void;
  /** sair do estúdio inteiro: mesma guarda, com o que fazer depois */
  leave: (after: () => void) => void;
  /** encena a intenção anotada antes do recarregamento */
  resume: (intent: Intent) => void;
  dirty: () => boolean;
  discardPending: () => void;
  savePending: () => Promise<void>;
  cancelPending: () => void;
  change: (card: Card) => void;
  translate: (locale: string, entry: { name: string; text: string }) => void;
  save: () => Promise<boolean>;
  /** move UMA carta do catálogo na esteira, sem passar pelo formulário */
  moveStatus: (cardId: number, status: CardStatus) => Promise<boolean>;
  removeCard: (cardId: number) => Promise<boolean>;
  loadArt: () => Promise<void>;
  uploadArt: (file: File, name: string) => Promise<boolean>;
  /** liga/desliga as marcas da ilustração (arte final, arquivada) */
  markArt: (file: string, marks: { final?: boolean; archived?: boolean }) => Promise<boolean>;
  /** apaga do disco; o servidor recusa o que não está arquivado ou está em uso */
  deleteArt: (file: string) => Promise<boolean>;
}

/** o próximo id livre: o catálogo é contíguo por formato, então é o maior + 1 */
export function nextFreeId(): number {
  return ALL_CARDS.reduce((biggest, card) => Math.max(biggest, card.id), 0) + 1;
}

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

/**
 * JSON com as chaves em ordem alfabética.
 *
 * O formulário mexe no objeto por cópia (`{...card}` + `delete`), e apagar um campo
 * para recriá-lo o joga para o fim — com `JSON.stringify` cru, ligar e desligar uma
 * caixa deixaria o rascunho "sujo" sem nenhuma diferença de conteúdo.
 */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const snapshot = (draft: Draft): string =>
  stableJson({ card: draft.card, translations: draft.translations });

const asRefs = (error: unknown): { error: TextRef | null; problems: TextRef[] } =>
  error instanceof ApiError
    ? { error: error.ref, problems: error.details }
    : { error: null, problems: [] };

/**
 * A recusa vista pela portaria: 403 numa rota de escrita é a chave morrendo com o
 * estúdio JÁ aberto (o servidor reiniciou e sorteou outra). Vira `stale`, e não
 * `missing`, porque há rascunho na tela — quem está com carta editada na mão pede a
 * chave nova por cima do trabalho, não é mandado embora com ele.
 */
const failure = (
  error: unknown,
): { error: TextRef | null; problems: TextRef[]; keyStatus?: KeyStatus } =>
  error instanceof ApiError && error.status === 403
    ? { ...asRefs(error), keyStatus: 'stale' }
    : asRefs(error);

/**
 * Espera a ilustração aparecer no ENDEREÇO público antes de o carimbo mandar a tela
 * pedi-la.
 *
 * O servidor já gravou o arquivo, mas em dev quem o serve é o Vite, e ele responde
 * pela lista de `public/` que monta ao subir e atualiza pelo watcher — há uma janela
 * em que o arquivo está no disco e ainda não está na lista. Pedir dentro dela volta
 * o index.html do fallback com status 200, e o navegador guarda ESSE html no lugar
 * da imagem: a arte nasce quebrada e continua quebrada, porque o endereço não muda
 * mais. `accept: image/*` é o que tira o fallback do caminho — sem `text/html` nem
 * `*` ele não responde, então o "ainda não" chega como 404 honesto.
 */
async function waitForArt(url: string): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const there = await fetch(url, { method: 'HEAD', headers: { accept: 'image/*' } })
      .then((reply) => reply.ok)
      .catch(() => false);
    if (there) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

export const useAdminStore = create<AdminState>((set, get) => {
  /** abre de fato, sem perguntar nada: a guarda já correu (ou não havia o que guardar) */
  const apply = (intent: Intent): void => {
    rememberIntent(intent);

    if (intent.kind === 'edit') {
      const card = ALL_CARDS.find((candidate) => candidate.id === intent.id);
      if (!card) return;
      const draft: Draft = {
        card: structuredClone(card) as Card,
        translations: translationsOf(card),
        fresh: false,
      };
      set({ draft, pristine: snapshot(draft), error: null, problems: [], savedTo: null });
      get().goTab('form');
      return;
    }

    if (intent.kind === 'create') {
      const draft: Draft = {
        card: blankCard(nextFreeId(), 'creature'),
        translations: emptyTranslations(),
        fresh: true,
      };
      set({ draft, pristine: snapshot(draft), error: null, problems: [], savedTo: null });
      get().goTab('form');
      return;
    }

    set({ draft: null, pristine: null, error: null, problems: [], savedTo: null });
  };

  /** só sai do rascunho atual depois que o autor disser o que fazer com o que mexeu */
  const guard = (intent: Intent | null, after: (() => void) | null): void => {
    if (!get().dirty()) {
      if (intent) apply(intent);
      after?.();
      return;
    }
    set({ pending: { intent, after } });
  };

  /** grava UMA carta com as traduções que ela já tem; devolve o arquivo escrito */
  const put = async (card: Card, translations: CardTranslations): Promise<string> => {
    const reply = await api<{ file: string }>(
      'PUT',
      `/api/admin/cards/${card.id}`,
      { card, translations },
      studioHeaders(get().key),
    );
    return reply.file;
  };

  return {
    enabled: null,
    key: localStorage.getItem(KEY_STORAGE) ?? '',
    keyStatus: 'unknown',
    tab: rememberedTab(),
    picking: false,
    draft: null,
    busy: false,
    error: null,
    problems: [],
    savedTo: null,
    pristine: null,
    pending: null,
    artFiles: null,
    artStamps: {},

    checkEnabled: async () => {
      const reply = await api<{ enabled: boolean }>('GET', '/api/admin/status').catch(() => null);
      set({ enabled: reply?.enabled ?? false });
    },

    verifyKey: async () => {
      const { key } = get();
      if (!key) {
        set({ keyStatus: 'missing', error: null });
        return 'missing';
      }

      // volta a "não sei" enquanto pergunta: a tela não abre pelo que sobrou da
      // visita anterior — o servidor pode ter reiniciado no meio dela
      set({ keyStatus: 'unknown', error: null, problems: [] });
      try {
        await api('GET', '/api/admin/access', undefined, studioHeaders(key));
        set({ keyStatus: 'ok' });
        return 'ok';
      } catch (error) {
        // 403 é a chave morta: some com ela, senão a próxima entrada tenta a mesma
        // e cai no mesmo lugar. Falha de outra natureza (servidor fora do ar, sessão
        // caída) não é motivo para apagar uma chave que pode estar certa — a tela
        // também não abre, e o autor tenta de novo.
        if (error instanceof ApiError && error.status === 403) {
          localStorage.removeItem(KEY_STORAGE);
          set({ key: '' });
        }
        set({ keyStatus: 'missing' });
        return 'refused';
      }
    },

    submitKey: async (key) => {
      set({ busy: true, error: null, problems: [] });
      try {
        await api('GET', '/api/admin/access', undefined, studioHeaders(key));
        localStorage.setItem(KEY_STORAGE, key);
        set({ busy: false, key, keyStatus: 'ok', error: null });
        return true;
      } catch (error) {
        // a recusa fica NO formulário: `failure` mandaria a portaria para `stale` e
        // abriria a tela por baixo de quem ainda está tentando entrar
        set({ busy: false, ...asRefs(error) });
        return false;
      }
    },

    /**
     * Travar não é sair: o rascunho fica onde está e a portaria sobe por cima dele.
     * Quem trava é quem vai deixar a máquina sozinha, não quem terminou o trabalho.
     */
    lock: () => {
      localStorage.removeItem(KEY_STORAGE);
      set({ key: '', keyStatus: 'missing', error: null, problems: [] });
    },

    goTab: (tab) => {
      sessionStorage.setItem(TAB_STORAGE, tab);
      set({ tab, picking: tab === 'library' ? get().picking : false });
    },

    pickArt: () => {
      sessionStorage.setItem(TAB_STORAGE, 'library');
      set({ tab: 'library', picking: true });
    },

    cancelPick: () => {
      sessionStorage.setItem(TAB_STORAGE, 'form');
      set({ tab: 'form', picking: false });
    },

    dirty: () => {
      const { draft, pristine } = get();
      return draft !== null && pristine !== null && snapshot(draft) !== pristine;
    },

    edit: (cardId) => guard({ kind: 'edit', id: cardId }, null),
    create: () => guard({ kind: 'create' }, null),
    close: () => guard({ kind: 'none' }, null),
    leave: (after) => guard(null, after),
    resume: (intent) => apply(intent),

    cancelPending: () => set({ pending: null }),

    discardPending: () => {
      const pending = get().pending;
      if (!pending) return;
      set({ pending: null });
      if (pending.intent) apply(pending.intent);
      pending.after?.();
    },

    savePending: async () => {
      const pending = get().pending;
      if (!pending) return;
      const saved = await get().save();
      if (!saved) return;
      // a página vai recarregar pelo HMR: quem manda no que reabre é a intenção
      set({ pending: null });
      if (pending.intent) apply(pending.intent);
      pending.after?.();
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
      const { draft } = get();
      if (!draft) return false;

      set({ busy: true, error: null, problems: [] });
      try {
        const file = await put(draft.card, draft.translations);
        // a página vai recarregar sozinha pelo HMR; a anotação traz a carta de volta
        rememberIntent({ kind: 'edit', id: draft.card.id });
        const saved: Draft = { ...draft, fresh: false };
        set({ busy: false, savedTo: file, draft: saved, pristine: snapshot(saved) });
        return true;
      } catch (error) {
        set({ busy: false, ...failure(error) });
        return false;
      }
    },

    /**
     * Mover a carta na esteira pela LISTA, sem abrir o formulário.
     *
     * A carta vem do catálogo, e não do rascunho: gravar por cima do que o autor
     * está digitando noutra aba seria perder trabalho sem perguntar. Quando a carta
     * mexida é justamente a aberta, a situação nova entra no RASCUNHO e espera o
     * botão de gravar — é o mesmo acordo da guarda de troca de carta.
     */
    moveStatus: async (cardId, status) => {
      const { draft } = get();

      if (draft && draft.card.id === cardId && get().dirty()) {
        get().change({ ...draft.card, status } as Card);
        return true;
      }

      const card = ALL_CARDS.find((candidate) => candidate.id === cardId);
      if (!card) return false;

      set({ busy: true, error: null, problems: [] });
      try {
        const next = { ...structuredClone(card), status } as Card;
        const file = await put(next, translationsOf(card));
        set({ busy: false, savedTo: file });
        // a carta aberta (e limpa) acompanha: o HMR vai recarregar, mas até lá a
        // tela não pode mostrar duas verdades sobre a mesma carta
        if (draft && draft.card.id === cardId) {
          const synced: Draft = { ...draft, card: next };
          set({ draft: synced, pristine: snapshot(synced) });
        }
        return true;
      } catch (error) {
        set({ busy: false, ...failure(error) });
        return false;
      }
    },

    removeCard: async (cardId) => {
      set({ busy: true, error: null, problems: [] });
      try {
        await api('DELETE', `/api/admin/cards/${cardId}`, undefined, studioHeaders(get().key));
        if (get().draft?.card.id === cardId) {
          rememberIntent({ kind: 'none' });
          set({ draft: null, pristine: null, pending: null });
        }
        set({ busy: false });
        return true;
      } catch (error) {
        set({ busy: false, ...failure(error) });
        return false;
      }
    },

    loadArt: async () => {
      const { key } = get();
      try {
        const reply = await api<{ files: ArtFile[] }>(
          'GET',
          '/api/admin/art',
          undefined,
          studioHeaders(key),
        );
        set({ artFiles: reply.files });
      } catch (error) {
        // biblioteca vazia por chave morta parecia pasta vazia: o 403 tem de acender
        // a portaria aqui também, senão o autor procura arte que existe
        set({ artFiles: [], ...failure(error) });
      }
    },

    uploadArt: async (file, name) => {
      const { key } = get();
      set({ busy: true, error: null, problems: [] });
      try {
        const data = await fileToBase64(file);
        await api('POST', '/api/admin/art', { file: name, data }, studioHeaders(key));

        // o carimbo é o endereço novo da arte, e só vale depois que ele responde
        // imagem — carimbar antes só trocaria uma prévia quebrada por outra
        const stamp = Date.now();
        await waitForArt(`/assets/arte/${name}?v=${stamp}`);
        set({ busy: false, artStamps: { ...get().artStamps, [name]: stamp } });

        // o arquivo novo tem de aparecer na biblioteca sem recarregar nada
        await get().loadArt();
        return true;
      } catch (error) {
        set({ busy: false, ...failure(error) });
        return false;
      }
    },

    markArt: async (file, marks) => {
      set({ busy: true, error: null, problems: [] });
      try {
        await api(
          'PATCH',
          `/api/admin/art/${encodeURIComponent(file)}`,
          marks,
          studioHeaders(get().key),
        );
        set({ busy: false });
        await get().loadArt();
        return true;
      } catch (error) {
        set({ busy: false, ...failure(error) });
        return false;
      }
    },

    deleteArt: async (file) => {
      set({ busy: true, error: null, problems: [] });
      try {
        await api(
          'DELETE',
          `/api/admin/art/${encodeURIComponent(file)}`,
          undefined,
          studioHeaders(get().key),
        );
        set({ busy: false });
        await get().loadArt();
        return true;
      } catch (error) {
        set({ busy: false, ...failure(error) });
        return false;
      }
    },
  };
});

/**
 * Os idiomas que ainda faltam traduzir neste rascunho.
 *
 * O servidor recusa carta sem as três línguas (o teste de i18n as exige), então a
 * tela cobra antes — e cobra no mesmo lugar em que mostra os problemas estruturais.
 */
export function missingTranslationsOf(draft: Draft): Locale[] {
  return TRANSLATED_LOCALES.filter((locale) => {
    const entry = draft.translations[locale];
    return !entry?.name.trim() || !entry?.text.trim();
  });
}

/**
 * A carta pode ir para o catálogo agora?
 *
 * É a MESMA pergunta que bloqueia o botão de gravar e a saída "gravar e continuar"
 * da guarda de rascunho: sem isto a resposta óbvia da guarda levaria a um erro do
 * servidor no meio de uma troca de carta.
 */
export function draftBlocked(draft: Draft): boolean {
  return validateCard(draft.card).length > 0 || missingTranslationsOf(draft).length > 0;
}

/** quantas cartas o catálogo tem em cada situação da esteira */
export function statusTally(): Record<CardStatus, number> {
  const tally: Record<CardStatus, number> = { draft: 0, review: 0, published: 0, archived: 0 };
  for (const card of ALL_CARDS) tally[cardStatus(card)] += 1;
  return tally;
}

/**
 * O endereço da ilustração, com o carimbo da última regravação desta sessão.
 *
 * É hook porque o carimbo é estado: a prévia tem de se refazer no instante em que o
 * arquivo é regravado, mesmo que a carta continue apontando para o mesmo nome.
 */
export function useArtUrl(): (file: string) => string {
  const stamps = useAdminStore((state) => state.artStamps);
  return (file) => {
    const stamp = stamps[file];
    return stamp === undefined ? `/assets/arte/${file}` : `/assets/arte/${file}?v=${stamp}`;
  };
}

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
