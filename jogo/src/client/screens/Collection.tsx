import { useState } from 'react';
import { ALL_CARDS, cardById, formatOfCard } from '../../data/cards.ts';
import { MAX_COPIES, MAX_DECK_CARDS } from '../../data/deckRules.ts';
import type { Card } from '../../data/types.ts';
import { CardImage } from '../components/Card.tsx';
import { collectionCode } from '../components/ComposedCard.tsx';
import { FilterBar, INITIAL_FILTER, filterCards } from '../components/CardFilters.tsx';
import { useDecksStore, activeDeckOf } from '../stores/decksStore.ts';
import { useToastStore } from '../stores/toastStore.ts';
import { ELEMENT_COLOR, RARITY_COLOR, ZN } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * A coleção: a base inteira à esquerda, a ficha da carta escolhida à direita.
 *
 * A ficha é a única tela em que o texto de regras aparece em corpo de leitura —
 * na carta ele é impresso pequeno, para caber no molde. Ela também é o atalho
 * para pôr a carta no baralho ATIVO sem passar pelo construtor: o ± aqui grava
 * na hora (o construtor tem rascunho; esta tela não, e prometer que "guarda
 * depois" seria mentira).
 */
export function Collection() {
  const { t, cardName, cardRulesText } = useTranslation();
  const [filter, setFilter] = useState(INITIAL_FILTER);
  const [chosen, setChosen] = useState<number | null>(null);
  const deck = useDecksStore(activeDeckOf);
  const { save } = useDecksStore();
  const toast = useToastStore((state) => state.show);
  const cards = filterCards(ALL_CARDS, filter);
  const card = chosen === null ? null : cardById(chosen);

  /** grava a cópia direto no baralho ativo; sem ativo, não há onde pôr */
  async function adjust(cardId: number, delta: number) {
    if (!deck) return;
    const amount = deck.cards[cardId] ?? 0;
    const total = Object.values(deck.cards).reduce((sum, value) => sum + value, 0);
    if (delta > 0 && total >= MAX_DECK_CARDS) {
      toast(t('decks.limitReached', { max: MAX_DECK_CARDS }));
      return;
    }
    if (delta > 0 && amount >= MAX_COPIES) {
      toast(t('decks.copyLimit', { max: MAX_COPIES }));
      return;
    }
    if (delta < 0 && amount === 0) return;
    const next = { ...deck.cards };
    if (amount + delta <= 0) delete next[cardId];
    else next[cardId] = amount + delta;
    await save({ ...deck, cards: next });
  }

  return (
    <div className="zn-split flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <FilterBar value={filter} onChange={setFilter} elements={false}>
          <span className="zn-num text-[10px] uppercase tracking-[0.16em] text-zn-fainter">
            {t('collection.count', { count: cards.length, total: ALL_CARDS.length })}
          </span>
        </FilterBar>

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-6.5 pt-4.5">
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(176px,1fr))]">
            {cards.map((entry) => (
              <CollectionTile
                key={entry.id}
                card={entry}
                copies={deck?.cards[entry.id] ?? 0}
                chosen={entry.id === chosen}
                onOpen={() => setChosen(entry.id)}
              />
            ))}
          </div>
          {cards.length === 0 && (
            <p className="zn-num mt-7 text-center text-[11px] uppercase tracking-[0.14em] text-zn-ghost">
              {t('collection.empty')}
            </p>
          )}
        </div>
      </div>

      {card && (
        <aside
          className="w-97.5 flex-none overflow-auto border-l border-zn-line bg-zn-bar p-4.5"
          style={{ animation: 'zn-fade .18s ease both' }}
        >
          <div className="flex items-center justify-between gap-2.5">
            <span className="zn-label tracking-[0.26em] uppercase">
              {t('collection.cardCode', { code: collectionCode(card) })}
            </span>
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="zn-btn zn-btn-quiet zn-btn-undo h-6.5 w-6.5 text-[12px]"
            >
              ×
            </button>
          </div>

          <div className="mt-3.5 border border-zn-edge bg-zn-ink">
            <CardImage cardId={card.id} className="w-full" />
          </div>

          <h2 className="zn-head mt-4 text-[24px] leading-tight tracking-[0.06em]">
            {cardName(card.id)}
          </h2>

          <div className="zn-hair mt-3.5 grid-cols-2">
            <Fact label={t('collection.fact.type')} value={t(`cardType.${card.type}`)} />
            <Fact
              label={t('collection.fact.element')}
              value={t(`element.${card.element}`)}
              color={ELEMENT_COLOR[card.element]}
            />
            <Fact
              label={t('collection.fact.rarity')}
              value={t(`rarity.${card.rarity}`)}
              color={RARITY_COLOR[card.rarity]}
            />
            {card.type === 'creature' ? (
              <Fact
                label={t('collection.fact.stats')}
                value={`${card.attack} / ${card.health}`}
              />
            ) : (
              <Fact
                label={t('collection.fact.edition')}
                value={t(`edition.${card.edition}`)}
              />
            )}
          </div>

          <p className="mt-3.5 whitespace-pre-line text-[13px] leading-relaxed text-zn-dim">
            {cardRulesText(card.id) ?? t('card.noText')}
          </p>

          <DeckActions
            card={card}
            copies={deck?.cards[card.id] ?? 0}
            legal={Boolean(deck) && formatOfCard(card) === (deck?.format ?? 'classic')}
            onAdd={() => void adjust(card.id, 1)}
            onRemove={() => void adjust(card.id, -1)}
          />
        </aside>
      )}
    </div>
  );
}

