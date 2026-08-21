import { useEffect, useMemo, useState } from 'react';
import { PLAYABLE_CARDS, cardById, cardExists } from '../../data/cards.ts';
import { starterDecks } from '../../data/starterDecks.ts';
import { heroByKey } from '../../data/heroes.ts';
import { MAX_COPIES, MAX_DECK_CARDS, validateDeck } from '../../data/deckRules.ts';
import { CARD_TYPES, type Card } from '../../data/types.ts';
import type { TextKey } from '../../i18n/keys.ts';
import { CardImage } from '../components/Card.tsx';
import { FilterBar, INITIAL_FILTER, filterCards } from '../components/CardFilters.tsx';
import { HeroBadge } from '../components/HeroPortrait.tsx';
import { HeroEffect, HeroPicker } from '../components/HeroPicker.tsx';
import { OpeningHand } from '../components/OpeningHand.tsx';
import { useDecksStore, activeDeckOf, type SavedDeck } from '../stores/decksStore.ts';
import { useToastStore } from '../stores/toastStore.ts';
import { ELEMENT_COLOR, RARITY_COLOR, ZN, heroColor } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';
import { countByElement, expandDeck } from '../deckStats.ts';

type Draft = Omit<SavedDeck, 'id'> & { id?: number };

/** as duas leituras do painel: o que o baralho É e o que o baralho TEM */
type Tab = 'overview' | 'list';

/**
 * O construtor: catálogo à esquerda, baralho à direita.
 *
 * Ele edita um RASCUNHO do baralho ativo, não o baralho gravado — trocar de
 * baralho pela trilha recarrega o rascunho, e é o botão de gravar que fecha o
 * ciclo. Sem ativo (recém-criado pela gaveta), abre um rascunho vazio.
 *
 * O painel da direita é DE ABAS (decisão nº 42). Antes era uma pilha só, e a
 * lista de cartas herdava o vão que sobrasse dos blocos fixos — que em 40 cartas
 * é quase nada, e foi o "está bem espremida" do relato. Agora:
 *
 * - RESUMO é a leitura de montagem, na ordem em que se monta: carregar pronto,
 *   nome, herói, curva, mosaico e pendências — os NÚMEROS do baralho;
 * - CARTAS é a lista, com o painel inteiro para ela.
 *
 * A lista aparece numa aba só: repeti-la no fim do resumo devolvia o problema
 * que a divisão veio resolver — a aba do resumo voltava a ser uma pilha alta com
 * a lista espremida no fim dela.
 *
 * A barra de gravar fica FORA das abas, no rodapé do painel, que é o rodapé da
 * tela: ela não rola com o conteúdo nem depende de qual aba está aberta.
 */
