import { MAX_DECK_CARDS, validateDeck } from '../../data/deckRules.ts';
import { heroByKey } from '../../data/heroes.ts';
import { DIRECT_DAMAGE_PER_POINT, POINTS_TO_WIN, TURN_SECONDS } from '../../engine/state.ts';
import type { Card } from '../../data/types.ts';
import type { TextKey } from '../../i18n/keys.ts';
import type { Screen } from '../components/AppShell.tsx';
import { HeroBadge } from '../components/HeroPortrait.tsx';
import { useDecksStore, activeDeckOf, type SavedDeck } from '../stores/decksStore.ts';
import { countByElement, expandDeck } from '../deckStats.ts';
import { ELEMENT_COLOR, RARITY_COLOR, ZN, heroColor } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * A mesa de comando: por onde a partida começa e o que o baralho ativo diz.
 *
 * As quatro entradas grandes à esquerda são as MESMAS quatro da trilha mais o
 * treino — a trilha leva a qualquer tela a qualquer hora, e o hub é o lugar onde
 * elas se explicam. O que muda de verdade aqui é a coluna da direita: ela lê o
 * baralho ativo e diz, sem abrir o construtor, se dá para jogar com ele.
 */
export function Hub({
  onNavigate,
  onTrain,
}: {
  onNavigate: (screen: Screen) => void;
  onTrain: () => void;
}) {
  const { t } = useTranslation();
  const deck = useDecksStore(activeDeckOf);

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-8.5 pt-7">
      <div className="grid items-start gap-5.5 [grid-template-columns:minmax(0,1fr)] xl:[grid-template-columns:minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3.5">
          <Action
            index="01"
            accent={ZN.red}
            label={t('hub.action.train')}
            desc={t('hub.action.trainDesc')}
            onClick={onTrain}
          />
          <Action
            index="02"
            accent={ZN.green}
            label={t('hub.action.online')}
            desc={t('hub.action.onlineDesc')}
            onClick={() => onNavigate('online')}
          />
          <Action
            index="03"
            accent={ZN.gold}
            label={t('hub.action.builder')}
            desc={t('hub.action.builderDesc', { max: MAX_DECK_CARDS })}
            onClick={() => onNavigate('builder')}
          />
          <Action
            index="04"
            accent={ELEMENT_COLOR.water}
            label={t('hub.action.collection')}
            desc={t('hub.action.collectionDesc')}
            onClick={() => onNavigate('collection')}
          />

          <section className="zn-panel mt-2 px-5.5 py-5">
            <h2 className="zn-label uppercase">{t('hub.winTitle')}</h2>
            <div className="zn-hair mt-4 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              <WinCondition
                mark={String(POINTS_TO_WIN)}
                title={t('hub.win.points')}
                desc={t('hub.win.pointsDesc', { points: POINTS_TO_WIN })}
              />
              <WinCondition
                mark={String(DIRECT_DAMAGE_PER_POINT)}
                title={t('hub.win.direct')}
                desc={t('hub.win.directDesc', { damage: DIRECT_DAMAGE_PER_POINT })}
              />
              <WinCondition
                mark="×"
                title={t('hub.win.concede')}
                desc={t('hub.win.concedeDesc')}
              />
              <WinCondition
                mark={String(TURN_SECONDS)}
                title={t('hub.win.timeout')}
                desc={t('hub.win.timeoutDesc', { seconds: TURN_SECONDS })}
              />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          {deck ? (
            <>
              <HeroPlate deck={deck} />
              <DeckReadout deck={deck} onOpenBuilder={() => onNavigate('builder')} />
            </>
          ) : (
            <section className="zn-panel flex flex-col gap-3.5 p-5">
              <h2 className="zn-label uppercase">{t('hub.deckRead')}</h2>
              <p className="zn-head text-[22px] tracking-[0.07em]">{t('hub.noDeckTitle')}</p>
              <p className="text-[13px] leading-snug text-zn-dim">
                {t('hub.noDeckDesc', { max: MAX_DECK_CARDS })}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('builder')}
                className="zn-btn zn-btn-wire self-start uppercase"
              >
                {t('hub.openBuilder')}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** uma das entradas grandes: número, nome, uma linha de porquê e a seta */
function Action({
  index,
  accent,
  label,
  desc,
  onClick,
}: {
  index: string;
  accent: string;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="zn-panel zn-panel-hover grid cursor-pointer items-center gap-4.5 px-5.5 py-5.5 text-left [grid-template-columns:32px_1fr_auto]"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <span className="zn-num text-[12px] text-zn-fainter">{index}</span>
      <span className="flex flex-col gap-1.5">
        <span className="zn-head text-[27px]">{label}</span>
        <span className="text-sm text-zn-muted">{desc}</span>
      </span>
      <span aria-hidden className="zn-num text-[16px]" style={{ color: accent }}>
        →
      </span>
    </button>
  );
}

function WinCondition({ mark, title, desc }: { mark: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-1.5 px-3.5 pb-4 pt-3.5">
      <span className="zn-num text-[20px] font-bold text-zn-gold">{mark}</span>
      <span className="zn-name text-[16px] tracking-[0.07em] text-zn-text">{title}</span>
      <span className="text-[13px] leading-snug text-zn-dim">{desc}</span>
    </div>
  );
}

function HeroPlate({ deck }: { deck: SavedDeck }) {
  const { t } = useTranslation();
  const hero = heroByKey(deck.hero);
  if (!hero) return null;
  const color = heroColor(hero.element);

  return (
    <section className="zn-panel p-5">
      <h2 className="zn-label uppercase">{t('hub.heroTitle')}</h2>
      <div className="mt-4 flex items-center gap-4">
        <HeroBadge hero={hero.key} size={78} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="zn-head text-[26px] tracking-[0.08em]">
            {t(`hero.${hero.key}.name` as TextKey)}
          </span>
          <span className="zn-num text-[10px] uppercase tracking-[0.18em]" style={{ color }}>
            {hero.element
              ? t('hub.heroElement', { element: t(`element.${hero.element}`) })
              : t('hub.heroNoElement')}
          </span>
          <span className="text-[13px] text-zn-dim">{t('hub.heroNote')}</span>
        </div>
      </div>
    </section>
  );
}

/**
 * A leitura do baralho: quatro números, a proporção de elementos e a porta do
 * construtor. "Situação" é a validação de verdade (`validateDeck`), a mesma que
 * o servidor roda antes de gravar — não uma conta de 40 feita à parte.
 */
function DeckReadout({ deck, onOpenBuilder }: { deck: SavedDeck; onOpenBuilder: () => void }) {
  const { t } = useTranslation();
  const cards = expandDeck(deck.cards);
  const total = cards.length;
  const valid = validateDeck(deck).length === 0;
  const totalColor = total === MAX_DECK_CARDS ? ZN.green : total > MAX_DECK_CARDS ? ZN.red : ZN.gold;

  return (
    <section className="zn-panel flex flex-col gap-3.5 p-5">
      <h2 className="zn-label uppercase">{t('hub.deckRead')}</h2>

      <div className="zn-hair grid-cols-2">
        <Stat label={t('hub.stat.cards')} value={`${total}/${MAX_DECK_CARDS}`} color={totalColor} />
        <Stat
          label={t('hub.stat.creatures')}
          value={String(cards.filter((card) => card.type === 'creature').length)}
        />
        <Stat
          label={t('hub.stat.legendaries')}
          value={String(cards.filter((card) => card.rarity === 'legendary').length)}
          color={RARITY_COLOR.legendary}
        />
        <Stat
          label={t('hub.stat.status')}
          value={valid ? t('hub.ready') : t('hub.incomplete')}
          color={valid ? ZN.green : ZN.red}
        />
      </div>

      <ElementBar cards={cards} />

      <button
        type="button"
        onClick={onOpenBuilder}
        className="zn-btn zn-btn-wire self-start border-transparent bg-transparent uppercase text-zn-gold"
        style={{ borderColor: ZN.slot }}
      >
        {t('hub.openBuilder')}
      </button>
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-3">
      <span className="zn-num text-[9px] uppercase tracking-[0.2em] text-zn-faint">{label}</span>
      <span className="zn-num text-[17px] font-bold" style={{ color: color ?? '#e6e2d8' }}>
        {value}
      </span>
    </div>
  );
}

/** a fita de proporção por elemento — mesma leitura do rodapé do construtor */
function ElementBar({ cards, height = 8 }: { cards: readonly Card[]; height?: number }) {
  const { t } = useTranslation();
  const counted = countByElement(cards);

  return (
    <div className="zn-track" style={{ height }}>
      {counted.map(([element, amount]) => (
        <span
          key={element}
          title={`${t(`element.${element}`)} ${amount}`}
          style={{
            width: `${Math.round((amount / cards.length) * 100)}%`,
            background: ELEMENT_COLOR[element],
          }}
        />
      ))}
    </div>
  );
}
