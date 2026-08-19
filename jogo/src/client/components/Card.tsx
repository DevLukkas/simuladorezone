import { cardById } from '../../data/cards.ts';
import type { Card } from '../../data/types.ts';
import type { CreatureInPlay } from '../../engine/state.ts';
import { currentStats } from '../../engine/stats.ts';
import { useCardZoomStore } from '../stores/cardZoomStore.ts';
import { ComposedCard, type DisplayStats } from './ComposedCard.tsx';
import { useTranslation } from '../useTranslation.ts';

/**
 * Ilustração da carta composta, das duas procedências: no Quatro Elementos ela vem do
 * Figma e o catálogo aponta o arquivo em `art`; no clássico é o recorte da carta
 * impressa, com o mesmo nome de `img` (ver scripts/art4e.ts e scripts/art.ts).
 */
export function artPath(card: Card): string | undefined {
  const file = card.art ?? card.img?.replace(/\.png$/, '.webp');
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
}: {
  cardId: number;
  className?: string;
  title?: string;
  /** stats vigentes; ausente = os impressos na carta */
  stats?: DisplayStats;
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
        zoom(cardId);
      }}
    />
  );
}

export function CreatureOnField({
  creature,
  field,
  selected,
  className,
  onClick,
}: {
  creature: CreatureInPlay;
  field: readonly (CreatureInPlay | null)[];
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
      className={`relative block transition-transform hover:scale-105 ${
        className ?? 'w-full'
      } ${selected ? 'rounded ring-2 ring-ez-gold-light' : ''}`}
    >
      {creature.cardId !== null ? (
        <CardImage cardId={creature.cardId} stats={stats} className="h-full w-auto" />
      ) : (
        <div
          className="flex aspect-[415/555] h-full flex-col items-center justify-center rounded p-1 text-center text-[10px] font-bold"
          style={{ backgroundColor: `#${(creature.token?.color ?? 0x4b2a68).toString(16).padStart(6, '0')}` }}
        >
          {creature.token ? tokenName(creature.token.id) : null}
        </div>
      )}
      {/* a ficha não tem carta composta para imprimir os números vigentes */}
      {creature.cardId === null && (
        <span
          className={`absolute bottom-0 left-0 rounded-tr bg-ez-ink/85 px-1 text-xs font-bold ${
            wounded ? 'text-ez-blood-light' : 'text-ez-text'
          }`}
        >
          {stats.attack}/{stats.defense}
        </span>
      )}
      {creature.changedElement && (
        <span className="absolute left-0 top-0 rounded-br bg-[#33175e]/90 px-1 text-[10px] text-[#d6c6f5]">
          {t(`element.${creature.changedElement}`)}
        </span>
      )}
    </button>
  );
}
