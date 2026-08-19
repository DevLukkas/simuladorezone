import { useTranslation } from '../useTranslation.ts';

/**
 * Cabeçalho das telas de fora da partida: voltar, título em ouro e o que mais a
 * tela precisar na mesma linha (contagem, botão de criar, seletor).
 */
export function ScreenHeader({
  title,
  note,
  onBack,
  children,
}: {
  title: string;
  /** linha discreta ao lado do título: contagem, aviso */
  note?: string;
  onBack: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-4">
      <button type="button" className="ez-btn ez-btn-ghost ez-btn-sm" onClick={onBack}>
        {t('common.back')}
      </button>
      <h1 className="ez-title text-[clamp(22px,4vw,32px)]">{title}</h1>
      {note && <span className="text-sm text-ez-muted">{note}</span>}
      {children}
    </div>
  );
}
