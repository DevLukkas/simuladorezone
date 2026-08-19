import { useTranslation } from '../useTranslation.ts';

/**
 * O brasão do jogo: EZONE em ouro gravado sobre o filete com os losangos.
 *
 * O nome por extenso é **Elemental Zone: Trading Card Game** — EZone TCG no
 * atalho. O verso impresso da carta ainda diz "EZone Tatics", que é OUTRO jogo
 * do DevLukkas: nada nesta interface repete essa palavra (a arte do verso é o
 * que é, mas a moldura não a legenda).
 */
export function Wordmark({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="ez-title text-[clamp(28px,5vw,40px)] tracking-[0.05em]">
          {t('app.title')}
        </span>
        <Rule gem={8} line={48} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center gap-1.5">
      <span
        className="ez-title text-[clamp(38px,9vw,56px)] tracking-[0.06em]"
        style={{ textShadow: '0 0 40px rgba(223,174,69,.25)' }}
      >
        EZONE
      </span>
      <Rule gem={11} line={64} label={t('app.subtitle')} />
    </div>
  );
}

/** filete—losango—(legenda)—losango—filete */
function Rule({ gem, line, label }: { gem: number; line: number; label?: string }) {
  const stone = <span className="ez-gem shrink-0" style={{ width: gem, height: gem }} />;
  return (
    <div className="flex items-center gap-3.5">
      <span
        className="h-px shrink-0"
        style={{ width: line, background: 'linear-gradient(90deg,transparent,#c9992e)' }}
      />
      {stone}
      {label && (
        <span className="font-title text-[13px] font-bold tracking-[0.5em] text-[#b9c6e2] indent-[0.5em] sm:text-[15px]">
          {label}
        </span>
      )}
      {label && stone}
      <span
        className="h-px shrink-0"
        style={{ width: line, background: 'linear-gradient(270deg,transparent,#c9992e)' }}
      />
    </div>
  );
}
