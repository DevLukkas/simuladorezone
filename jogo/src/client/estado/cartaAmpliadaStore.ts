import { create } from 'zustand';

/**
 * Carta atualmente ampliada em tela cheia (para ler o texto).
 * Qualquer tela abre com `ampliar(cartaId)`; o modal vive no App.
 */
interface CartaAmpliadaState {
  cartaId: number | null;
  ampliar: (cartaId: number) => void;
  fechar: () => void;
}

export const useCartaAmpliadaStore = create<CartaAmpliadaState>((set) => ({
  cartaId: null,
  ampliar: (cartaId) => set({ cartaId }),
  fechar: () => set({ cartaId: null }),
}));
