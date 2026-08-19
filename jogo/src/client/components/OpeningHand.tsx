import { useCallback, useEffect, useState } from 'react';
import type { Card } from '../../data/types.ts';
import { STARTING_HAND } from '../../engine/state.ts';
import { CardImage } from './Card.tsx';
import { ConsoleModal } from './ConsoleModal.tsx';
import { ELEMENT_COLOR, ZN } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * A mão inicial simulada do construtor: cinco cartas sorteadas do rascunho.
 *
 * É brincadeira de MONTAGEM, não partida — por isso o `Math.random` daqui não
 * fere o invariante 1, que vale para `src/engine`. O que ela responde é a única
 * pergunta que um baralho de 40 não responde sozinho: "abro com o quê?".
 */
export function OpeningHand({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  const { t, cardName } = useTranslation();
  const [hand, setHand] = useState<Card[]>([]);

  const draw = useCallback(() => {
    const pool = [...cards];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    setHand(pool.slice(0, STARTING_HAND));
  }, [cards]);

  useEffect(draw, [draw]);

  const enough = cards.length >= STARTING_HAND;
  const creatures = hand.filter((card) => card.type === 'creature').length;

  return (
    <ConsoleModal
      title={t('decks.handTitle')}
      note={t('decks.handNote', { count: STARTING_HAND, total: cards.length })}
      width={1000}
      onClose={onClose}
    >
      {enough ? (
        <>
          <div className="grid grid-cols-5 gap-3">
            {hand.map((card, position) => (
              <div
                key={`${card.id}-${position}`}
                className="bg-zn-ink"
                style={{
                  border: `1px solid ${ZN.edge}`,
                  borderTop: `2px solid ${ELEMENT_COLOR[card.element]}`,
                }}
              >
                <CardImage cardId={card.id} title={cardName(card.id)} className="w-full" />
              </div>
            ))}
          </div>

          <div className="mt-4.5 flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={draw} className="zn-btn zn-btn-wire px-5.5 uppercase">
              {t('decks.reshuffle')}
            </button>
            <span className="zn-num text-[10px] uppercase tracking-[0.12em] text-zn-faint">
              {t('decks.handCreatures', { count: creatures })} ·{' '}
              {creatures ? t('decks.handPlayable') : t('decks.handNoSummon')}
            </span>
          </div>
        </>
      ) : (
        <p className="zn-num text-[11px] uppercase tracking-[0.14em] text-zn-ghost">
          {t('decks.needCards', { count: STARTING_HAND })}
        </p>
      )}
    </ConsoleModal>
  );
}
