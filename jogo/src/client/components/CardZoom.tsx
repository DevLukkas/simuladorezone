import { useEffect, useState } from 'react';
import { cardById } from '../../data/cards.ts';
import type { CreatureInPlay } from '../../engine/state.ts';
import { useCardZoomStore } from '../stores/cardZoomStore.ts';
import { useMatchStore } from '../stores/matchStore.ts';
import { artPath } from './Card.tsx';
import { CardFacts, InPlayFacts } from './CardFacts.tsx';
import { collectionCode, ComposedCard } from './ComposedCard.tsx';
import { useTranslation } from '../useTranslation.ts';

/**
 * A carta ampliada, no console (decisão nº 31): a carta grande à esquerda e a
 * ficha à direita — a MESMA ficha do painel da coleção (`CardFacts`), para o
 * jogador ler os mesmos cinco dados no mesmo lugar nas duas telas.
 *
 * É o que o clique direito abre em qualquer carta do jogo, e no tabuleiro é o
 * único caminho para ler o texto de regras: em campo a carta tem 120px e o
 * impresso não se lê.
 *
 * Ampliando uma criatura DO TABULEIRO a ficha ganha duas abas (decisão nº 36):
 * "Impressa" é o que está escrito na carta, "Em campo" é o que vale para aquela
 * cópia — números vigentes, anexos e restrições. A carta grande não muda de aba
 * nenhuma; ela é sempre a impressa, com os números do motor.
 */
export function CardZoom() {
  const { cardId, onField, close } = useCardZoomStore();
  const view = useMatchStore((state) => state.view);
  const { t, cardName } = useTranslation();
  const [tab, setTab] = useState<'printed' | 'inPlay'>('inPlay');

  useEffect(() => {
    if (cardId === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cardId, close]);

  /* carta nova ampliada volta para a aba de campo, que é a mais específica */
  useEffect(() => setTab('inPlay'), [cardId, onField]);

  if (cardId === null) return null;
  const card = cardById(cardId);

  /*
    A criatura sai da visão de AGORA, não de uma cópia guardada no clique: se ela
    morreu (ou trocou de dono da coluna) enquanto a janela estava aberta, a aba
    simplesmente deixa de existir em vez de mostrar um retrato velho.
  */
  const side = onField && view ? (onField.owner === 'me' ? view.me : view.opponent) : null;
  const creature: CreatureInPlay | null =
    side && side.field[onField!.slot]?.uid === onField!.uid ? side.field[onField!.slot]! : null;
  const showInPlay = creature !== null && tab === 'inPlay';

  return (
    <div
      className="zn-backdrop z-90 cursor-zoom-out"
      onClick={close}
      onContextMenu={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="flex max-h-full flex-wrap items-center justify-center gap-6 overflow-auto">
        <div
          className="aspect-[415/555] h-[min(84vh,660px)] shrink-0 border border-zn-edge-hi"
          style={{ animation: 'zn-card-in .4s cubic-bezier(.2,.9,.3,1.2) both' }}
        >
          <ComposedCard card={card} art={artPath(card)} />
        </div>

        <aside
          className="zn-dialog zn-notch w-[min(360px,92vw)] cursor-default p-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2.5">
            <span className="zn-label tracking-[0.26em] uppercase">
              {t('collection.cardCode', { code: collectionCode(card) })}
            </span>
            <button
              type="button"
              onClick={close}
              className="zn-btn zn-btn-quiet zn-btn-undo h-6.5 w-6.5 text-[12px]"
            >
              ×
            </button>
          </div>

          <h2 className="zn-head mt-3 text-[24px] leading-tight tracking-[0.06em]">
            {cardName(card.id)}
          </h2>

          {creature && (
            <div className="mt-3 flex gap-2">
              <TabButton
                label={t('card.tabInPlay')}
                active={showInPlay}
                onClick={() => setTab('inPlay')}
              />
              <TabButton
                label={t('card.tabPrinted')}
                active={!showInPlay}
                onClick={() => setTab('printed')}
              />
            </div>
          )}

          <div className="mt-3.5">
            {showInPlay && creature && side ? (
              <InPlayFacts creature={creature} field={side.field} turn={view!.turn} />
            ) : (
              <CardFacts card={card} />
            )}
          </div>

          <p className="zn-num mt-4 text-[9px] uppercase tracking-[0.16em] text-zn-ghost">
            {t('card.closeHint')}
          </p>
        </aside>
      </div>
    </div>
  );
}

/** aba da ficha: a ativa em ouro, a outra em fio apagado */
function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`zn-btn h-7 px-3 text-[9px] uppercase tracking-[0.16em] ${
        active ? 'zn-btn-gold' : 'zn-btn-quiet'
      }`}
    >
      {label}
    </button>
  );
}
