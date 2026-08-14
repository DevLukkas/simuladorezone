import { cartaPorId } from '../../data/cartas.ts';
import type { Carta } from '../../data/tipos.ts';
import type { CriaturaEmCampo } from '../../engine/estado.ts';
import { statsAtuais } from '../../engine/stats.ts';
import { useCartaAmpliadaStore } from '../estado/cartaAmpliadaStore.ts';
import { useRenderizacaoStore } from '../estado/renderizacaoStore.ts';
import { CartaComposta, type StatsVigentes } from './CartaComposta.tsx';

/**
 * Ilustração da carta composta, das duas procedências: no Quatro Elementos ela vem do
 * Figma e o catálogo aponta o arquivo em `arte`; no clássico é o recorte da carta
 * impressa, com o mesmo nome de `img` (ver scripts/arte4e.ts e scripts/arte.ts).
 */
export function caminhoDaArte(carta: Carta): string | undefined {
  const arquivo = carta.arte ?? carta.img?.replace(/\.png$/, '.webp');
  return arquivo ? `/assets/arte/${arquivo}` : undefined;
}

export function CartaImagem({
  cartaId,
  className,
  title,
  stats,
}: {
  cartaId: number;
  className?: string;
  title?: string;
  /** stats vigentes; só a carta composta os usa (a impressa traz os do PNG) */
  stats?: StatsVigentes;
}) {
  const carta = cartaPorId(cartaId);
  const ampliar = useCartaAmpliadaStore((estado) => estado.ampliar);
  const modo = useRenderizacaoStore((estado) => estado.modo);

  const aoClicarComODireito = (evento: React.MouseEvent) => {
    evento.preventDefault();
    ampliar(cartaId);
  };

  /* sem arte impressa (Quatro Elementos) só existe o modo composto */
  if (modo === 'composta' || !carta.img) {
    return (
      <CartaComposta
        carta={carta}
        arte={caminhoDaArte(carta)}
        stats={stats}
        className={className ?? 'w-full'}
        title={title}
        onContextMenu={aoClicarComODireito}
      />
    );
  }

  return (
    <img
      src={`/assets/cards/${carta.img}`}
      alt={carta.nome}
      title={title ?? `${carta.nome} — ${carta.efeito ?? ''}`}
      className={className ?? 'w-full rounded'}
      draggable={false}
      onContextMenu={aoClicarComODireito}
    />
  );
}

export function CriaturaNoCampo({
  criatura,
  campo,
  selecionada,
  onClick,
}: {
  criatura: CriaturaEmCampo;
  campo: readonly (CriaturaEmCampo | null)[];
  selecionada?: boolean;
  onClick?: () => void;
}) {
  const stats = statsAtuais(criatura, campo);
  const ferida = criatura.dano > 0;
  const modo = useRenderizacaoStore((estado) => estado.modo);
  /** na carta composta os números já saem impressos com o valor vigente */
  const precisaDoBadge = modo === 'impressa';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative block w-full rounded transition-transform hover:scale-105 ${
        selecionada ? 'ring-2 ring-amber-400' : ''
      }`}
    >
      {criatura.cartaId !== null ? (
        <CartaImagem cartaId={criatura.cartaId} stats={stats} />
      ) : (
        <div
          className="flex aspect-[63/88] w-full flex-col items-center justify-center rounded p-1 text-center text-[10px] font-bold"
          style={{ backgroundColor: `#${(criatura.ficha?.color ?? 0x4b2a68).toString(16).padStart(6, '0')}` }}
        >
          {criatura.ficha?.nome}
        </div>
      )}
      {(precisaDoBadge || criatura.cartaId === null) && (
        <span
          className={`absolute bottom-0 left-0 rounded-tr bg-slate-950/85 px-1 text-xs font-bold ${
            ferida ? 'text-red-400' : 'text-slate-100'
          }`}
        >
          {stats.attack}/{stats.defense}
        </span>
      )}
      {criatura.anexos.length > 0 && (
        <span className="absolute right-0 top-0 rounded-bl bg-sky-900/90 px-1 text-[10px] font-bold">
          +{criatura.anexos.length}
        </span>
      )}
      {criatura.elementoAlterado && (
        <span className="absolute left-0 top-0 rounded-br bg-violet-900/90 px-1 text-[10px]">
          {criatura.elementoAlterado}
        </span>
      )}
    </button>
  );
}
