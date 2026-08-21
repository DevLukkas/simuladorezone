import { PLAYABLE_CARDS } from '../../data/cards.ts';
import type { Card, Element } from '../../data/types.ts';
import { cardName, cardRulesText } from '../../i18n/index.ts';
import { ELEMENT_COLOR, ZN } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

export const FILTER_TYPES = ['all', 'creature', 'ability', 'item', 'command', 'scenario'] as const;
export const FILTER_ELEMENTS = [
  'all',
  'fire',
  'water',
  'earth',
  'wind',
  'neutral',
  'void',
  'arcane',
] as const;

export interface CardFilterState {
  search: string;
  type: (typeof FILTER_TYPES)[number];
  element: (typeof FILTER_ELEMENTS)[number];
}

export const INITIAL_FILTER: CardFilterState = { search: '', type: 'all', element: 'all' };

/** Minúsculas e sem diacríticos: buscar "tritao" acha "Tritão". */
function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * A busca varre o texto do idioma corrente E o impresso em pt-BR: quem joga em
 * inglês acha "Trident", e quem decorou a carta impressa acha "Tridente" sem
 * precisar trocar de idioma.
 */
function searchableText(card: Card): string {
  const translated = `${cardName(card.id)} ${cardRulesText(card.id) ?? ''}`;
  const printed = `${card.name} ${card.text ?? ''}`;
  return normalizeText(translated === printed ? printed : `${translated} ${printed}`);
}

export function filterCards(cards: readonly Card[], filter: CardFilterState): Card[] {
  const search = normalizeText(filter.search.trim());
  return cards.filter((card) => {
    if (filter.type !== 'all' && card.type !== filter.type) return false;
    if (filter.element !== 'all' && card.element !== filter.element) return false;
    if (search && !searchableText(card).includes(search)) return false;
    return true;
  });
}

/**
 * A barra de filtros do console: busca, abas de tipo e as pastilhas de elemento.
 *
 * As pastilhas listam só os elementos que EXISTEM no lote que a tela mostra — o
 * catálogo declara sete, o clássico usa quatro, e oferecer "Arcano" numa grade
 * sem nenhuma carta arcana é um filtro que só sabe dar zero resultados.
 */
export function FilterBar({
  value,
  onChange,
  pool = PLAYABLE_CARDS,
  elements = true,
  children,
}: {
  value: CardFilterState;
  onChange: (filter: CardFilterState) => void;
  /** o lote de onde saem as pastilhas de elemento; padrão: o que está publicado */
  pool?: readonly Card[];
  /**
   * As pastilhas de elemento. A coleção as dispensa (o desenho deixa o canto
   * direito para a contagem) e o construtor as usa — lá o elemento é a decisão
   * de montagem, aqui é só um jeito de olhar.
   */
  elements?: boolean;
  /** o que vai no canto direito da barra: contagem, botão de formato */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const present = elements
    ? FILTER_ELEMENTS.filter(
        (element) => element === 'all' || pool.some((card) => card.element === element),
      )
    : [];

  return (
    <div className="flex flex-none flex-wrap items-center gap-2.5 border-b border-zn-line bg-zn-bar px-5 py-3.5">
      <label className="zn-panel flex h-8.5 min-w-52 flex-1 items-center gap-2 px-3 sm:flex-none">
        <span aria-hidden className="zn-num text-[11px] text-zn-fainter">
          /
        </span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-zn-text outline-none"
          placeholder={t('filters.search')}
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
        />
      </label>

      <div className="flex gap-px border border-zn-edge bg-zn-edge">
        {FILTER_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`zn-tab ${value.type === type ? 'zn-tab-on' : ''}`}
            onClick={() => onChange({ ...value, type })}
          >
            {type === 'all' ? t('filters.allTypes') : t(`cardType.${type}`)}
          </button>
        ))}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {present.map((element) => {
          const on = value.element === element;
          const color = element === 'all' ? ZN.slot : ELEMENT_COLOR[element as Element];
          return (
            <button
              key={element}
              type="button"
              title={element === 'all' ? t('filters.allElementsTitle') : t(`element.${element}`)}
              onClick={() => onChange({ ...value, element })}
              className="flex h-8.5 cursor-pointer items-center gap-1.5 px-2.5"
              style={{
                border: `1px solid ${on ? ZN.gold : ZN.edge}`,
                background: on ? '#1a1710' : ZN.panel,
              }}
            >
              <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: color }} />
              <span
                className={`zn-num text-[10px] uppercase tracking-[0.1em] ${
                  on ? 'text-zn-gold-light' : 'text-zn-muted'
                }`}
              >
                {element === 'all' ? t('filters.allElements') : t(`element.${element}`)}
              </span>
            </button>
          );
        })}
        {children}
      </div>
    </div>
  );
}
