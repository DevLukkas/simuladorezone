import { useEffect, useRef, useState } from 'react';
import { cardById, cardExists, cardsOfFormat, formatOfCard } from '../../data/cards.ts';
import { starterDecks } from '../../data/starterDecks.ts';
import { heroes } from '../../data/heroes.ts';
import { MAX_DECK_CARDS, MAX_COPIES, validateDeck } from '../../data/deckRules.ts';
import { CARD_TYPES, FORMATS, type Format } from '../../data/types.ts';
import type { TextKey } from '../../i18n/keys.ts';
import type { TextRef } from '../../shared/text.ts';
import { CardImage } from '../components/Card.tsx';
import { FilterBar, INITIAL_FILTER, filterCards } from '../components/CardFilters.tsx';
import { HeroPortrait } from '../components/HeroPortrait.tsx';
import { ScreenHeader } from '../components/ScreenHeader.tsx';
import { useCardZoomStore } from '../stores/cardZoomStore.ts';
import { useDecksStore, type SavedDeck } from '../stores/decksStore.ts';
import { ELEMENT_COLOR, rarityHalo } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

export function Decks({ onBack }: { onBack: () => void }) {
  const { decks, loaded, error, load, save, remove } = useDecksStore();
  const { t, resolve } = useTranslation();
  const [editing, setEditing] = useState<(Omit<SavedDeck, 'id'> & { id?: number }) | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  if (editing) {
    return (
      <DeckEditor
        initial={editing}
        onSave={async (deck) => {
          const saved = await save(deck);
          if (saved) setEditing(null);
        }}
        onCancel={() => setEditing(null)}
        serverError={error}
      />
    );
  }

  return (
    <main className="ez-page px-[clamp(18px,4vw,56px)] pb-16 pt-8">
      <ScreenHeader title={t('decks.title')} onBack={onBack}>
        <button
          type="button"
          className="ez-btn ez-btn-gold ez-btn-sm"
          onClick={() =>
            setEditing({ name: t('decks.newDeckName'), hero: 'badur', cards: {}, format: 'classic' })
          }
        >
          {t('decks.new')}
        </button>
      </ScreenHeader>

      {!loaded && <p className="text-ez-muted">{t('common.loading')}</p>}
      {error && <p className="text-ez-gold-light">{resolve(error)}</p>}

      <ul className="flex max-w-4xl flex-col gap-3.5">
        {decks.map((deck) => {
          const total = Object.values(deck.cards).reduce((sum, amount) => sum + amount, 0);
          return (
            <li
              key={deck.id}
              className="ez-panel ez-panel-hover flex flex-wrap items-center gap-4 px-4.5 py-3.5"
            >
              <HeroPortrait hero={deck.hero} size={52} />
              <div className="flex min-w-40 flex-1 flex-col gap-0.5">
                <span className="ez-heading text-[17px]">{deck.name}</span>
                <span className="text-[13px] text-ez-muted">
                  {t('decks.hero', { hero: t(`hero.${deck.hero}.name` as TextKey) })} ·{' '}
                  {t('decks.cardCount', { count: total })} ·{' '}
                  {/* o formato manda em que cartas o deck pode ter: aparece na linha, não só no editor */}
                  {t(`format.${deck.format ?? 'classic'}`)}
                </span>
              </div>
              <button
                type="button"
                className="ez-btn ez-btn-blue ez-btn-sm"
                onClick={() => setEditing(deck)}
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                className="ez-btn ez-btn-danger ez-btn-sm"
                onClick={() => void remove(deck.id)}
              >
                {t('common.remove')}
              </button>
            </li>
          );
        })}
      </ul>
      {loaded && decks.length === 0 && <p className="mt-5 text-ez-muted">{t('decks.emptyList')}</p>}
    </main>
  );
}

