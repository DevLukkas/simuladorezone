import { useEffect } from 'react';
import { cardById } from '../../data/cards.ts';
import { useCardZoomStore } from '../stores/cardZoomStore.ts';
import { artPath } from './Card.tsx';
import { ComposedCard } from './ComposedCard.tsx';
import { ELEMENT_COLOR, RARITY_COLOR, rarityHalo } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

/** Modal de leitura: a carta em tamanho grande + os dados do catálogo ao lado. */
export function CardZoom() {
  const { cardId, close } = useCardZoomStore();
  const { t, cardName, cardRulesText } = useTranslation();

  useEffect(() => {
    if (cardId === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cardId, close]);

  if (cardId === null) return null;
  const card = cardById(cardId);
  const elementColor = ELEMENT_COLOR[card.element];
  const rarityColor = RARITY_COLOR[card.rarity];

  return (
    <div
      className="ez-backdrop fixed inset-0 z-[60] flex flex-wrap items-center justify-center gap-8 overflow-y-auto p-6"
      onClick={close}
      onContextMenu={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div
        className="aspect-[415/555] h-[85vh] shrink-0 rounded-2xl"
        style={{
          boxShadow: `0 40px 90px rgba(0,0,0,.8), 0 0 50px ${rarityHalo(card.rarity)}`,
          animation: 'ez-card-in .4s cubic-bezier(.2,.9,.3,1.2) both',
        }}
      >
        <ComposedCard card={card} art={artPath(card)} />
      </div>

      <div
        className="ez-panel w-[min(360px,88vw)] p-5.5 text-sm"
        style={{ animation: 'ez-fade-in .35s ease both' }}
      >
        <h2 className="ez-heading text-xl">{cardName(card.id)}</h2>
        <p className="mb-3 mt-3 flex flex-wrap gap-2">
          <span className="ez-pill">{t(`cardType.${card.type}`)}</span>
          <span className="ez-pill" style={{ borderColor: elementColor, color: elementColor }}>
            {t(`element.${card.element}`)}
          </span>
          <span className="ez-pill" style={{ borderColor: rarityColor, color: rarityColor }}>
            {t(`rarity.${card.rarity}`)}
          </span>
        </p>
        {card.type === 'creature' && (
          <p className="mb-3 text-ez-text">
            {t('card.stats', {
              race: t(`race.${card.race}`),
              attack: card.attack,
              health: card.health,
            })}
          </p>
        )}
        <p className="ez-rules whitespace-pre-line text-ez-text">
          {cardRulesText(card.id) ?? t('card.noText')}
        </p>
        <p className="mt-3 text-[13px] text-ez-dim">
          {t('card.footer', { edition: t(`edition.${card.edition}`), id: card.id })}
        </p>
        <p className="mt-1 text-xs text-ez-faint">{t('card.closeHint')}</p>
      </div>
    </div>
  );
}
