import { useEffect } from 'react';
import { cartaPorId } from '../../data/cartas.ts';
import { useCartaAmpliadaStore } from '../estado/cartaAmpliadaStore.ts';
import { useRenderizacaoStore } from '../estado/renderizacaoStore.ts';
import { caminhoDaArte } from './Carta.tsx';
import { CartaComposta } from './CartaComposta.tsx';

/** Modal de leitura: a carta em tamanho grande + os dados do catálogo ao lado. */
export function CartaAmpliada() {
  const { cartaId, fechar } = useCartaAmpliadaStore();
  const modo = useRenderizacaoStore((estado) => estado.modo);

  useEffect(() => {
    if (cartaId === null) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') fechar();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [cartaId, fechar]);

  if (cartaId === null) return null;
  const carta = cartaPorId(cartaId);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-wrap items-center justify-center gap-6 overflow-y-auto bg-black/80 p-6"
      onClick={fechar}
      onContextMenu={(evento) => {
        evento.preventDefault();
        fechar();
      }}
    >
      {/* sem arte impressa (Quatro Elementos) só existe o modo composto */}
      {modo === 'composta' || !carta.img ? (
        <div className="aspect-[415/555] h-[85vh] shrink-0 drop-shadow-2xl">
          <CartaComposta carta={carta} arte={caminhoDaArte(carta)} />
        </div>
      ) : (
        <img
          src={`/assets/cards/${carta.img}`}
          alt={carta.nome}
          className="max-h-[85vh] rounded-lg shadow-2xl"
          draggable={false}
        />
      )}
      <div className="w-80 max-w-full rounded-lg border border-slate-700 bg-slate-900/95 p-4 text-sm">
        <h2 className="text-lg font-bold">{carta.nome}</h2>
        <p className="mb-2 flex flex-wrap gap-2 text-xs capitalize">
          <span className="rounded bg-slate-800 px-2 py-0.5">{carta.tipo}</span>
          <span className="rounded bg-slate-800 px-2 py-0.5">{carta.elemento}</span>
          <span className="rounded bg-slate-800 px-2 py-0.5">{carta.raridade}</span>
        </p>
        {carta.tipo === 'criatura' && (
          <p className="mb-2 text-slate-300">
            {carta.raca} — <span className="font-bold">{carta.ataque}</span> de ataque /{' '}
            <span className="font-bold">{carta.vida}</span> de vida
          </p>
        )}
        <p className="whitespace-pre-line leading-6 text-slate-200">
          {carta.efeito ?? 'Sem texto de efeito.'}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          {carta.edicao} — nº {carta.id}
        </p>
        <p className="mt-1 text-xs text-slate-600">clique em qualquer lugar (ou Esc) para fechar</p>
      </div>
    </div>
  );
}
