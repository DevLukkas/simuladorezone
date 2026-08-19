import { create } from 'zustand';

/**
 * Carta atualmente ampliada em tela cheia (para ler o texto).
 * Qualquer tela abre com `ampliar(cartaId)`; o modal vive no App.
 */
interface CardZoomState {
  cardId: number | null;
  zoom: (cardId: number) => void;
  close: () => void;
}

export const useCardZoomStore = create<CardZoomState>((set) => ({
  cardId: null,
  zoom: (cardId) => set({ cardId }),
  close: () => set({ cardId: null }),
}));