function DeckEditor({
  initial,
  onSave,
  onCancel,
  serverError,
}: {
  initial: Omit<SavedDeck, 'id'> & { id?: number };
  onSave: (deck: Omit<SavedDeck, 'id'> & { id?: number }) => Promise<void>;
  onCancel: () => void;
  serverError: TextRef | null;
}) {
  const { t, resolve } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [hero, setHero] = useState(initial.hero);
  const [cards, setCards] = useState<Record<number, number>>({ ...initial.cards });
  /** ausente = deck gravado antes do segundo formato existir (ver deckRules) */
  const [format, setFormat] = useState<Format>(initial.format ?? 'classic');
  const [filter, setFilter] = useState(INITIAL_FILTER);
  /**
   * A barra do deck quebra em duas linhas em janela estreita (o nome do deck manda),
   * e o painel do lado gruda logo abaixo dela: a altura é MEDIDA, senão o painel some
   * por baixo da barra ao rolar em 1280 de largura.
   */
  const toolbar = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(64);

  useEffect(() => {
    const element = toolbar.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setToolbarHeight(element.offsetHeight));
    observer.observe(element);
    setToolbarHeight(element.offsetHeight);
    return () => observer.disconnect();
  }, []);

  const total = Object.values(cards).reduce((sum, amount) => sum + amount, 0);
  const problems = validateDeck({ name, hero, cards, format });
  /**
   * A grade oferece SÓ o formato do deck: formatos não se misturam (decisão nº 11)
   * e antes disto a tela deixava juntar as duas edições e só reclamava no botão
   * gravar, com o deck já montado.
   */
  const visibleCards = filterCards(cardsOfFormat(format), filter);
  const formatStarters = starterDecks.filter((starter) => starter.format === format);

  function adjust(cardId: number, delta: number) {
    setCards((current) => {
      const currentTotal = Object.values(current).reduce((sum, amount) => sum + amount, 0);
      if (delta > 0 && currentTotal >= MAX_DECK_CARDS) return current;
      const amount = (current[cardId] ?? 0) + delta;
      const next = { ...current };
      if (amount <= 0) delete next[cardId];
      else next[cardId] = Math.min(amount, MAX_COPIES);
      return next;
    });
  }

  /** trocar de formato tira o que o formato novo não conhece — com aviso, que é trabalho perdido */
  function changeFormat(next: Format) {
    if (next === format) return;
    const illegal = Object.keys(cards)
      .map(Number)
      .filter((id) => !cardExists(id) || formatOfCard(cardById(id)) !== next);
    if (illegal.length > 0) {
      const confirmed = window.confirm(
        t('decks.switchFormat', { format: t(`format.${next}`), count: illegal.length }),
      );
      if (!confirmed) return;
      setCards((current) => {
        const kept = { ...current };
        for (const id of illegal) delete kept[id];
        return kept;
      });
    }
    setFormat(next);
  }

  function loadStarterDeck(key: string) {
    const starter = starterDecks.find((deck) => deck.key === key);
    if (!starter) return;
    const starterName = t(`starterDeck.${starter.key}` as TextKey);
    if (total > 0 && !window.confirm(t('decks.replaceConfirm', { deck: starterName }))) {
      return;
    }
    setName(starterName);
    setHero(starter.hero);
    setFormat(starter.format);
    setCards({ ...starter.cards });
  }

  return (
    <main className="ez-page px-[clamp(18px,4vw,56px)] pb-16 pt-2">
      {/* a barra do deck acompanha a rolagem: o contador /40 é a razão de estar aqui */}
      <div
        ref={toolbar}
        className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-ez-line-soft bg-ez-ink/92 py-3 backdrop-blur-md"
      >
        <button type="button" className="ez-btn ez-btn-ghost ez-btn-sm" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <HeroPortrait hero={hero} size={40} />
        <input
          className="ez-input ez-input-sm min-w-45 font-bold"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          className="ez-select ez-select-sm"
          value={hero}
          onChange={(event) => setHero(event.target.value)}
        >
          {heroes.map((option) => (
            <option key={option.key} value={option.key}>
              {t(`hero.${option.key}.name` as TextKey)} —{' '}
              {t(`hero.${option.key}.effectName` as TextKey)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ez-dim">{t('decks.format')}</span>
          {FORMATS.map((option) => (
            <button
              key={option}
              type="button"
              className={`ez-chip ${format === option ? 'ez-chip-on' : ''}`}
              onClick={() => changeFormat(option)}
            >
              {t(`format.${option}`)}
            </button>
          ))}
        </div>
        {formatStarters.length > 0 && (
          <select
            className="ez-select ez-select-sm"
            value=""
            onChange={(event) => loadStarterDeck(event.target.value)}
          >
            <option value="" disabled>
              {t('decks.loadStarter')}
            </option>
            {formatStarters.map((starter) => (
              <option key={starter.key} value={starter.key}>
                {t(`starterDeck.${starter.key}` as TextKey)} ({t(`element.${starter.element}`)})
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2.5">
          <span
            className={`ez-heading rounded-[10px] border bg-ez-field px-3.5 py-2 text-base tabular-nums ${
              total > MAX_DECK_CARDS
                ? 'border-ez-blood text-ez-blood-light'
                : 'border-[#6b4d12] text-ez-gold-light'
            }`}
            style={{ boxShadow: 'inset 0 0 12px rgba(201,153,46,.15)' }}
          >
            {total}/{MAX_DECK_CARDS}
          </span>
          <button
            type="button"
            disabled={problems.length > 0}
            className="ez-btn ez-btn-gold ez-btn-sm"
            onClick={() => {
              const deck: Omit<SavedDeck, 'id'> & { id?: number } = { name, hero, cards, format };
              if (initial.id !== undefined) deck.id = initial.id;
              void onSave(deck);
            }}
          >
            {t('common.save')}
          </button>
        </div>
      </div>

      <p className="my-3.5 text-sm text-[#d9a940]">
        {problems.length > 0 && <span>{problems.map(resolve).join(' ')} </span>}
        {serverError && <span className="text-ez-blood-light">{resolve(serverError)} </span>}
        <span className="text-ez-dim">{t('decks.editorHint')}</span>
      </p>

      {/* grade à esquerda, deck à direita: a grade diz o que existe, o painel o que já entrou */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <DeckContents
          cards={cards}
          total={total}
          onAdjust={adjust}
          stickyTop={toolbarHeight + 10}
        />

        <div className="lg:col-start-1 lg:row-start-1">
          <FilterBar value={filter} onChange={setFilter} />

          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-5">
            {visibleCards.map((card) => {
              const amount = cards[card.id] ?? 0;
              return (
                <div key={card.id} className="flex flex-col gap-2">
                  <button
                    type="button"
                    className={`ez-card-tile relative block w-full cursor-pointer ${
                      amount ? '' : 'opacity-60'
                    }`}
                    onClick={() => adjust(card.id, 1)}
                    style={{ ['--halo' as string]: rarityHalo(card.rarity) }}
                  >
                    <CardImage cardId={card.id} className="w-full" />
                    {amount > 0 && (
                      <span
                        className="ez-heading absolute -left-2 -top-2 flex h-7.5 w-7.5 items-center justify-center rounded-full text-sm text-[#221503]"
                        style={{
                          background:
                            'radial-gradient(circle at 35% 30%, #f8e3a4, #cb9c31 60%, #7a5514)',
                          border: '1px solid #f6dd9a',
                          boxShadow: '0 4px 10px rgba(0,0,0,.5)',
                        }}
                      >
                        {amount}
                      </span>
                    )}
                  </button>
                  <div className="grid grid-cols-[34px_1fr_34px] items-center gap-1.5">
                    <button
                      type="button"
                      className="ez-btn ez-btn-ghost rounded-lg px-0 py-1 leading-none"
                      disabled={!amount}
                      onClick={() => adjust(card.id, -1)}
                    >
                      −
                    </button>
                    <span
                      className={`text-center text-[13px] tabular-nums ${
                        amount ? 'font-bold text-ez-gold-light' : 'text-ez-muted'
                      }`}
                    >
                      {amount}/{MAX_COPIES}
                    </span>
                    <button
                      type="button"
                      className="ez-btn ez-btn-ghost rounded-lg px-0 py-1 leading-none"
                      disabled={amount >= MAX_COPIES || total >= MAX_DECK_CARDS}
                      onClick={() => adjust(card.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {visibleCards.length === 0 && (
            <p className="mt-8 text-center text-ez-dim">{t('collection.empty')}</p>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * A lista do que já está no deck, ao lado da grade: por tipo, com as cópias de cada
 * carta. Sem ela a única pista da quantidade era o número no canto da carta lá na
 * grade, e conferir um deck de 40 exigia rolar o catálogo inteiro procurando.
 *
 * Clicar na linha AMPLIA a carta (é o gesto da coleção); tirar e pôr cópia são os
 * dois botões da direita.
 */
function DeckContents({
  cards,
  total,
  onAdjust,
  stickyTop,
}: {
  cards: Record<number, number>;
  total: number;
  onAdjust: (cardId: number, delta: number) => void;
  /** onde o painel gruda: logo abaixo da barra do deck, que muda de altura ao quebrar */
  stickyTop: number;
}) {
  const { t, cardName } = useTranslation();
  const zoom = useCardZoomStore((state) => state.zoom);

  // carta apagada no estúdio some da lista; quem reclama dela é a validação
  const inDeck = Object.entries(cards)
    .map(([id, amount]) => ({ id: Number(id), amount }))
    .filter((entry) => cardExists(entry.id))
    .map((entry) => ({ card: cardById(entry.id), amount: entry.amount }))
    .sort((a, b) => a.card.id - b.card.id);

  return (
    <aside
      className="ez-panel flex max-h-[45vh] flex-col overflow-hidden lg:sticky lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh_-_var(--deck-top)_-_24px)] lg:top-[var(--deck-top)]"
      style={{ ['--deck-top' as string]: `${stickyTop}px` }}
    >
      <header className="flex items-baseline justify-between border-b border-ez-line-soft px-3.5 py-2.5">
        <span className="ez-heading text-sm">{t('decks.inDeck')}</span>
        <span className="text-[13px] tabular-nums text-ez-muted">
          {total}/{MAX_DECK_CARDS}
        </span>
      </header>

      {inDeck.length === 0 ? (
        <p className="px-3.5 py-4 text-[13px] text-ez-dim">{t('decks.emptyDeck')}</p>
      ) : (
        <div className="overflow-y-auto px-2 py-2">
          {CARD_TYPES.map((type) => {
            const rows = inDeck.filter((entry) => entry.card.type === type);
            if (rows.length === 0) return null;
            const copies = rows.reduce((sum, entry) => sum + entry.amount, 0);
            return (
              <section key={type}>
                <h3 className="flex items-baseline justify-between px-1.5 pb-0.5 pt-1.5 text-[11px] uppercase tracking-wider text-ez-dim">
                  <span>{t(`cardType.${type}`)}</span>
                  <span className="tabular-nums">{copies}</span>
                </h3>
                <ul>
                  {rows.map(({ card, amount }) => (
                    <li
                      key={card.id}
                      className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 hover:bg-ez-field"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-left"
                        onClick={() => zoom(card.id)}
                      >
                        <span className="ez-heading w-6 shrink-0 text-right text-[13px] tabular-nums text-ez-gold-light">
                          {amount}×
                        </span>
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background: ELEMENT_COLOR[card.element],
                            boxShadow: `0 0 6px ${ELEMENT_COLOR[card.element]}`,
                          }}
                        />
                        <span className="truncate text-[13px] text-ez-text">
                          {cardName(card.id)}
                        </span>
                      </button>
                      <button
                        type="button"
                        title={t('decks.removeOne')}
                        className="ez-btn ez-btn-ghost shrink-0 rounded-md px-1.5 py-0.5 text-xs leading-none"
                        onClick={() => onAdjust(card.id, -1)}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        title={t('decks.addOne')}
                        disabled={amount >= MAX_COPIES || total >= MAX_DECK_CARDS}
                        className="ez-btn ez-btn-ghost shrink-0 rounded-md px-1.5 py-0.5 text-xs leading-none"
                        onClick={() => onAdjust(card.id, 1)}
                      >
                        +
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}
