import { useState } from 'react';
import { ALL_CARDS, cardStatus } from '../../../data/cards.ts';
import { CARD_STATUSES, type Card, type CardStatus } from '../../../data/types.ts';
import { artFileOf } from '../Card.tsx';
import { ComposedCard } from '../ComposedCard.tsx';
import { FilterBar, INITIAL_FILTER, filterCards } from '../CardFilters.tsx';
import { Chip, Confirm, StatusTag } from './StudioParts.tsx';
import { useAdminStore, useArtUrl } from '../../stores/adminStore.ts';
import { useToastStore } from '../../stores/toastStore.ts';
import { ELEMENT_COLOR, STATUS_COLOR } from '../../theme.ts';
import { useTranslation } from '../../useTranslation.ts';

/**
 * As cartas criadas: o catálogo visto pela ESTEIRA (decisão nº 41).
 *
 * É a aba que faltava entre o formulário e a biblioteca. A coleção do jogo mostra
 * só o publicado, e por isso a carta em rascunho não tinha onde aparecer — quem a
 * escreveu precisava lembrar o id para reabri-la. Aqui aparece tudo, cada uma com a
 * situação em que está e o caminho para a próxima.
 *
 * Excluir é oferecido só na faixa das ARQUIVADAS: apagar é o fim da esteira, e o
 * servidor recusa apagar carta que não passou por ela.
 */
