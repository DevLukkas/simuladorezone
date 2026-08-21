import {
  ACTION_FIELDS,
  ACTION_TYPES,
  ACTIVATED_FIELDS,
  ACTIVATION_CONDITION_FIELDS,
  CARD_BLOCKS,
  CONTINUOUS_FIELDS,
  CONTINUOUS_TYPES,
  COST_FIELDS,
  COST_TYPES,
  SCENARIO_FIELDS,
  SCENARIO_TYPES,
  TRIGGERED_FIELDS,
  type BlockKind,
  type BlockName,
  type FieldMap,
} from '../../../data/vocabulary.ts';
import {
  defaultAction,
  defaultActivated,
  defaultContinuous,
  defaultCost,
  defaultFields,
  defaultScenarioEffect,
  defaultTriggered,
} from '../../../data/defaults.ts';
import type { Card, CardType } from '../../../data/types.ts';
import { FieldGroup, Note } from './FieldInput.tsx';
import { useTranslation } from '../../useTranslation.ts';

/**
 * Os blocos declarativos da carta: gatilhos, habilidades ativadas, efeitos
 * contínuos, entrada em campo e anexo.
 *
 * Que blocos aparecem sai de `CARD_BLOCKS` — é o descritor que sabe que `effects`
 * quer dizer efeito contínuo na criatura, lista de ações no comando e gatilho de
 * cenário no cenário. Trocar o tipo da carta troca os blocos sem nenhum `if` aqui.
 *
 * Cada bloco, cada tipo escolhido e cada campo trazem a descrição do que fazem
 * (decisão nº 41): o identificador do motor continua cru, a explicação vem junto.
 */

type Plain = Record<string, unknown>;

const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const listOf = (value: unknown): Plain[] => (Array.isArray(value) ? (value as Plain[]) : []);

// ---------------------------------------------------------------------------
// União discriminada: escolhe o `type` e o formulário troca junto
// ---------------------------------------------------------------------------

function VariantEditor({
  label,
  notes,
  types,
  table,
  value,
  onChange,
  make,
}: {
  label: string;
  /** prefixo da chave que descreve o tipo escolhido: `vocab.action.`, `vocab.cost.`… */
  notes: string;
  types: readonly string[];
  table: Record<string, FieldMap>;
  value: Plain;
  onChange: (value: Plain) => void;
  make: (type: string) => Plain;
}) {
  const type = typeof value.type === 'string' ? value.type : types[0]!;
  const fields = table[type] ?? {};

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="zn-label tracking-[0.18em] uppercase">{label}</span>
        <select
          className="zn-select h-8 max-w-full"
          value={type}
          onChange={(event) => onChange(make(event.target.value))}
        >
          {types.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {/* o que aquele identificador FAZ, na linha de baixo e sempre à vista */}
      <Note of={`${notes}${type}`} className="text-[12.5px] leading-snug text-zn-dim" />
      <FieldGroup fields={fields} value={value} onChange={(next) => onChange(next)} />
    </div>
  );
}