export function DeckBuilder() {
  const { t } = useTranslation();
  const { activeId, save } = useDecksStore();
  const active = useDecksStore(activeDeckOf);
  const toast = useToastStore((state) => state.show);
  const [draft, setDraft] = useState<Draft>(() => blank(t('decks.newDeckName')));
  const [filter, setFilter] = useState(INITIAL_FILTER);
  const [pickingHero, setPickingHero] = useState(false);
  const [testingHand, setTestingHand] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  // trocar de baralho ativo (ou criar um novo pela gaveta) recarrega o rascunho
  useEffect(() => {
    setDraft(active ? { ...active, cards: { ...active.cards } } : blank(t('decks.newDeckName')));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o gatilho é o ativo, não o `t`
  }, [activeId, active]);

  const inDeck = useMemo(() => expandDeck(draft.cards), [draft.cards]);
  const total = inDeck.length;
  const pool = PLAYABLE_CARDS;
  const visible = filterCards(pool, filter);
  const problems = validateDeck(draft);

  function adjust(cardId: number, delta: number) {
    setDraft((current) => {
      const amount = current.cards[cardId] ?? 0;
      const count = Object.values(current.cards).reduce((sum, value) => sum + value, 0);
      if (delta > 0) {
        if (count >= MAX_DECK_CARDS) {
          toast(t('decks.limitReached', { max: MAX_DECK_CARDS }));
          return current;
        }
        if (amount >= MAX_COPIES) {
          toast(t('decks.copyLimit', { max: MAX_COPIES }));
          return current;
        }
      }
      if (delta < 0 && amount === 0) return current;
      const cards = { ...current.cards };
      if (amount + delta <= 0) delete cards[cardId];
      else cards[cardId] = amount + delta;
      return { ...current, cards };
    });
  }

  function loadStarter(key: string) {
    const starter = starterDecks.find((deck) => deck.key === key);
    if (!starter) return;
    const name = t(`starterDeck.${starter.key}` as TextKey);
    if (total > 0 && !window.confirm(t('decks.replaceConfirm', { deck: name }))) return;
    setDraft((current) => ({
      ...current,
      name,
      hero: starter.hero,
      cards: { ...starter.cards },
    }));
  }

  async function persist() {
    if (problems.length > 0) {
      toast(t('decks.fixFirst'));
      return;
    }
    const saved = await save(draft);
    if (saved) toast(t('decks.saved', { total, max: MAX_DECK_CARDS }));
  }

  return (
    <div className="zn-split flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <FilterBar value={filter} onChange={setFilter} pool={pool} />

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-6.5 pt-4.5">
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(158px,1fr))]">
            {visible.map((card) => (
              <CatalogCard
                key={card.id}
                card={card}
                amount={draft.cards[card.id] ?? 0}
                onAdd={() => adjust(card.id, 1)}
                onRemove={() => adjust(card.id, -1)}
              />
            ))}
          </div>
          <p className="zn-num mt-4.5 text-[10px] uppercase tracking-[0.14em] text-zn-ghost">
            {visible.length > 0
              ? t('decks.catalogNote', { count: visible.length, copies: MAX_COPIES })
              : t('collection.empty')}
          </p>
        </div>
      </div>

      {/*
        O painel do deck: abas em cima, conteúdo rolando no meio, barra de ação
        embaixo. É uma coluna de altura fixa (`overflow-hidden`) com UM só
        rolador dentro — o do conteúdo da aba. Foi assim que a barra de gravar
        parou de acompanhar o painel: ela é irmã do rolador, não filha, e por
        isso fica no rodapé da TELA, sem depender de onde a rolagem parou nem de
        qual aba está aberta.

        Abaixo de 1100px o `.zn-split` empilha as duas colunas e passa a ser o
        rolador da página; ali a barra continua colada embaixo pelo `sticky`
        (ver a regra do media query em styles.css).
      */}
      <aside className="flex w-110 flex-none flex-col overflow-hidden border-l border-zn-line bg-zn-bar">
        <div className="zn-hair flex-none grid-cols-2 border-b border-zn-line">
          <button
            type="button"
            className={`zn-tab h-9 uppercase ${tab === 'overview' ? 'zn-tab-on' : ''}`}
            onClick={() => setTab('overview')}
          >
            {t('decks.tab.overview')}
          </button>
          <button
            type="button"
            className={`zn-tab h-9 uppercase ${tab === 'list' ? 'zn-tab-on' : ''}`}
            onClick={() => setTab('list')}
          >
            {t('decks.tab.list')} · {total}
          </button>
        </div>

        {/*
          A chave do rolador troca com a aba de propósito: voltar para o resumo
          deve mostrar o topo do resumo, e não a altura em que a lista tinha
          parado na outra aba.
        */}
        <div key={tab} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {tab === 'overview' && (
            <>
              {/*
                A ordem é a de quem MONTA: primeiro a partida pronta (carregar um
                deck inteiro), depois a identidade (nome e herói) e só então os
                números do que foi montado.
              */}
              <div className="flex flex-none flex-col gap-3.5 border-b border-zn-line px-4.5 py-4">
                {/* formato único (decisão nº 37): o catálogo inteiro cabe em qualquer deck */}
                <select
                  className="zn-select w-full"
                  value=""
                  onChange={(event) => loadStarter(event.target.value)}
                >
                  <option value="" disabled>
                    {t('decks.loadStarter')}
                  </option>
                  {starterDecks.map((starter) => (
                    <option key={starter.key} value={starter.key}>
                      {t(`starterDeck.${starter.key}` as TextKey)}
                    </option>
                  ))}
                </select>

                <input
                  className="zn-input h-11 w-full font-head text-[19px] font-semibold tracking-[0.07em] uppercase"
                  style={{ borderBottom: `2px solid ${ZN.gold}` }}
                  placeholder={t('decks.namePlaceholder')}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />

                <button
                  type="button"
                  onClick={() => setPickingHero(true)}
                  className="flex cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left"
                >
                  <HeroBadge hero={draft.hero} size={56} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="zn-label tracking-[0.24em] uppercase">{t('decks.hero')}</span>
                    <span className="zn-head text-[22px] tracking-[0.08em]">
                      {t(`hero.${draft.hero}.name` as TextKey)}
                    </span>
                    <span
                      className="zn-num text-[10px] tracking-[0.16em] uppercase"
                      style={{ color: heroColor(heroByKey(draft.hero)?.element ?? null) }}
                    >
                      {t(`hero.${draft.hero}.race` as TextKey)}
                    </span>
                  </span>
                  <span
                    className="zn-num shrink-0 px-2.5 py-1.5 text-[9px] tracking-[0.18em] text-zn-gold uppercase"
                    style={{ border: `1px solid ${ZN.gold}44` }}
                  >
                    {t('decks.swapHero')}
                  </span>
                </button>

                <HeroEffect
                  hero={draft.hero}
                  color={heroColor(heroByKey(draft.hero)?.element ?? null)}
                />
              </div>

              <AttackCurve cards={inDeck} />
              <Mosaic cards={inDeck} total={total} />
              <Checks draft={draft} total={total} />
            </>
          )}

          {tab === 'list' && <DeckList draft={draft} onAdjust={adjust} />}
        </div>

        <div className="zn-hair sticky bottom-0 z-10 flex-none grid-cols-2 border-t border-zn-line">
          <button
            type="button"
            className="zn-btn zn-btn-flat h-auto py-3.5 uppercase"
            onClick={() => setTestingHand(true)}
          >
            {t('decks.testHand')}
          </button>
          <button
            type="button"
            className={`zn-btn h-auto py-3.5 uppercase ${
              problems.length === 0 ? 'zn-btn-green' : 'zn-btn-flat text-zn-fainter'
            }`}
            onClick={() => void persist()}
          >
            {t('decks.save')}
          </button>
        </div>
      </aside>

      {pickingHero && (
        <HeroPicker
          hero={draft.hero}
          onClose={() => setPickingHero(false)}
          onPick={(hero) => {
            setDraft((current) => ({ ...current, hero }));
            setPickingHero(false);
            toast(t('decks.heroSet', { hero: t(`hero.${hero}.name` as TextKey) }));
          }}
        />
      )}
      {testingHand && (
        <OpeningHand cards={inDeck} onClose={() => setTestingHand(false)} />
      )}
    </div>
  );
}

