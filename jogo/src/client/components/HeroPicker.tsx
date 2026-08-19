import { heroes } from '../../data/heroes.ts';
import type { TextKey } from '../../i18n/keys.ts';
import { ConsoleModal } from './ConsoleModal.tsx';
import { HeroBadge } from './HeroPortrait.tsx';
import { heroColor } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * A escolha do herói, aberta pela placa do construtor.
 *
 * Os cinco aparecem de uma vez, cada um com o efeito passivo por extenso: o
 * herói vale a partida inteira e não se troca no meio, então a decisão precisa
 * ser tomada LENDO, não adivinhando pelo nome num select.
 */
export function HeroPicker({
  hero,
  onPick,
  onClose,
}: {
  hero: string;
  onPick: (hero: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <ConsoleModal
      title={t('decks.heroPickTitle')}
      note={t('decks.heroPickNote')}
      width={1240}
      onClose={onClose}
    >
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(310px,1fr))]">
        {heroes.map((entry) => {
          const color = heroColor(entry.element);
          const chosen = entry.key === hero;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => onPick(entry.key)}
              className="zn-panel zn-panel-hover flex cursor-pointer flex-col gap-2.5 p-4 text-left"
              style={
                chosen
                  ? { borderColor: color, boxShadow: `0 0 0 1px ${color}, 0 0 22px ${color}33` }
                  : undefined
              }
            >
              <span className="flex items-center gap-3">
                <HeroBadge hero={entry.key} size={54} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="zn-head text-[21px] tracking-[0.08em]">
                    {t(`hero.${entry.key}.name` as TextKey)}
                  </span>
                  <span
                    className="zn-num text-[9.5px] uppercase tracking-[0.16em]"
                    style={{ color }}
                  >
                    {t(`hero.${entry.key}.race` as TextKey)} ·{' '}
                    {entry.element ? t(`element.${entry.element}`) : t('hub.heroNoElement')}
                  </span>
                </span>
                {chosen && (
                  <span className="zn-num shrink-0 text-[9px] uppercase tracking-[0.18em] text-zn-gold">
                    {t('decks.heroInUse')}
                  </span>
                )}
              </span>

              <HeroEffect hero={entry.key} color={color} />
            </button>
          );
        })}
      </div>
    </ConsoleModal>
  );
}

/**
 * A caixa do efeito passivo, com o filete na cor do elemento à esquerda.
 *
 * Aparece igual na escolha e na placa do construtor — é a mesma informação, e
 * ver a mesma caixa nos dois lugares é o que deixa claro que o herói escolhido
 * na janela é o que ficou na placa.
 */
export function HeroEffect({ hero, color }: { hero: string; color: string }) {
  const { t } = useTranslation();
  return (
    <span
      className="flex flex-col gap-1 bg-zn-ink px-3 py-2.5"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <span className="zn-num text-[9px] uppercase tracking-[0.2em]" style={{ color }}>
        {t(`hero.${hero}.effectName` as TextKey)}
      </span>
      <span className="text-[12px] leading-relaxed text-pretty text-zn-dim">
        {t(`hero.${hero}.effectText` as TextKey)}
      </span>
    </span>
  );
}
