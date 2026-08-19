import { defaultField, defaultFields } from '../../../data/defaults.ts';
import type { FieldMap, FieldSpec } from '../../../data/vocabulary.ts';
import { useTranslation } from '../../useTranslation.ts';

/**
 * O formulário do vocabulário: um `FieldSpec` vira um controle, sem nenhuma tela
 * escrita por tipo de ação. É isto que faz o estúdio acompanhar o motor sozinho —
 * campo novo em `types.ts` obriga uma linha em `vocabulary.ts` e aparece aqui.
 *
 * Os NOMES dos campos e dos valores não são traduzidos de propósito: `add_marker`,
 * `trigger_source`, `until_end_of_turn` são o vocabulário do motor, é assim que se
 * fala deles no `decisions.md` e nas cartas. Traduzir criaria um segundo idioma de
 * regras para o autor decorar. O que é chrome da tela, esse sim sai do i18n.
 */

type Plain = Record<string, unknown>;

const isOptional = (spec: FieldSpec): boolean =>
  'optional' in spec && spec.optional === true;

const BOX = 'rounded bg-slate-800 px-2 py-1 text-sm text-slate-100';

function Control({ spec, value, onChange }: {
  spec: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (spec.kind) {
    case 'literal':
      return <span className="text-sm text-slate-500">{String(spec.value)}</span>;

    case 'number':
      return (
        <input
          type="number"
          className={`${BOX} w-24`}
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
          className={`${BOX} w-64`}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'boolean':
      return (
        <input
          type="checkbox"
          className="h-4 w-4 accent-emerald-500"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      );

    case 'choice':
      return (
        <select
          className={BOX}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        >
          {spec.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );

    case 'choices': {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {spec.options.map((option) => {
            const on = chosen.includes(option);
            return (
              <button
                key={option}
                type="button"
                className={`rounded px-2 py-0.5 text-xs ${
                  on ? 'bg-emerald-800 text-slate-100' : 'bg-slate-800 text-slate-400'
                }`}
                onClick={() =>
                  onChange(
                    on ? chosen.filter((item) => item !== option) : [...chosen, option],
                  )
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
        <FieldGroup
          fields={spec.fields}
          value={(value ?? {}) as Plain}
          onChange={(next) => onChange(next)}
        />
      );

    case 'groups': {
      const items = Array.isArray(value) ? (value as Plain[]) : [];
      return <GroupList spec={spec} items={items} onChange={onChange} />;
    }
  }
}

function GroupList({ spec, items, onChange }: {
  spec: Extract<FieldSpec, { kind: 'groups' }>;
  items: Plain[];
  onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={index} className="rounded border border-slate-700 p-2">
          <FieldGroup
            fields={spec.fields}
            value={item}
            onChange={(next) =>
              onChange(items.map((other, position) => (position === index ? next : other)))
            }
          />
          <button
            type="button"
            className="mt-1 text-xs text-rose-400 hover:underline"
            onClick={() => onChange(items.filter((_, position) => position !== index))}
          >
            {t('admin.removeItem')}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
        onClick={() => onChange([...items, defaultFields(spec.fields)])}
      >
        +
      </button>
    </div>
  );
}

/** uma linha: nome do campo, o interruptor de "existe" quando é opcional, e o controle */
function FieldRow({ name, spec, value, onChange }: {
  name: string;
  spec: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const optional = isOptional(spec);
  const present = value !== undefined;

  return (
    <div className="flex items-start gap-2 py-0.5">
      <div className="flex w-52 shrink-0 items-center gap-1 pt-1">
        {optional && (
          <input
            type="checkbox"
            className="h-3 w-3 accent-sky-500"
            checked={present}
            onChange={(event) => onChange(event.target.checked ? defaultField(spec) : undefined)}
          />
        )}
        <span className={`font-mono text-xs ${present ? 'text-slate-300' : 'text-slate-600'}`}>
          {name}
        </span>
      </div>
      {present || !optional ? (
        <Control spec={spec} value={value} onChange={onChange} />
      ) : (
        <span className="pt-1 text-xs text-slate-600">—</span>
      )}
    </div>
  );
}

/** Todos os campos de um `FieldMap`, na ordem em que o descritor os declara. */
export function FieldGroup({ fields, value, onChange }: {
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
