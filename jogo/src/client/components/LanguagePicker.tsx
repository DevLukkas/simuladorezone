import { LOCALES, LOCALE_NAMES } from '../../i18n/index.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * Troca de idioma. O padrão vem do sistema (`navigator.language`); a escolha
 * feita aqui é guardada e passa a valer por cima dele.
 *
 * Era um par — uma peça para o login, outra para a barra do console —, porque o
 * login ainda vivia no tema anterior. Com a migração do login (decisão nº 31)
 * sobrou uma só: mesmo `.zn-select` das outras etiquetas da barra, do mesmo
 * tamanho e da mesma voz mono, nas duas telas.
 */
export function LanguagePicker() {
  const { t, locale, setLocale } = useTranslation();

  return (
    <select
      className="zn-select uppercase"
      aria-label={t('common.language')}
      title={t('common.language')}
      value={locale}
      onChange={(event) => setLocale(event.target.value as (typeof LOCALES)[number])}
    >
      {LOCALES.map((option) => (
        <option key={option} value={option}>
          {LOCALE_NAMES[option]}
        </option>
      ))}
    </select>
  );
}
