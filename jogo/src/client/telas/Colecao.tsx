import { useState } from 'react';
import { TODAS_AS_CARTAS } from '../../data/cartas.ts';
import { CartaImagem } from '../componentes/Carta.tsx';
import { BarraDeFiltros, FILTRO_INICIAL, filtrarCartas } from '../componentes/FiltroDeCartas.tsx';
import { useCartaAmpliadaStore } from '../estado/cartaAmpliadaStore.ts';

export function Colecao({ aoVoltar }: { aoVoltar: () => void }) {
  const [filtro, setFiltro] = useState(FILTRO_INICIAL);
  const ampliar = useCartaAmpliadaStore((estado) => estado.ampliar);
  const cartas = filtrarCartas(TODAS_AS_CARTAS, filtro);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={aoVoltar}>
          ← Voltar
        </button>
        <h1 className="text-2xl font-bold">Coleção</h1>
        <span className="text-sm text-slate-400">
          {cartas.length} carta(s) — na v1 todo jogador tem a coleção completa
        </span>
      </div>

      <BarraDeFiltros valor={filtro} aoMudar={setFiltro} />
      <p className="mb-3 text-xs text-slate-500">Clique numa carta para ampliá-la e ler o efeito.</p>

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
        {cartas.map((carta) => (
          <button key={carta.id} type="button" className="block w-full" onClick={() => ampliar(carta.id)}>
            <CartaImagem cartaId={carta.id} className="w-full rounded shadow transition-transform hover:scale-105" />
          </button>
        ))}
      </div>
      {cartas.length === 0 && (
        <p className="mt-6 text-center text-slate-500">Nenhuma carta com esses filtros.</p>
      )}
    </main>
  );
}
