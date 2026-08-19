import { useEffect } from 'react';
import { useTranslation } from '../useTranslation.ts';

/**
 * A janela do console (decisão nº 29): véu escuro, painel de canto chanfrado e
 * um cabeçalho de três peças — título condensado, nota mono e o × de fechar.
 *
 * Três telas a usam com a mesma cara (escolher herói, trocar de baralho, mão
 * inicial simulada), e é dela que sai o comportamento que todas precisam ter:
 * clicar no véu fecha, Esc fecha, e o clique de dentro não vaza para o véu.
 */
export function ConsoleModal({
  title,
  note,
  width,
  onClose,
  children,
}: {
  title: string;
  /** a linha mono ao lado do título, em caixa alta */
  note?: string;
  /** largura máxima do painel; o desenho usa 1240 na escolha de herói */
  width: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="zn-backdrop z-80 cursor-pointer" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="zn-notch-lg max-h-full cursor-default overflow-auto border border-zn-edge bg-zn-bar px-6.5 pb-6.5 pt-6"
        style={{ width: `min(${width}px, 100%)`, animation: 'zn-rise .2s ease both' }}
      >
        <div className="flex flex-wrap items-baseline gap-3.5 pb-4.5">
          <h2 className="zn-head text-[28px] tracking-[0.1em]">{title}</h2>
          {note && (
            <span className="zn-num text-[10px] uppercase tracking-[0.2em] text-zn-faint">
              {note}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="zn-btn zn-btn-quiet zn-btn-undo ml-auto px-3 uppercase tracking-[0.18em]"
          >
            {t('common.close')} ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
