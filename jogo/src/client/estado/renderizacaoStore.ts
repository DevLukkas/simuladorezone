import { create } from 'zustand';

/**
 * Como a carta é desenhada. É preferência de CLIENTE, não estado de partida: não muda
 * regra nenhuma, então fica fora do `EstadoDoJogo` para não sujar a pureza do motor nem
 * exigir acordo com o servidor.
 *
 * - `impressa`: a arte finalizada em /assets/cards (o modo que sempre existiu)
 * - `composta`: montada em runtime no molde novo, com ATQ/VIDA vindos do motor
 *
 * Existem as duas para dar para comparar lado a lado antes de escolher uma.
 */
export type Renderizacao = 'impressa' | 'composta';

const CHAVE = 'ezone:renderizacao';

function inicial(): Renderizacao {
  if (typeof localStorage === 'undefined') return 'impressa';
  return localStorage.getItem(CHAVE) === 'composta' ? 'composta' : 'impressa';
}

interface RenderizacaoState {
  modo: Renderizacao;
  definir: (modo: Renderizacao) => void;
  alternar: () => void;
}

export const useRenderizacaoStore = create<RenderizacaoState>((set, get) => ({
  modo: inicial(),
  definir: (modo) => {
    localStorage.setItem(CHAVE, modo);
    set({ modo });
  },
  alternar: () => get().definir(get().modo === 'impressa' ? 'composta' : 'impressa'),
}));
