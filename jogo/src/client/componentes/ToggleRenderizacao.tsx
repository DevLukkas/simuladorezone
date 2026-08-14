import { useRenderizacaoStore } from '../estado/renderizacaoStore.ts';

/**
 * Alterna entre a arte impressa e a carta composta, em qualquer tela.
 *
 * Fica fixo na janela de propósito: comparar os dois desenhos exige ver a mesma carta
 * nos dois modos em coleção, editor de deck e tabuleiro, sem sair da tela.
 */
export function ToggleRenderizacao() {
  const modo = useRenderizacaoStore((estado) => estado.modo);
  const alternar = useRenderizacaoStore((estado) => estado.alternar);

  return (
    <button
      type="button"
      onClick={alternar}
      title="Alterna entre a arte impressa e a carta montada em runtime"
      className="fixed bottom-3 left-3 z-40 rounded-full bg-slate-900/85 px-3 py-1.5 text-xs font-bold text-slate-300 shadow ring-1 ring-slate-700 backdrop-blur hover:bg-slate-800 hover:text-slate-100"
    >
      carta: {modo === 'impressa' ? 'impressa' : 'composta'}
    </button>
  );
}
