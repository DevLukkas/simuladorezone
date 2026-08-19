import type { Card } from '../../data/types.ts';
import { cardName, cardRulesText } from '../../i18n/index.ts';
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

/** Barra de filtros compartilhada pela Coleção e pelo construtor de decks. */
export function FilterBar({
  value,
  onChange,
}: {
  value: CardFilterState;
  onChange: (filter: CardFilterState) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-2 flex flex-wrap items-center gap-3">
      <input
        className="ez-input ez-input-sm min-w-55 max-w-85 flex-1"
        placeholder={t('filters.search')}
        value={value.search}
        onChange={(event) => onChange({ ...value, search: event.target.value })}
      />
      <div className="flex flex-wrap gap-2">
        {FILTER_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`ez-chip ${value.type === type ? 'ez-chip-on' : ''}`}
            onClick={() => onChange({ ...value, type })}
          >
            {type === 'all' ? t('filters.allTypes') : t(`cardType.${type}`)}
          </button>
        ))}
      </div>
      <select
        className="ez-select ez-select-sm"
        value={value.element}
        onChange={(event) =>
          onChange({ ...value, element: event.target.value as CardFilterState['element'] })
        }
      >
        {FILTER_ELEMENTS.map((element) => (
          <option key={element} value={element}>
            {element === 'all' ? t('filters.allElements') : t(`element.${element}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
