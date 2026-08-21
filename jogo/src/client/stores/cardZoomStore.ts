import { create } from 'zustand';

/**
 * Carta atualmente ampliada em tela cheia (para ler o texto).
 * Qualquer tela abre com `zoom(cartaId)`; o modal vive no App.
 *
 * Ampliando uma criatura DO TABULEIRO vem junto de onde ela é (`onField`), e a
 * janela ganha a segunda aba: a carta impressa continua igual, e ao lado ficam
 * os números vigentes, o que está anexado nela e as restrições em vigor. Guarda
 * a POSIÇÃO (lado + coluna + uid), não uma cópia da criatura — assim o painel lê
 * sempre a visão de agora, e some sozinho se ela deixar o campo.
 */
export interface ZoomedOnField {
  owner: 'me' | 'opponent';
  slot: number;
  /** confere que a coluna ainda tem a MESMA criatura */
  uid: string;
}

interface CardZoomState {
  cardId: number | null;
  onField: ZoomedOnField | null;
  zoom: (cardId: number, onField?: ZoomedOnField) => void;
  close: () => void;
}

export const useCardZoomStore = create<CardZoomState>((set) => ({
  cardId: null,
  onField: null,
  zoom: (cardId, onField) => set({ cardId, onField: onField ?? null }),
  close: () => set({ cardId: null, onField: null }),
}));
