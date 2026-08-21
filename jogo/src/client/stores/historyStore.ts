import { create } from 'zustand';
import { api } from '../services/api.ts';
import type { TextRef } from '../../shared/text.ts';

/**
 * O arquivo de partidas (decisão nº 43). A tela lê daqui e nada mais: o servidor
 * já devolve a linha apurada — placar, duração, origem dos pontos e os momentos
 * que valem uma frase, estes últimos em chave+parâmetros (invariante 8).
 *
 * O replay NÃO mora aqui: ele entra pela `matchStore`, porque quem o desenha é o
 * tabuleiro, e para o tabuleiro rever é a mesma coisa que jogar — só que sem
 * comando a enviar.
 */

export type MatchMode = 'online' | 'training';

export interface PointSources {
  legendary: number;
  rare: number;
  direct: number;
}

export interface Highlight {
  turn: number;
  ref: TextRef;
  tone: 'good' | 'bad' | 'neutral';
}

export interface HistoryEntry {
  id: number;
  mode: MatchMode;
  opponent: string;
  won: boolean;
  reason: 'points' | 'concede' | 'timeout';
  turns: number;
  seconds: number;
  pointsMe: number;
  pointsThem: number;
  directDealt: number;
  directTaken: number;
  heroMe: string;
  heroThem: string;
  deckName: string;
  points: PointSources;
  highlights: Highlight[];
  /** ISO; a tela formata no fuso de quem lê */
  endedAt: string;
}

/** as cinco abas do desenho, na ordem em que aparecem */
export type HistoryFilter = 'all' | 'wins' | 'losses' | 'online' | 'training';

interface HistoryState {
  /** `null` enquanto nunca carregou — vazio de verdade é `[]` */
  entries: HistoryEntry[] | null;
  loading: boolean;
  failed: boolean;
  filter: HistoryFilter;
  /** id da partida aberta no relatório; `null` cai na primeira da lista */
  selectedId: number | null;
  load: () => Promise<void>;
  setFilter: (filter: HistoryFilter) => void;
  select: (id: number) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: null,
  loading: false,
  failed: false,
  filter: 'all',
  selectedId: null,

  load: async () => {
    set({ loading: true, failed: false });
    try {
      const reply = await api<{ matches: HistoryEntry[] }>('GET', '/api/history');
      set({ entries: reply.matches, loading: false });
    } catch {
      set({ loading: false, failed: true });
    }
  },

  setFilter: (filter) => set({ filter }),
  select: (id) => set({ selectedId: id }),
}));

/** A partida passa neste filtro? Uma função só, para a lista e para a contagem. */
export function matchesFilter(entry: HistoryEntry, filter: HistoryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'wins') return entry.won;
  if (filter === 'losses') return !entry.won;
  return entry.mode === filter;
}
