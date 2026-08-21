import { CARD_STATUSES, type CardStatus } from '../../../data/types.ts';
import { STATUS_COLOR, ZN } from '../../theme.ts';
import { useTranslation } from '../../useTranslation.ts';

/**
 * As peças de que o estúdio inteiro é feito (decisão nº 41).
 *
 * Duas regras valem em TODA tela do estúdio e nascem aqui:
 *
 * 1. o identificador do motor aparece CRU (`add_marker`, `until_end_of_turn`) e a
 *    explicação vem ao lado, nunca no lugar dele;
 * 2. campo nenhum aparece pelado — `Field` exige a linha de descrição, então um
 *    campo novo sem explicação fica visível na revisão em vez de passar batido.
 */

/** o cabeçalho numerado de uma seção do formulário */
export function SectionCard({
  index,
  title,
  note,
  children,
}: {
  index: number;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="zn-panel p-4.5">
      <header className="flex items-center gap-2.5">
        <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-zn-gold" />
        <h3 className="zn-label tracking-[0.28em] uppercase">
          {String(index).padStart(2, '0')} · {title}
        </h3>
      </header>
      <p className="mt-2 text-[12.5px] leading-relaxed text-zn-dim">{note}</p>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * Um campo: etiqueta, explicação e o controle.
 *
 * A explicação é OBRIGATÓRIA de propósito. O estúdio fala o vocabulário do motor,
 * e o autor não tem por que saber de cor o que `summonRule` desligado faz com a
 * criatura — antes desta decisão a dica existia só no `title` de alguns campos, o
 * que é o mesmo que não existir para quem nunca passou o ponteiro por cima.
 */
export function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  /** ocupa a linha inteira numa grade de dois campos */
  wide?: boolean;
}) {
  return (
    /*
     * `div` + `role="group"`, e NÃO `label`: metade dos campos do estúdio é um
     * grupo de botões (tipo, elemento, raridade, situação), e botão é elemento
     * rotulável — dentro de um `label`, clicar na descrição acionaria a PRIMEIRA
     * opção do grupo. Trocar o tipo da carta sem querer, lendo a explicação de
     * para que ele serve, seria o defeito mais caro possível aqui.
     */
    <div className={`flex flex-col gap-2 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="zn-label tracking-[0.2em] text-zn-dim uppercase">{label}</span>
      <div role="group" aria-label={label} className="flex flex-col gap-2">
        {children}
      </div>
      <span className="text-[12px] leading-snug text-zn-fainter">{hint}</span>
    </div>
  );
}

/** grade de dois campos que vira um em tela estreita */
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/** abas coladas: a mesma pastilha do resto do console, escolhendo um valor */
export function Segmented<T extends string>({
  options,
  value,
  labelOf,
  titleOf,
  disabledOf,
  onPick,
}: {
  options: readonly T[];
  value: T;
  labelOf: (option: T) => string;
  titleOf?: (option: T) => string;
  disabledOf?: (option: T) => boolean;
  onPick: (option: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-px border border-zn-edge bg-zn-edge">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabledOf?.(option) ?? false}
          {...(titleOf ? { title: titleOf(option) } : {})}
          onClick={() => onPick(option)}
          className={`zn-tab flex-1 disabled:cursor-default disabled:opacity-40 ${
            value === option ? 'zn-tab-on' : ''
          }`}
        >
          {labelOf(option)}
        </button>
      ))}
    </div>
  );
}

/** pastilha de escolha múltipla: elemento, palavra-chave, filtro da biblioteca */
export function Chip({
  on,
  color,
  label,
  title,
  onClick,
}: {
  on: boolean;
  /** o quadradinho da esquerda; sem cor, a pastilha vem só com texto */
  color?: string;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(title === undefined ? {} : { title })}
      className="flex h-8.5 cursor-pointer items-center gap-1.5 px-2.5"
      style={{
        border: `1px solid ${on ? ZN.gold : ZN.edge}`,
        background: on ? '#1a1710' : ZN.panel,
      }}
    >
      {color && <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: color }} />}
      <span
        className={`zn-num text-[10px] uppercase tracking-[0.1em] ${
          on ? 'text-zn-gold-light' : 'text-zn-muted'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/** liga/desliga: o quadrado acende em ouro, como a seleção do resto do console */
export function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex h-8.5 cursor-pointer items-center gap-2.5 self-start px-2.5"
      style={{ border: `1px solid ${on ? ZN.gold : ZN.edge}`, background: ZN.panel }}
    >
      <span
        aria-hidden
        className="grid h-3.5 w-3.5 shrink-0 place-items-center"
        style={{
          border: `1px solid ${on ? ZN.gold : ZN.edgeHi}`,
          background: on ? ZN.gold : 'transparent',
        }}
      />
      <span
        className={`zn-num text-[10px] uppercase tracking-[0.12em] ${
          on ? 'text-zn-gold-light' : 'text-zn-muted'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/** − número + : o passo de um em um, que é como ATQ e VIDA se ajustam */
export function Stepper({
  value,
  color,
  onChange,
}: {
  value: number;
  color: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex gap-px border border-zn-edge bg-zn-edge">
      <button
        type="button"
        className="zn-btn zn-btn-flat w-10 text-[15px]"
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <span
        className="zn-num grid h-8.5 flex-1 place-items-center bg-zn-panel text-[18px] font-bold"
        style={{ color }}
      >
        {value}
      </span>
      <button
        type="button"
        className="zn-btn zn-btn-flat w-10 text-[15px]"
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

/** o losango de situação, do tamanho de um marcador de texto */
export function StatusDot({ status }: { status: CardStatus }) {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 shrink-0 rotate-45"
      style={{ background: STATUS_COLOR[status] }}
    />
  );
}

/** nome da situação com o losango na cor dela */
export function StatusTag({ status, className }: { status: CardStatus; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={`zn-num flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] ${className ?? ''}`}
      style={{ color: STATUS_COLOR[status] }}
    >
      <StatusDot status={status} />
      {t(`cardStatus.${status}`)}
    </span>
  );
}

export const STATUS_ORDER: readonly CardStatus[] = CARD_STATUSES;

/** a janela do estúdio: mesma cara do `ConsoleModal` do resto do console */
export function StudioModal({
  title,
  width,
  onClose,
  children,
}: {
  title: string;
  width: number;
  onClose: (() => void) | null;
  children: React.ReactNode;
}) {
  return (
    <div className="zn-backdrop z-50">
      <div
        role="dialog"
        aria-label={title}
        className="zn-dialog zn-notch flex max-h-full flex-col overflow-hidden p-5"
        style={{ width: `min(${width}px, 100%)` }}
      >
        <div className="mb-3.5 flex items-center gap-3">
          <span aria-hidden className="h-4 w-[3px] shrink-0 bg-zn-gold" />
          <h2 className="zn-head text-[19px] tracking-[0.1em]">{title}</h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="zn-btn zn-btn-quiet zn-btn-undo ml-auto h-6.5 w-6.5 text-[12px]"
            >
              ×
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

/**
 * A pergunta antes de apagar.
 *
 * Apagar carta reescreve o arquivo do catálogo e apagar arte some com o binário —
 * nos dois casos não há desfazer, e é por isso que a confirmação é uma janela com o
 * nome do que vai embora escrito nela, e não um `confirm()` do navegador.
 */
export function Confirm({
  title,
  question,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  return (
    <StudioModal title={title} width={460} onClose={onCancel}>
      <p className="text-[13.5px] leading-relaxed text-zn-soft">{question}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="zn-btn zn-btn-wire uppercase" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className="zn-btn zn-btn-blood uppercase" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </StudioModal>
  );
}

/** peso de arquivo em KB/MB, que é como a biblioteca fala de tamanho */
export function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
