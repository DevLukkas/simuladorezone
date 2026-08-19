import { useState } from 'react';
import { ALL_CARDS } from '../../data/cards.ts';
import { CardImage } from '../components/Card.tsx';
import { FilterBar, INITIAL_FILTER, filterCards } from '../components/CardFilters.tsx';
import { ScreenHeader } from '../components/ScreenHeader.tsx';
import { useCardZoomStore } from '../stores/cardZoomStore.ts';
import { rarityHalo } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

export function Collection({ onBack }: { onBack: () => void }) {
  const [filter, setFilter] = useState(INITIAL_FILTER);
  const zoom = useCardZoomStore((state) => state.zoom);
  const { t } = useTranslation();
  const cards = filterCards(ALL_CARDS, filter);

  return (
    <main className="ez-page px-[clamp(18px,4vw,56px)] pb-16 pt-8">
      <ScreenHeader
        title={t('collection.title')}
        note={t('collection.count', { count: cards.length })}
        onBack={onBack}
      />

      <FilterBar value={filter} onChange={setFilter} />
      <p className="mb-5 text-[13px] text-ez-dim">{t('collection.hint')}</p>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-6 lg:gap-7">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="ez-card-tile block w-full cursor-pointer"
            onClick={() => zoom(card.id)}
            style={{ ['--halo' as string]: rarityHalo(card.rarity) }}
          >
            <CardImage cardId={card.id} className="w-full" />
          </button>
        ))}
      </div>
      {cards.length === 0 && <p className="mt-8 text-center text-ez-dim">{t('collection.empty')}</p>}
    </main>
  );
}