/** uma carta do catálogo: arte clicável, nome, raridade, cópias e os dois botões */
function CatalogCard({
  card,
  amount,
  onAdd,
  onRemove,
}: {
  card: Card;
  amount: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { t, cardName } = useTranslation();
  const color = ELEMENT_COLOR[card.element];

  return (
    <div
      className="zn-tile relative flex flex-col gap-2 p-1.5"
      style={{
        ['--tile-line' as string]: amount ? ZN.edgeHi : ZN.line,
        opacity: amount ? 1 : 0.92,
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />
      <button
        type="button"
        onClick={onAdd}
        title={cardName(card.id)}
        className="block cursor-pointer border-0 bg-zn-ink p-0"
      >
        <CardImage cardId={card.id} className="w-full" />
      </button>

      <div className="flex flex-col gap-1.5">
        <div className="zn-name h-8 overflow-hidden text-[14px] leading-tight tracking-[0.04em]">
          {cardName(card.id)}
        </div>
        <div className="flex items-center justify-between gap-1.5">
          <span
            className="zn-num truncate text-[9px] uppercase tracking-[0.12em]"
            style={{ color: RARITY_COLOR[card.rarity] }}
          >
            {t(`cardType.${card.type}`)} · {t(`rarity.${card.rarity}`)}
          </span>
          <span className="flex shrink-0 gap-0.5">
            {Array.from({ length: MAX_COPIES }, (_, copy) => (
              <span
                key={copy}
                className="h-1.5 w-1.5"
                style={{
                  background: copy < amount ? ZN.gold : 'transparent',
                  border: `1px solid ${copy < amount ? ZN.gold : ZN.slot}`,
                }}
              />
            ))}
          </span>
        </div>
        <div className="grid gap-1 [grid-template-columns:1fr_26px]">
          <button
            type="button"
            onClick={onAdd}
            className="zn-btn h-6.5 px-1 text-[10px] tracking-[0.1em] uppercase"
            style={{
              borderColor: amount ? ZN.gold : ZN.slot,
              background: amount ? '#1a1710' : '#0b0c0f',
              color: amount ? '#f5c46a' : '#9ba2b2',
            }}
          >
            {amount ? t('decks.inDeck', { count: amount }) : t('decks.add')}
          </button>
          <button
            type="button"
            disabled={amount === 0}
            title={t('decks.removeOne')}
            onClick={onRemove}
            className="zn-btn zn-btn-quiet zn-btn-undo h-6.5 text-[12px]"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * O mosaico de 40 slots: cada cópia é um bloco na cor do elemento, o resto é
 * contorno vazio. Serve para ver a proporção e o quanto falta de UMA olhada —
 * a mesma ideia dos cristais de dano do tabuleiro (decisão nº 28).
 */
function Mosaic({ cards, total }: { cards: Card[]; total: number }) {
  const { t } = useTranslation();
  const color = total === MAX_DECK_CARDS ? ZN.green : total > MAX_DECK_CARDS ? ZN.red : ZN.gold;
  const sorted = [...cards].sort(
    (a, b) =>
      CARD_TYPES.indexOf(a.type) - CARD_TYPES.indexOf(b.type) ||
      a.element.localeCompare(b.element),
  );

  return (
    <div className="flex flex-none flex-col gap-3 border-b border-zn-line px-4.5 py-4">
      <div className="flex items-baseline justify-between">
        <span className="zn-label tracking-[0.26em] uppercase">
          {t('decks.mosaic', { max: MAX_DECK_CARDS })}
        </span>
        <span className="zn-num text-[11px] text-zn-muted">
          <span className="text-[17px] font-bold" style={{ color }}>
            {total}
          </span>
          /{MAX_DECK_CARDS}
        </span>
      </div>

      <div className="grid grid-cols-10 gap-0.75">
        {Array.from({ length: MAX_DECK_CARDS }, (_, slot) => {
          const card = sorted[slot];
          return (
            <span
              key={slot}
              title={card ? card.name : t('decks.freeSlot')}
              className="h-4"
              style={{
                background: card ? ELEMENT_COLOR[card.element] : ZN.panel,
                border: `1px solid ${card ? ELEMENT_COLOR[card.element] : ZN.line}`,
              }}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3.5 gap-y-2.5">
        {countByElement(cards).map(([element, amount]) => (
          <span key={element} className="zn-num flex items-center gap-1.5 text-[10px] text-zn-muted">
            <span
              aria-hidden
              className="h-2 w-2"
              style={{ background: ELEMENT_COLOR[element] }}
            />
            {t(`element.${element}`)} {amount}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A curva de ataque das criaturas do baralho.
 *
 * Sem altura fixa: a coluna mais alta manda, e `items-end` alinha as outras pelo
 * rodapé. Travar a fileira em 52px (como o protótipo fazia) empurrava a contagem
 * do topo da barra mais alta para FORA da caixa, em cima da etiqueta.
 */
function AttackCurve({ cards }: { cards: Card[] }) {
  const { t } = useTranslation();
  const histogram = [0, 0, 0, 0, 0, 0];
  for (const card of cards) {
    if (card.type === 'creature') histogram[Math.min(card.attack, 5)]! += 1;
  }
  const tallest = Math.max(1, ...histogram);

  return (
    <div className="flex flex-none flex-col gap-2.5 border-b border-zn-line px-4.5 py-4">
      <span className="zn-label tracking-[0.26em] uppercase">{t('decks.curve')}</span>
      {/* uma coluna por valor de ataque, dividindo a largura do painel em partes iguais */}
      <div className="grid min-h-19 grid-cols-6 items-end gap-1.5">
        {histogram.map((amount, attack) => (
          <div key={attack} className="flex flex-col items-center gap-1.5">
            <span className="zn-num text-[9px] text-zn-faint">{amount || ''}</span>
            <span
              className="w-full"
              style={{
                height: Math.max(2, Math.round((amount / tallest) * 46)),
                background: amount ? ZN.gold : ZN.line,
              }}
            />
            <span className="zn-num text-[9px] text-zn-muted">{attack === 5 ? '5+' : attack}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** as pendências que impedem gravar — a resposta para "por que o botão não salva?" */
function Checks({ draft, total }: { draft: Draft; total: number }) {
  const { t } = useTranslation();
  const overCopies = Object.values(draft.cards).some((amount) => amount > MAX_COPIES);

  const checks = [
    { label: t('decks.check.cards', { max: MAX_DECK_CARDS, total }), ok: total <= MAX_DECK_CARDS },
    { label: t('decks.check.copies', { max: MAX_COPIES }), ok: !overCopies },
    {
      label: t('decks.check.hero', { hero: t(`hero.${draft.hero}.name` as TextKey) }),
      ok: Boolean(heroByKey(draft.hero)),
    },
    { label: t('decks.check.name'), ok: Boolean(draft.name.trim()) },
  ];

  return (
    <ul className="flex flex-none flex-col gap-1.5 border-b border-zn-line px-4.5 py-4">
      {checks.map((check) => (
        <li
          key={check.label}
          className="zn-num flex items-center gap-2 text-[10px] tracking-[0.06em] uppercase"
          style={{ color: check.ok ? ZN.green : ZN.red }}
        >
          <span aria-hidden className="w-3 text-center">
            {check.ok ? '✓' : '×'}
          </span>
          {check.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * O que já entrou no baralho, agrupado por tipo — a aba CARTAS inteira.
 *
 * NÃO rola sozinha: quem rola é o conteúdo da aba, e nesta aba ela é o único
 * conteúdo. É por isso que a aba existe (decisão nº 42): a lista não divide mais
 * altura com bloco nenhum.
 */
function DeckList({
  draft,
  onAdjust,
}: {
  draft: Draft;
  onAdjust: (cardId: number, delta: number) => void;
}) {
  const { t, cardName } = useTranslation();
  const groups = CARD_TYPES.map((type) => {
    const rows = Object.entries(draft.cards)
      .map(([id, amount]) => ({ id: Number(id), amount }))
      .filter((row) => cardExists(row.id) && cardById(row.id).type === type)
      .map((row) => ({ card: cardById(row.id), amount: row.amount }))
      .sort((a, b) => a.card.id - b.card.id);
    return { type, rows, total: rows.reduce((sum, row) => sum + row.amount, 0) };
  }).filter((group) => group.rows.length > 0);

  if (groups.length === 0) {
    return (
      <div className="zn-num flex-none px-4.5 py-6.5 text-[11px] leading-relaxed tracking-[0.1em] text-zn-ghost uppercase">
        {t('decks.emptyDeck')}
        <br />
        {t('decks.emptyDeckHint')}
      </div>
    );
  }

  /*
    A lista estava espremida: linha de 22px de altura, nome truncado no meio e os
    dois botões colados nele (relato do DevLukkas sobre o print). O que ela ganhou:

    - MINIATURA da carta em cada linha — é por ela que se reconhece o que está no
      deck, muito antes de ler o nome;
    - ar de verdade (linha de 44px), com nome e estatística em duas linhas em vez
      de brigarem pela mesma;
    - cabeçalho de seção GRUDADO no topo da rolagem, para não se perder de qual
      tipo é a linha que está sendo lida.

    O relato voltou no print seguinte: com tudo isso, a lista continuava espremida
    porque a ALTURA que sobrava para ela era o resto de uma pilha de cinco blocos.
    Foi o que a aba de cartas resolveu (decisão nº 42) — lá o painel é dela.
  */
  return (
    <div className="flex-none px-4 pt-1.5 pb-4">
      {groups.map((group) => (
        <section key={group.type} className="pt-3">
          <h3 className="sticky top-0 z-1 flex items-center gap-2.5 bg-zn-bar pb-2 pt-1">
            <span className="zn-num text-[9px] uppercase tracking-[0.24em] text-zn-muted">
              {t(`cardType.${group.type}`)}
            </span>
            <span aria-hidden className="h-px flex-1 bg-zn-line" />
            <span className="zn-num text-[10px] text-zn-fainter">{group.total}</span>
          </h3>
          <div className="flex flex-col gap-1">
            {group.rows.map(({ card, amount }) => (
              <div
                key={card.id}
                className="flex items-center gap-2.5 bg-zn-panel py-1.5 pl-2 pr-1.5 hover:bg-zn-raise-hi"
                style={{ borderLeft: `2px solid ${ELEMENT_COLOR[card.element]}` }}
              >
                <span className="w-8 shrink-0 border border-zn-edge bg-zn-ink">
                  <CardImage cardId={card.id} className="block w-full" />
                </span>
                <span
                  className="zn-num w-6 shrink-0 text-[13px] font-bold"
                  style={{ color: amount >= MAX_COPIES ? ZN.gold : ZN.goldLight }}
                >
                  ×{amount}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="zn-name truncate text-[15px] leading-tight tracking-[0.04em]">
                    {cardName(card.id)}
                  </span>
                  <span className="zn-num text-[9px] uppercase tracking-[0.12em] text-zn-faint">
                    {card.type === 'creature'
                      ? `${card.attack}/${card.health} · ${t(`element.${card.element}`)}`
                      : t(`element.${card.element}`)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-0.75">
                  <button
                    type="button"
                    title={t('decks.removeOne')}
                    onClick={() => onAdjust(card.id, -1)}
                    className="zn-btn zn-btn-quiet zn-btn-undo h-6.5 w-6.5 text-[13px]"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    title={t('decks.addOne')}
                    onClick={() => onAdjust(card.id, 1)}
                    className="zn-btn zn-btn-quiet h-6.5 w-6.5 text-[13px]"
                  >
                    +
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function blank(name: string): Draft {
  return { name, hero: 'badur', cards: {} };
}