function ActionEditor({ value, onChange }: { value: Plain; onChange: (value: Plain) => void }) {
  const { t } = useTranslation();

  return (
    <div className="border border-zn-edge bg-zn-bar p-3">
      <VariantEditor
        label={t('admin.actionType')}
        notes="vocab.action."
        types={ACTION_TYPES}
        table={ACTION_FIELDS}
        value={value}
        onChange={onChange}
        make={(type) => defaultAction(type as never) as unknown as Plain}
      />
      <label className="mt-2 flex items-center gap-2 text-[12px] text-zn-dim">
        <input
          type="checkbox"
          className="h-3 w-3 accent-[#e0a33c]"
          checked={value.optional === true}
          onChange={(event) => {
            const next = { ...value };
            if (event.target.checked) next.optional = true;
            else delete next.optional;
            onChange(next);
          }}
        />
        {t('admin.actionOptional')}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Um item de bloco, conforme a natureza dele
// ---------------------------------------------------------------------------

function BlockItem({
  kind,
  value,
  onChange,
}: {
  kind: BlockKind;
  value: Plain;
  onChange: (value: Plain) => void;
}) {
  const { t } = useTranslation();

  if (kind === 'action') return <ActionEditor value={value} onChange={onChange} />;

  if (kind === 'continuous') {
    return (
      <VariantEditor
        label="type"
        notes="vocab.continuous."
        types={CONTINUOUS_TYPES}
        table={CONTINUOUS_FIELDS}
        value={value}
        onChange={onChange}
        make={(type) => defaultContinuous(type as never) as unknown as Plain}
      />
    );
  }

  if (kind === 'scenario') {
    return (
      <VariantEditor
        label="type"
        notes="vocab.scenario."
        types={SCENARIO_TYPES}
        table={SCENARIO_FIELDS}
        value={value}
        onChange={onChange}
        make={(type) => defaultScenarioEffect(type as never) as unknown as Plain}
      />
    );
  }

  if (kind === 'triggered') {
    return (
      <div className="flex flex-col gap-2.5">
        <FieldGroup fields={TRIGGERED_FIELDS} value={value} onChange={onChange} />
        <ActionEditor
          value={isPlain(value.action) ? value.action : {}}
          onChange={(action) => onChange({ ...value, action })}
        />
      </div>
    );
  }

  // activated: envelope + custo opcional + condição opcional + ação
  const cost = isPlain(value.cost) ? value.cost : null;
  const condition = isPlain(value.condition) ? value.condition : null;

  const toggle = (key: 'cost' | 'condition', on: boolean) => {
    const next = { ...value };
    if (!on) delete next[key];
    else {
      next[key] =
        key === 'cost' ? defaultCost('discard_self') : defaultFields(ACTIVATION_CONDITION_FIELDS);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <FieldGroup fields={ACTIVATED_FIELDS} value={value} onChange={onChange} />

      <label className="flex items-center gap-2 text-[12px] text-zn-dim">
        <input
          type="checkbox"
          className="h-3 w-3 accent-[#e0a33c]"
          checked={cost !== null}
          onChange={(event) => toggle('cost', event.target.checked)}
        />
        {cost === null ? t('admin.noCost') : t('admin.cost')}
      </label>
      {cost !== null && (
        <VariantEditor
          label="cost"
          notes="vocab.cost."
          types={COST_TYPES}
          table={COST_FIELDS}
          value={cost}
          onChange={(next) => onChange({ ...value, cost: next })}
          make={(type) => defaultCost(type as never) as unknown as Plain}
        />
      )}

      <label className="flex items-center gap-2 text-[12px] text-zn-dim">
        <input
          type="checkbox"
          className="h-3 w-3 accent-[#e0a33c]"
          checked={condition !== null}
          onChange={(event) => toggle('condition', event.target.checked)}
        />
        {condition === null ? t('admin.noCondition') : t('admin.condition')}
      </label>
      {condition !== null && (
        <FieldGroup
          fields={ACTIVATION_CONDITION_FIELDS}
          value={condition}
          onChange={(next) => onChange({ ...value, condition: next })}
        />
      )}

      <ActionEditor
        value={isPlain(value.action) ? value.action : {}}
        onChange={(action) => onChange({ ...value, action })}
      />
    </div>
  );
}

/** o item que nasce ao clicar em "+" naquele bloco */
function freshItem(kind: BlockKind, index: number): Plain {
  if (kind === 'action') return defaultAction('draw') as unknown as Plain;
  if (kind === 'continuous') return defaultContinuous('modify_stat') as unknown as Plain;
  if (kind === 'scenario') {
    return defaultScenarioEffect('on_enemy_destroyed_in_battle_draw') as unknown as Plain;
  }
  if (kind === 'triggered') return defaultTriggered(`ability_${index}`) as unknown as Plain;
  return defaultActivated(`ability_${index}`) as unknown as Plain;
}

// ---------------------------------------------------------------------------
// Os blocos da carta
// ---------------------------------------------------------------------------

export function EffectBuilder({
  card,
  onChange,
}: {
  card: Card;
  onChange: (card: Card) => void;
}) {
  const { t } = useTranslation();
  const source = card as unknown as Plain;
  const blocks = CARD_BLOCKS[card.type as CardType];

  const setBlock = (name: BlockName, items: Plain[]) => {
    const next = { ...source };
    if (items.length) next[name] = items;
    else delete next[name];
    onChange(next as unknown as Card);
  };

  return (
    <div className="flex flex-col gap-3.5">
      {(Object.entries(blocks) as [BlockName, BlockKind][]).map(([name, kind]) => {
        const items = listOf(source[name]);
        return (
          <section key={name} className="border border-zn-edge bg-zn-bar p-3.5">
            <header className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="zn-num flex flex-wrap items-baseline gap-2 text-[12.5px] text-zn-gold-light">
                  {name}
                  <span
                    className="zn-label tracking-[0.14em] uppercase"
                    title={t(`vocab.kind.${kind}`)}
                  >
                    {kind}
                  </span>
                </span>
                <Note
                  of={`vocab.block.${name}`}
                  className="text-[12px] leading-snug text-zn-fainter"
                />
                <Note of={`vocab.kind.${kind}`} className="text-[12px] leading-snug text-zn-dim" />
              </div>
              <button
                type="button"
                className="zn-btn zn-btn-wire h-7 shrink-0 px-3"
                onClick={() => setBlock(name, [...items, freshItem(kind, items.length + 1)])}
              >
                {t('admin.addTo', { block: name })}
              </button>
            </header>

            {items.length === 0 && (
              <p className="zn-num mt-2.5 text-[10px] uppercase tracking-[0.12em] text-zn-ghost">
                {t('admin.empty')}
              </p>
            )}

            <div className="mt-3 flex flex-col gap-2.5">
              {items.map((item, index) => (
                <div key={index} className="border border-zn-line p-2.5">
                  <BlockItem
                    kind={kind}
                    value={item}
                    onChange={(next) =>
                      setBlock(
                        name,
                        items.map((other, position) => (position === index ? next : other)),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="zn-num mt-2 cursor-pointer border-0 bg-transparent p-0 text-[10px] uppercase tracking-[0.12em] text-zn-fainter hover:text-zn-red-light"
                    onClick={() =>
                      setBlock(
                        name,
                        items.filter((_, position) => position !== index),
                      )
                    }
                  >
                    {t('admin.removeItem')}
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
