import { useTranslation } from '../useTranslation.ts';

/**
 * O brasão do jogo na tela de entrada: ELEMENTAL ZONE em Cinzel sobre o filete
 * com os dois losangos verdes e o nome por extenso entre eles.
 *
 * O nome é **Elemental Zone: Trading Card Game** — EZone TCG no atalho. O verso
 * impresso da carta ainda diz "EZone Tatics", que é OUTRO jogo do DevLukkas:
 * nada nesta interface repete essa palavra (a arte do verso é o que é, mas a
 * moldura não a legenda).
 *
 * Uma vez por tela, e só aqui: na moldura do console quem faz esse papel é o
 * `.zn-wordmark` do alto da trilha, em duas linhas e sem o filete.
 */
export function Wordmark() {
  const { t } = useTranslation();

  return (
    <div className="relative flex flex-col items-center gap-2.5">
      <span className="zn-wordmark text-center text-[clamp(30px,6vw,44px)] uppercase tracking-[0.04em]">
        {t('shell.brandTop')} {t('shell.brandBottom')}
      </span>
      <div className="flex items-center gap-3">
        <Rule side="left" />
        <Gem />
        <span className="zn-num text-[10px] uppercase tracking-[0.42em] text-zn-muted indent-[0.42em]">
          {t('app.subtitle')}
        </span>
        <Gem />
        <Rule side="right" />
      </div>
    </div>
  );
}

/** o fio de ouro que some para fora: a única peça do login que usa degradê */
function Rule({ side }: { side: 'left' | 'right' }) {
  return (
    <span
      aria-hidden
      className="h-px w-9 shrink-0 sm:w-14"
      style={{
        background: `linear-gradient(${side === 'left' ? '90deg' : '270deg'},transparent,#e0a33c)`,
      }}
    />
  );
}

/** o losango verde do brasão — a mesma pedra dos pontos de vitória no tabuleiro */
function Gem() {
  return (
    <span
      aria-hidden
      className="h-2.25 w-2.25 shrink-0 rotate-45"
      style={{
        background: 'linear-gradient(135deg,#9fe8b4,#63c77b 55%,#1d6b4b)',
        border: '1px solid #a9f0be',
        boxShadow: '0 0 10px rgba(99,199,123,.7)',
      }}
    />
  );
}