/**
 * A carta na grade. A faixa de baixo do desenho trazia tipo e raridade, mas a
 * carta composta já os imprime (a mesma razão que tirou a gema de elemento na
 * decisão nº 26) — sobrou dela o que a carta NÃO sabe: quantas cópias desta já
 * estão no baralho ativo.
 *
 * Com uma informação só, a faixa encolheu para o canto: em largura inteira ela
 * tapava o rodapé impresso da carta (código de coleção e crédito da arte), e
 * cobrir o que a carta diz para escrever o que ela não diz seria trocar seis
 * por meia dúzia.
 */
function CollectionTile({
  card,
  copies,
  chosen,
  onOpen,
}: {
  card: Card;
  copies: number;
  chosen: boolean;
  onOpen: () => void;
}) {
  const { t, cardName } = useTranslation();

  return (
    <button
      type="button"
      onClick={onOpen}
      title={cardName(card.id)}
      className="zn-tile relative block cursor-pointer bg-zn-ink p-0"
      style={{ ['--tile-line' as string]: chosen ? ZN.gold : ZN.line }}
    >
      <CardImage cardId={card.id} className="w-full" />
      {copies > 0 && (
        <span
          className="zn-num absolute bottom-0 right-0 px-2 py-1.5 text-[9px] uppercase tracking-[0.1em] text-zn-muted"
          style={{
            background: 'rgba(8,9,11,.92)',
            borderTop: `1px solid ${ELEMENT_COLOR[card.element]}`,
            borderLeft: `1px solid ${ELEMENT_COLOR[card.element]}`,
          }}
        >
          {t('collection.inDeck', { count: copies })}
        </span>
      )}
    </button>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-2.5">
      <span className="zn-num text-[9px] uppercase tracking-[0.2em] text-zn-faint">{label}</span>
      <span className="zn-num text-[13px] font-bold" style={{ color: color ?? '#e6e2d8' }}>
        {value}
      </span>
    </div>
  );
}

function DeckActions({
  card,
  copies,
  legal,
  onAdd,
  onRemove,
}: {
  card: Card;
  copies: number;
  /** há baralho ativo E a carta é do formato dele */
  legal: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();

  if (!legal) {
    return (
      <p className="zn-num mt-4 text-[10px] uppercase tracking-[0.14em] text-zn-ghost">
        {t('collection.otherFormat')} · {t(`format.${formatOfCard(card)}`)}
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-1.5 [grid-template-columns:1fr_32px]">
      <button type="button" onClick={onAdd} className="zn-btn zn-btn-wire h-9.5 uppercase">
        {copies ? t('decks.inDeck', { count: copies }) : t('collection.addToDeck')}
      </button>
      <button
        type="button"
        disabled={copies === 0}
        title={t('decks.removeOne')}
        onClick={onRemove}
        className="zn-btn zn-btn-quiet zn-btn-undo h-9.5 text-[13px]"
      >
        −
      </button>
    </div>
  );
}