export function CardList() {
  const { t, cardName } = useTranslation();
  const [filter, setFilter] = useState(INITIAL_FILTER);
  const [status, setStatus] = useState<CardStatus | 'all'>('all');
  const [confirming, setConfirming] = useState<Card | null>(null);
  const { edit, moveStatus, removeCard, busy } = useAdminStore();
  const toast = useToastStore((state) => state.show);

  const byStatus = ALL_CARDS.filter((card) => status === 'all' || cardStatus(card) === status);
  // id decrescente: quem abre esta aba está atrás do que acabou de escrever
  const shown = filterCards(byStatus, filter).sort((a, b) => b.id - a.id);

  const move = (card: Card, next: CardStatus) => {
    void moveStatus(card.id, next).then((won) => {
      if (won) {
        toast(t('admin.list.moved', { name: cardName(card.id), status: t(`cardStatus.${next}`) }));
      }
    });
  };

  const remove = (card: Card) => {
    setConfirming(null);
    void removeCard(card.id).then((won) => {
      if (won) toast(t('admin.removed'));
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <FilterBar value={filter} onChange={setFilter} pool={ALL_CARDS} elements={false}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            on={status === 'all'}
            label={t('admin.list.all')}
            onClick={() => setStatus('all')}
          />
          {CARD_STATUSES.map((option) => (
            <Chip
              key={option}
              on={status === option}
              color={STATUS_COLOR[option]}
              label={t(`cardStatus.${option}`)}
              title={t(`admin.statusNote.${option}`)}
              onClick={() => setStatus(option)}
            />
          ))}
          <span className="zn-num ml-1.5 text-[10px] uppercase tracking-[0.14em] text-zn-fainter">
            {t('admin.list.count', { count: shown.length, total: ALL_CARDS.length })}
          </span>
        </div>
      </FilterBar>

      {status === 'archived' && (
        <div className="flex flex-none items-center gap-2.5 border-b border-zn-edge bg-zn-panel px-5 py-2.5">
          <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-zn-red" />
          <span className="zn-num text-[10px] uppercase tracking-[0.12em] text-zn-red-light">
            {t('admin.list.archivedTitle')}
          </span>
          <span className="text-[12.5px] text-zn-dim">{t('admin.list.archivedNote')}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-5 pb-7 pt-4.5">
        {shown.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <p className="zn-num text-[11px] uppercase tracking-[0.14em] text-zn-ghost">
              {t('admin.list.empty')}
            </p>
            <p className="text-[12.5px] text-zn-fainter">{t('admin.list.emptyHint')}</p>
          </div>
        ) : (
          <div className="zn-hair grid-cols-1 border border-zn-line">
            {shown.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                busy={busy}
                onOpen={() => edit(card.id)}
                onMove={(next) => move(card, next)}
                onDelete={() => setConfirming(card)}
              />
            ))}
          </div>
        )}
      </div>

      {confirming && (
        <Confirm
          title={t('admin.remove')}
          question={t('admin.removeConfirm', { name: cardName(confirming.id) })}
          confirmLabel={t('admin.remove')}
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function CardRow({
  card,
  busy,
  onOpen,
  onMove,
  onDelete,
}: {
  card: Card;
  busy: boolean;
  onOpen: () => void;
  onMove: (status: CardStatus) => void;
  onDelete: () => void;
}) {
  const { t, cardName } = useTranslation();
  const artUrl = useArtUrl();
  const status = cardStatus(card);
  const artFile = artFileOf(card);
  const openDraft = useAdminStore((state) => state.draft?.card.id);

  return (
    <div
      className="flex flex-wrap items-center gap-3.5 px-3.5 py-3"
      style={{ borderLeft: `2px solid ${STATUS_COLOR[status]}` }}
    >
      <button
        type="button"
        onClick={onOpen}
        title={t('admin.list.open')}
        className="w-14 shrink-0 cursor-pointer border-0 bg-transparent p-0"
      >
        <ComposedCard
          card={card}
          {...(artFile === undefined ? {} : { art: artUrl(artFile) })}
          className="w-full"
        />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-52 flex-1 cursor-pointer flex-col items-start gap-1 border-0 bg-transparent p-0 text-left"
      >
        <span
          className={`zn-name truncate text-[16px] ${
            card.id === openDraft ? 'text-zn-gold-light' : 'text-zn-text'
          }`}
        >
          {cardName(card.id) || `#${card.id}`}
        </span>
        <span className="zn-num flex flex-wrap items-center gap-2 text-[9.5px] uppercase tracking-[0.1em] text-zn-fainter">
          <span>#{String(card.id).padStart(3, '0')}</span>
          <span aria-hidden className="h-1 w-1" style={{ background: ELEMENT_COLOR[card.element] }} />
          <span>{t(`cardType.${card.type}`)}</span>
          <span>·</span>
          <span>{t(`element.${card.element}`)}</span>
          <span>·</span>
          <span>{t(`rarity.${card.rarity}`)}</span>
          {artFile === undefined && (
            <span className="text-zn-gold">· {t('admin.list.noArt')}</span>
          )}
          {card.behaviorPending && <span className="text-zn-gold">· {t('admin.list.pending')}</span>}
        </span>
      </button>

      <StatusTag status={status} className="w-28 shrink-0" />

      <label className="flex shrink-0 items-center gap-2">
        <span className="zn-label tracking-[0.16em] uppercase">{t('admin.list.moveTo')}</span>
        <select
          className="zn-select h-8"
          disabled={busy}
          value={status}
          title={t(`admin.statusNote.${status}`)}
          onChange={(event) => onMove(event.target.value as CardStatus)}
        >
          {CARD_STATUSES.map((option) => (
            <option key={option} value={option}>
              {t(`cardStatus.${option}`)}
            </option>
          ))}
        </select>
      </label>

      {status === 'archived' ? (
        <button
          type="button"
          disabled={busy}
          className="zn-btn zn-btn-blood shrink-0 uppercase"
          onClick={onDelete}
        >
          {t('admin.remove')}
        </button>
      ) : (
        <span
          title={t('admin.list.deleteHint')}
          className="zn-num w-24 shrink-0 text-right text-[9px] uppercase tracking-[0.1em] text-zn-ghost"
        >
          {status === 'published' ? t('admin.list.inGame') : ''}
        </span>
      )}
    </div>
  );
}
