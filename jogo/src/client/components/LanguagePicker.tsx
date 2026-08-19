import { LOCALES, LOCALE_NAMES } from '../../i18n/index.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * Troca de idioma. O padrão vem do sistema (`navigator.language`); a escolha
 * feita aqui é guardada e passa a valer por cima dele.
 */
export function LanguagePicker({ className }: { className?: string }) {
  const { t, locale, setLocale } = useTranslation();

  return (
    <label className={`flex items-center gap-2.5 text-[13px] text-ez-muted ${className ?? ''}`}>
      <span className="sr-only">{t('common.language')}</span>
      <span aria-hidden className="ez-gem h-2 w-2 shrink-0" />
      <select
        className="ez-select ez-select-sm"
        value={locale}
        onChange={(event) => setLocale(event.target.value as (typeof LOCALES)[number])}
      >
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
