import { cardById } from '../../data/cards.ts';
import type { Card } from '../../data/types.ts';
import type { CreatureInPlay } from '../../engine/state.ts';
import { currentStats } from '../../engine/stats.ts';
import { useCardZoomStore, type ZoomedOnField } from '../stores/cardZoomStore.ts';
import { ZN } from '../theme.ts';
import { ComposedCard, type DisplayStats } from './ComposedCard.tsx';
import { useTranslation } from '../useTranslation.ts';

/**
 * Ilustração da carta composta, das duas procedências: no Quatro Elementos ela vem do
 * Figma e o catálogo aponta o arquivo em `art`; no clássico é o recorte da carta
 * impressa, com o mesmo nome de `img` (ver scripts/art4e.ts e scripts/art.ts).
 */
export function artFileOf(card: Card): string | undefined {
  return card.art ?? card.img?.replace(/\.png$/, '.webp');
}

export function artPath(card: Card): string | undefined {
  const file = artFileOf(card);
  return file ? `/assets/arte/${file}` : undefined;
}

/**
 * TODA carta na tela é a composta, montada em runtime (decisão nº 23): os números
 * impressos no PNG não acompanham buff, dano nem marcador, o texto não sai traduzido
 * e as 33 do Quatro Elementos nunca foram impressas. A arte finalizada em
 * `/assets/cards` sobrevive só como fonte do recorte da ilustração.
 */
export function CardImage({
  cardId,
  className,
  title,
  stats,
  onField,
}: {
  cardId: number;
  className?: string;
  title?: string;
  /** stats vigentes; ausente = os impressos na carta */
  stats?: DisplayStats;
  /** de onde esta cópia está no tabuleiro: dá a aba "em campo" ao ampliar */
  onField?: ZoomedOnField;
}) {
  const card = cardById(cardId);
  const zoom = useCardZoomStore((state) => state.zoom);

  return (
    <ComposedCard
      card={card}
      art={artPath(card)}
      stats={stats}
      className={className ?? 'w-full'}
      title={title}
      onContextMenu={(event) => {
        event.preventDefault();
        zoom(cardId, onField);
      }}
    />
  );
}

export function CreatureOnField({
  creature,
  field,
  owner,
  slot,
  selected,
  className,
  onClick,
}: {
  creature: CreatureInPlay;
  field: readonly (CreatureInPlay | null)[];
  /** de quem é a fileira e em que coluna está — o clique direito leva junto */
  owner: 'me' | 'opponent';
  slot: number;
  selected?: boolean;
  /** o tabuleiro dimensiona pela ALTURA da fileira; a carta segue a proporção */
  className?: string;
  onClick?: () => void;
}) {
  const stats = currentStats(creature, field);
  const wounded = creature.damage > 0;
  const { t, tokenName } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative block cursor-pointer ${className ?? 'w-full'}`}
      style={selected ? { boxShadow: `0 0 0 2px ${ZN.gold}` } : undefined}
    >
      {creature.cardId !== null ? (
        <CardImage
          cardId={creature.cardId}
          stats={stats}
          className="h-full w-full"
          onField={{ owner, slot, uid: creature.uid }}
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center p-1 text-center text-[10px] font-bold"
          style={{ backgroundColor: `#${(creature.token?.color ?? 0x4b2a68).toString(16).padStart(6, '0')}` }}
        >
          {creature.token ? tokenName(creature.token.id) : null}
        </div>
      )}
      {/* a ficha não tem carta composta para imprimir os números vigentes */}
      {creature.cardId === null && (
        <span
          className="zn-num absolute bottom-0 left-0 bg-zn-ink/85 px-1 text-[11px] font-bold"
          style={{ color: wounded ? ZN.redLight : ZN.greenLight }}
        >
          {stats.attack}/{stats.defense}
        </span>
      )}
      {/* o elemento TROCADO por efeito: a carta composta imprime o de fábrica */}
      {creature.changedElement && (
        <span
          className="zn-num absolute bottom-0 right-0 px-1 text-[9px] uppercase tracking-[0.08em]"
          style={{ background: 'rgba(20,10,34,.92)', color: '#d6bcff' }}
        >
          {t(`element.${creature.changedElement}`)}
        </span>
      )}
    </button>
  );
}
