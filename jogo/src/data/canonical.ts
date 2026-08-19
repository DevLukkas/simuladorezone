/**
 * Põe uma carta validada na forma canônica: mesma ordem de campos que o catálogo
 * escrito à mão, sem campo vazio sobrando e sem nada fora do vocabulário.
 *
 * Existe para o estúdio poder mandar o objeto na ordem que quiser e o arquivo sair
 * sempre igual — gravar duas vezes a mesma carta não pode produzir dois diffs. A
 * ordem dos campos dos blocos sai do descritor (`vocabulary.ts`), então acrescentar
 * um campo lá o coloca no lugar certo aqui também.
 */

import {
  ACTION_FIELDS,
  ACTIVATED_FIELDS,
  ACTIVATION_CONDITION_FIELDS,
  CARD_BLOCKS,
  CONTINUOUS_FIELDS,
  COST_FIELDS,
  SCENARIO_FIELDS,
  SUMMON_RULE_FIELDS,
  TRIGGERED_FIELDS,
  type BlockKind,
  type FieldMap,
} from './vocabulary.ts';
import type { Card, CardType } from './types.ts';

/** ordem em que os campos de identidade aparecem no catálogo */
const IDENTITY_ORDER = [
  'id',
  'type',
  'name',
  'race',
  'attack',
  'health',
  'keywords',
  'text',
  'element',
  'rarity',
  'img',
  'art',
  'edition',
  'ref',
  'author',
  'behaviorPending',
  'summonRule',
] as const;

const BLOCK_ORDER = [
  'effects',
  'triggeredAbilities',
  'activatedAbilities',
  'onEnter',
  'onAttach',
] as const;

type Plain = Record<string, unknown>;

const isObject = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** copia `value` seguindo a ordem e a forma do descritor, deixando de fora o ausente */
function byFields(value: unknown, fields: FieldMap, extra: readonly string[] = []): unknown {
  if (!isObject(value)) return value;
  const out: Plain = {};

  for (const key of extra) {
    if (key === 'type' && value.type !== undefined) out.type = value.type;
  }

  for (const [key, spec] of Object.entries(fields)) {
    const given = value[key];
    if (given === undefined) continue;
    if (spec.kind === 'group') out[key] = byFields(given, spec.fields);
    else if (spec.kind === 'groups' && Array.isArray(given)) {
      out[key] = given.map((item) => byFields(item, spec.fields));
    } else out[key] = given;
  }

  // campos com editor próprio, que não estão na tabela de campos
  for (const key of extra) {
    if (key === 'type' || value[key] === undefined) continue;
    out[key] = value[key];
  }

  return out;
}

const variant = (
  value: unknown,
  table: Record<string, FieldMap>,
  extra: readonly string[] = [],
): unknown => {
  if (!isObject(value)) return value;
  const fields = typeof value.type === 'string' ? table[value.type] : undefined;
  return fields ? byFields(value, fields, ['type', ...extra]) : value;
};

const action = (value: unknown): unknown => variant(value, ACTION_FIELDS, ['optional']);

function triggered(value: unknown): unknown {
  if (!isObject(value)) return value;
  const out = byFields(value, TRIGGERED_FIELDS) as Plain;
  if (value.action !== undefined) out.action = action(value.action);
  return out;
}

function activated(value: unknown): unknown {
  if (!isObject(value)) return value;
  const out = byFields(value, ACTIVATED_FIELDS) as Plain;
  if (value.cost !== undefined) out.cost = variant(value.cost, COST_FIELDS);
  if (value.condition !== undefined) {
    out.condition = byFields(value.condition, ACTIVATION_CONDITION_FIELDS);
  }
  if (value.action !== undefined) out.action = action(value.action);
  return out;
}

function block(value: unknown, kind: BlockKind): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (kind === 'action') return action(item);
    if (kind === 'triggered') return triggered(item);
    if (kind === 'activated') return activated(item);
    if (kind === 'continuous') return variant(item, CONTINUOUS_FIELDS);
    return variant(item, SCENARIO_FIELDS);
  });
}

/**
 * Recebe uma carta já aprovada por `validateCard` e devolve a mesma carta na forma
 * que vai para o arquivo. Não valida nada: campo fora do vocabulário é descartado
 * silenciosamente, por isso a validação vem antes.
 */
export function canonicalCard(card: Card): Card {
  const source = card as unknown as Plain;
  const out: Plain = {};

  for (const key of IDENTITY_ORDER) {
    const value = source[key];
    if (value === undefined) continue;
    out[key] = key === 'summonRule' ? byFields(value, SUMMON_RULE_FIELDS) : value;
  }

  const blocks = CARD_BLOCKS[card.type as CardType];
  for (const name of BLOCK_ORDER) {
    const kind = blocks[name];
    const value = source[name];
    if (!kind || value === undefined) continue;
    out[name] = block(value, kind);
  }

  return out as unknown as Card;
}
