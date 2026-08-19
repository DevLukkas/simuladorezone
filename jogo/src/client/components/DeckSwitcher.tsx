import { MAX_DECK_CARDS } from '../../data/deckRules.ts';
import type { TextKey } from '../../i18n/keys.ts';
import { ConsoleModal } from './ConsoleModal.tsx';
import { HeroBadge } from './HeroPortrait.tsx';
import { useDecksStore } from '../stores/decksStore.ts';
import { useTranslation } from '../useTranslation.ts';
import { ZN } from '../theme.ts';

/**
 * A lista de baralhos da conta, aberta pelo rodapé da trilha.
 *
 * O desenho importado supõe UM baralho — nome no rodapé, construtor editando
 * aquele. A conta tem vários desde sempre (`/api/decks`), então esta janela é o
 * que reconcilia as duas coisas: escolher qual está na mesa, criar outro e
 * apagar. Ela usa a mesma cara da escolha de herói de propósito — as duas são "a
 * gaveta de trás" do construtor, e uma cara nova para cada seria ruído.
 *
 * Criar um baralho novo é ficar SEM ativo (`setActive(null)`) e ir ao construtor:
 * lá, sem ativo, ele abre um rascunho vazio. Gravar é que devolve o ativo.
 */
export function DeckSwitcher({
  onClose,
  onOpenBuilder,
}: {
  onClose: () => void;
  onOpenBuilder: () => void;
}) {
  const { t } = useTranslation();
  const { decks, activeId, setActive, remove } = useDecksStore();

  return (
    <ConsoleModal title={t('decks.listTitle')} note={t('decks.listNote')} width={980} onClose={onClose}>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        {decks.map((deck) => {
          const total = Object.values(deck.cards).reduce((sum, amount) => sum + amount, 0);
          const active = deck.id === activeId;
          return (
            <div
              key={deck.id}
              className="zn-panel flex items-center gap-3 p-3.5"
              style={active ? { borderColor: ZN.gold } : undefined}
            >
              <button
                type="button"
                onClick={() => {
                  setActive(deck.id);
                  onOpenBuilder();
                }}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left"
              >
                <HeroBadge hero={deck.hero} size={48} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="zn-head truncate text-[20px] tracking-[0.07em]">{deck.name}</span>
                  <span className="zn-num truncate text-[9.5px] uppercase tracking-[0.14em] text-zn-muted">
                    {t(`hero.${deck.hero}.name` as TextKey)} · {total}/{MAX_DECK_CARDS} ·{' '}
                    {t(`format.${deck.format ?? 'classic'}`)}
                  </span>
                </span>
              </button>
              {active && (
                <span className="zn-num shrink-0 text-[9px] uppercase tracking-[0.18em] text-zn-gold">
                  {t('decks.active')}
                </span>
              )}
              <button
                type="button"
                title={t('decks.deleteDeck')}
                className="zn-btn zn-btn-quiet zn-btn-undo h-7 w-7 shrink-0 text-[12px]"
                onClick={() => {
                  if (window.confirm(t('decks.deleteConfirm', { deck: deck.name }))) {
                    void remove(deck.id);
                  }
                }}
              >
                ×
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setActive(null);
            onOpenBuilder();
          }}
          className="zn-panel zn-panel-hover flex cursor-pointer items-center justify-center gap-2.5 p-3.5"
          style={{ borderStyle: 'dashed' }}
        >
          <span className="zn-num text-[16px] text-zn-gold">+</span>
          <span className="zn-num text-[10px] uppercase tracking-[0.18em] text-zn-muted">
            {t('decks.newDeck')}
          </span>
        </button>
      </div>

      {decks.length === 0 && (
        <p className="zn-num pt-4.5 text-[11px] uppercase tracking-[0.14em] text-zn-ghost">
          {t('decks.emptyList')}
        </p>
      )}
    </ConsoleModal>
  );
}
