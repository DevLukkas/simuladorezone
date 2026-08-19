import { create } from 'zustand';

/**
 * O aviso rápido do console (decisão nº 29): a faixa que sobe no rodapé quando o
 * jogo recusa uma jogada de MONTAGEM — 41ª carta, 4ª cópia, deck gravado.
 *
 * Não confundir com a recusa do MOTOR (`lastRefusal` em `matchStore`), que é
 * `TextRef` e vive enquanto a partida durar. Aqui o texto já vem traduzido: quem
 * chama é a tela, que tem `t` na mão, e o aviso morre sozinho em três segundos.
 */
const TOAST_MS = 2600;

interface ToastState {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,

  show: (message) => {
    set({ message });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => set({ message: null }), TOAST_MS);
  },

  clear: () => {
    if (timer) clearTimeout(timer);
    set({ message: null });
  },
}));
