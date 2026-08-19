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

interface DecksState {
  decks: SavedDeck[];
  loaded: boolean;
  error: TextRef | null;
  load: () => Promise<void>;
  save: (deck: Omit<SavedDeck, 'id'> & { id?: number }) => Promise<SavedDeck | null>;
  remove: (id: number) => Promise<void>;
}

export const useDecksStore = create<DecksState>((set, get) => ({
  decks: [],
  loaded: false,
  error: null,

  load: async () => {
    try {
      const data = await api<{ decks: SavedDeck[] }>('GET', '/api/decks');
      set({ decks: data.decks, loaded: true, error: null });
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
}));
