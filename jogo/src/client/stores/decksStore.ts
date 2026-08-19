import { create } from 'zustand';
import { ApiError, api } from '../services/api.ts';
import { text, type TextRef } from '../../shared/text.ts';
import type { Format } from '../../data/types.ts';

export interface SavedDeck {
  id: number;
  name: string;
  hero: string;
  cards: Record<number, number>;
  /** ausente nos decks gravados antes do segundo formato existir */
  format?: Format;
}

/**
 * O BARALHO ATIVO é o que a moldura mostra no rodapé da trilha e o que entra nas
 * partidas (decisão nº 29). A conta pode ter vários; a escolha de qual está na
 * mesa é do cliente, não do servidor — por isso vive aqui e no `localStorage`, e
 * não numa coluna de `decks`.
 */
const ACTIVE_KEY = 'ezone:activeDeck';

function storedActive(): number | null {
  try {
    const saved = Number(localStorage.getItem(ACTIVE_KEY));
    return Number.isInteger(saved) && saved > 0 ? saved : null;
  } catch {
    return null;
  }
}

function rememberActive(id: number | null): void {
  try {
    if (id === null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, String(id));
  } catch {
    // sem localStorage (SSR, teste): a escolha vale só para esta sessão
  }
}

interface DecksState {
  decks: SavedDeck[];
  activeId: number | null;
  loaded: boolean;
  error: TextRef | null;
  load: () => Promise<void>;
  save: (deck: Omit<SavedDeck, 'id'> & { id?: number }) => Promise<SavedDeck | null>;
  remove: (id: number) => Promise<void>;
  setActive: (id: number | null) => void;
}

export const useDecksStore = create<DecksState>((set, get) => ({
  decks: [],
  activeId: storedActive(),
  loaded: false,
  error: null,

  load: async () => {
    try {
      const data = await api<{ decks: SavedDeck[] }>('GET', '/api/decks');
      set({ decks: data.decks, loaded: true, error: null });
      get().setActive(pickActive(data.decks, get().activeId));
    } catch (error) {
      set({ error: error instanceof ApiError ? error.ref : text('common.failed'), loaded: true });
    }
  },

  save: async (deck) => {
    try {
      const saved =
        deck.id === undefined
          ? await api<SavedDeck>('POST', '/api/decks', deck)
          : await api<SavedDeck>('PUT', `/api/decks/${deck.id}`, deck);
      await get().load();
      // o deck que acabou de ser gravado é o que o jogador tem em mente: vira o ativo
      get().setActive(saved.id);
      set({ error: null });
      return saved;
    } catch (error) {
      set({ error: error instanceof ApiError ? error.ref : text('common.failed') });
      return null;
    }
  },

  remove: async (id) => {
    try {
      await api('DELETE', `/api/decks/${id}`);
      await get().load();
    } catch (error) {
      set({ error: error instanceof ApiError ? error.ref : text('common.failed') });
    }
  },

  setActive: (id) => {
    if (get().activeId === id) return;
    rememberActive(id);
    set({ activeId: id });
  },
}));

/** o ativo guardado, se ainda existir; senão o primeiro da lista; senão nenhum */
function pickActive(decks: SavedDeck[], wanted: number | null): number | null {
  if (wanted !== null && decks.some((deck) => deck.id === wanted)) return wanted;
  return decks[0]?.id ?? null;
}

/** O deck ativo já resolvido — `null` enquanto a conta não tiver nenhum. */
export function activeDeckOf(state: {
  decks: SavedDeck[];
  activeId: number | null;
}): SavedDeck | null {
  return state.decks.find((deck) => deck.id === state.activeId) ?? null;
}
