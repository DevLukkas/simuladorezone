import { heroByKey } from '../../data/heroes.ts';
import type { TextKey } from '../../i18n/keys.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * O retrato do herói, com a auréola do elemento dele por trás.
 *
 * O deck guarda só a chave (`badur`), e o arquivo do avatar vive no catálogo
 * (`heroes.ts`) — resolver o caminho aqui é o que evita montar
 * `/assets/heroes/avatar_heroi_${key}.png` na mão em cada tela.
 */
const GLOW: Record<string, string> = {
  water: 'rgba(63,169,245,.4)',
  earth: 'rgba(143,206,79,.4)',
  fire: 'rgba(255,122,69,.4)',
};

export function HeroPortrait({
  hero,
  size,
  className,
}: {
  hero: string;
  size: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const entry = heroByKey(hero);
  if (!entry) return null;
  const name = t(`hero.${entry.key}.name` as TextKey);
  const glow = entry.element ? (GLOW[entry.element] ?? 'rgba(168,117,240,.4)') : 'rgba(201,153,46,.35)';

  return (
    <img
      src={`/assets/heroes/${entry.img}`}
      alt={name}
      title={name}
      draggable={false}
      className={`shrink-0 object-contain ${className ?? ''}`}
      style={{ width: size, height: size, filter: `drop-shadow(0 4px 12px ${glow})` }}
    />
  );
}
