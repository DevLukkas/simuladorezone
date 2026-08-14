import { create } from 'zustand';
import { api } from '../services/api.ts';
import type { Formato } from '../../data/tipos.ts';

export interface DeckSalvo {
  id: number;
  nome: string;
  heroi: string;
  cartas: Record<number, number>;
  /** ausente nos decks gravados antes do segundo formato existir */
  formato?: Formato;
}

interface DecksState {
  decks: DeckSalvo[];
  carregado: boolean;
  erro: string | null;
  carregar: () => Promise<void>;
  salvar: (deck: Omit<DeckSalvo, 'id'> & { id?: number }) => Promise<DeckSalvo | null>;
  apagar: (id: number) => Promise<void>;
}

export const useDecksStore = create<DecksState>((set, get) => ({
  decks: [],
  carregado: false,
  erro: null,

  carregar: async () => {
    try {
      const dados = await api<{ decks: DeckSalvo[] }>('GET', '/api/decks');
      set({ decks: dados.decks, carregado: true, erro: null });
    } catch (erro) {
      set({ erro: erro instanceof Error ? erro.message : 'falhou', carregado: true });
    }
  },

  salvar: async (deck) => {
    try {
      const salvo =
        deck.id === undefined
          ? await api<DeckSalvo>('POST', '/api/decks', deck)
          : await api<DeckSalvo>('PUT', `/api/decks/${deck.id}`, deck);
      await get().carregar();
      set({ erro: null });
      return salvo;
    } catch (erro) {
      set({ erro: erro instanceof Error ? erro.message : 'falhou' });
      return null;
    }
  },

  apagar: async (id) => {
    try {
      await api('DELETE', `/api/decks/${id}`);
      await get().carregar();
    } catch (erro) {
      set({ erro: erro instanceof Error ? erro.message : 'falhou' });
    }
  },
}));
