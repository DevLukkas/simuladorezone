import { defaultField, defaultFields } from '../../../data/defaults.ts';
import type { FieldMap, FieldSpec } from '../../../data/vocabulary.ts';
import { ZN } from '../../theme.ts';
import { useTranslation } from '../../useTranslation.ts';
import type { TextKey } from '../../../i18n/keys.ts';

/**
 * O formulário do vocabulário: um `FieldSpec` vira um controle, sem nenhuma tela
 * escrita por tipo de ação. É isto que faz o estúdio acompanhar o motor sozinho —
 * campo novo em `types.ts` obriga uma linha em `vocabulary.ts` e aparece aqui.
 *
 * Os NOMES dos campos e dos valores continuam CRUS de propósito: `add_marker`,
 * `trigger_source`, `until_end_of_turn` são o vocabulário do motor, é assim que se
 * fala deles no `decisions.md` e nas cartas. Traduzir o identificador criaria um
 * segundo idioma de regras para o autor decorar.
 *
 * O que mudou na decisão nº 41 é o lugar da DESCRIÇÃO: ela era um `title`, e dica
 * que só existe no hover é dica que não existe para quem não passa o ponteiro por
 * cima. Agora ela é uma linha, embaixo do nome do campo, sempre visível — e o valor
 * escolhido continua se explicando ao lado quando o que está no select é uma regra
 * do motor ("em quem cai", "quando dispara").
 */

type Plain = Record<string, unknown>;

const isOptional = (spec: FieldSpec): boolean => 'optional' in spec && spec.optional === true;

/**
 * Campos cujo VALOR escolhido também pede explicação: o que está no select é uma
 * regra do motor, não um número. Nos demais a descrição do NOME já basta.
 */
const VALUE_NOTES: Record<string, string> = {
  target: 'vocab.target.',
  trigger: 'vocab.trigger.',
};

/** a descrição daquela chave, ou nada quando o dicionário não tem uma */
export function useNote(key: string): string | null {
  const { t, hasText } = useTranslation();
  return hasText(key) ? t(key as TextKey) : null;
}

/** a mesma descrição, quando quem chama só quer desenhá-la (ou sumir com ela) */
export function Note({ of: key, className }: { of: string; className?: string }) {
  const note = useNote(key);
  if (!note) return null;
  return (
    <span className={className ?? 'text-[12px] leading-snug text-zn-fainter'}>{note}</span>
  );
}

function Control({
  name,
  spec,
  value,
  onChange,
}: {
  /** o nome do campo: é ele que diz de que valores estamos falando */
  name: string;
  spec: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (spec.kind) {
    case 'literal':
      return (
        <span className="zn-num inline-flex h-8 items-center px-2 text-[12px] text-zn-fainter">
          {String(spec.value)}
        </span>
      );

    case 'number':
      return (
        <input
          type="number"
          className="zn-input zn-num h-8 w-24 text-[13px]"
          value={typeof value === 'number' ? value : 0}
          {...(spec.min === undefined ? {} : { min: spec.min })}
          {...(spec.max === undefined ? {} : { max: spec.max })}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      );

    case 'text':
      return (
        <input
          type="text"
          className="zn-input h-8 w-full max-w-88 text-[13px]"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'boolean':
      return (
        <input
          type="checkbox"
          className="mt-1.5 h-3.5 w-3.5 accent-[#e0a33c]"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      );

    case 'choice':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="zn-select h-8"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          >
            {spec.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {VALUE_NOTES[name] !== undefined && typeof value === 'string' && (
            <Note of={`${VALUE_NOTES[name]}${value}`} />
          )}
        </div>
      );

    case 'choices': {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {spec.options.map((option) => {
            const on = chosen.includes(option);
            return (
              <button
                key={option}
                type="button"
                className="zn-num h-7 cursor-pointer px-2 text-[10px] tracking-[0.06em]"
                style={{
                  border: `1px solid ${on ? ZN.gold : ZN.edge}`,
                  background: on ? '#1a1710' : ZN.panel,
                  color: on ? ZN.goldLight : ZN.edgeHi,
                }}
                onClick={() =>
                  onChange(on ? chosen.filter((item) => item !== option) : [...chosen, option])
                }
              >
                {option}
              </button>
            );
          })}
        </div>
      );
    }

    case 'group':
      return (
        <div className="border-l border-zn-edge pl-3">
          <FieldGroup
            fields={spec.fields}
            value={(value ?? {}) as Plain}
            onChange={(next) => onChange(next)}
          />
        </div>
      );

    case 'groups': {
      const items = Array.isArray(value) ? (value as Plain[]) : [];
      return <GroupList spec={spec} items={items} onChange={onChange} />;
    }
  }
}

function GroupList({
  spec,
  items,
  onChange,
}: {
  spec: Extract<FieldSpec, { kind: 'groups' }>;
  items: Plain[];
  onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={index} className="border border-zn-edge bg-zn-bar p-2.5">
          <FieldGroup
            fields={spec.fields}
            value={item}
            onChange={(next) =>
              onChange(items.map((other, position) => (position === index ? next : other)))
            }
          />
          <button
            type="button"
            className="zn-num mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-[10px] uppercase tracking-[0.1em] text-zn-fainter hover:text-zn-red-light"
            onClick={() => onChange(items.filter((_, position) => position !== index))}
          >
            {t('admin.removeItem')}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="zn-btn zn-btn-wire h-7 self-start px-3"
        onClick={() => onChange([...items, defaultFields(spec.fields)])}
      >
        +
      </button>
    </div>
  );
}

/**
 * Uma linha: nome do campo, a descrição dele, o interruptor de "existe" quando é
 * opcional, e o controle.
 */
function FieldRow({
  name,
  spec,
  value,
  onChange,
}: {
  name: string;
  spec: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const optional = isOptional(spec);
  const present = value !== undefined;
  const note = useNote(`vocab.field.${name}`);

  return (
    <div className="flex flex-col gap-1.5 border-t border-zn-line py-2 first:border-t-0 sm:flex-row sm:gap-3.5">
      <div className="flex w-56 shrink-0 items-start gap-2">
        {optional && (
          <input
            type="checkbox"
            title={name}
            className="mt-1 h-3 w-3 shrink-0 accent-[#e0a33c]"
            checked={present}
            onChange={(event) => onChange(event.target.checked ? defaultField(spec) : undefined)}
          />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className={`zn-num text-[11px] ${present ? 'text-zn-soft' : 'text-zn-fainter'}`}
          >
            {name}
          </span>
          {note && <span className="text-[11.5px] leading-snug text-zn-fainter">{note}</span>}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {present || !optional ? (
          <Control name={name} spec={spec} value={value} onChange={onChange} />
        ) : (
          <span className="zn-num text-[11px] text-zn-ghost">—</span>
        )}
      </div>
    </div>
  );
}

/** Todos os campos de um `FieldMap`, na ordem em que o descritor os declara. */
export function FieldGroup({
  fields,
  value,
  onChange,
}: {
  fields: FieldMap;
  value: Plain;
  onChange: (value: Plain) => void;
}) {
  return (
    <div className="flex flex-col">
      {Object.entries(fields).map(([name, spec]) => (
        <FieldRow
          key={name}
          name={name}
          spec={spec}
          value={value[name]}
          onChange={(next) => {
            const copy = { ...value };
            if (next === undefined) delete copy[name];
            else copy[name] = next;
            onChange(copy);
          }}
        />
      ))}
    </div>
  );
}
