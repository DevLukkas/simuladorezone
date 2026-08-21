/**
 * Validação estrutural de uma carta vinda de fora (o estúdio manda JSON; o servidor
 * é a autoridade, invariante nº 4). Toda a checagem dos blocos declarativos sai do
 * descritor de `vocabulary.ts` — não há lista de campos repetida aqui.
 *
 * O que sai daqui é DADO, não frase: `{ path, problem }`, com `problem` num conjunto
 * fechado que o cliente traduz (`admin.problem.*`). Invariante nº 8.
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
import {
  CARD_STATUSES,
  CARD_TYPES,
  EDITIONS,
  ELEMENTS,
  KEYWORDS,
  RACES,
  RARITIES,
  type Card,
  type CardType,
} from './types.ts';

export type ProblemCode =
  | 'missing'
  | 'unknown_field'
  | 'not_an_object'
  | 'not_a_list'
  | 'empty_list'
  | 'duplicated'
  | 'not_a_number'
  | 'not_an_integer'
  | 'out_of_range'
  | 'not_a_text'
  | 'empty_text'
  | 'not_a_boolean'
  | 'not_in_options'
  | 'wrong_literal'
  | 'unknown_type'
  | 'block_not_allowed'
  | 'needs_value_or_per_card';

export interface CardProblem {
  /** onde: "effects[0].value", "triggeredAbilities[1].action.target" */
  path: string;
  problem: ProblemCode;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

class Report {
  readonly problems: CardProblem[] = [];

  add(path: string, problem: ProblemCode): void {
    this.problems.push({ path, problem });
  }
}

const at = (path: string, key: string | number): string =>
  typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key;

// ---------------------------------------------------------------------------
// Campos, a partir do descritor
// ---------------------------------------------------------------------------

function checkField(value: unknown, spec: FieldMap[string], path: string, report: Report): void {
  switch (spec.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        report.add(path, 'not_a_number');
        return;
      }
      if (!Number.isInteger(value)) {
        report.add(path, 'not_an_integer');
        return;
      }
      const belowMin = spec.min !== undefined && value < spec.min;
      const aboveMax = spec.max !== undefined && value > spec.max;
      if (belowMin || aboveMax) report.add(path, 'out_of_range');
      return;
    }
    case 'text': {
      if (typeof value !== 'string') report.add(path, 'not_a_text');
      else if (!value.trim()) report.add(path, 'empty_text');
      return;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') report.add(path, 'not_a_boolean');
      return;
    }
    case 'literal': {
      if (value !== spec.value) report.add(path, 'wrong_literal');
      return;
    }
    case 'choice': {
      if (typeof value !== 'string') report.add(path, 'not_a_text');
      else if (!spec.options.includes(value)) report.add(path, 'not_in_options');
      return;
    }
    case 'choices': {
      if (!Array.isArray(value)) {
        report.add(path, 'not_a_list');
        return;
      }
      if (value.length === 0) report.add(path, 'empty_list');
      if (new Set(value).size !== value.length) report.add(path, 'duplicated');
      value.forEach((item, index) => {
        if (typeof item !== 'string') report.add(at(path, index), 'not_a_text');
        else if (!spec.options.includes(item)) report.add(at(path, index), 'not_in_options');
      });
      return;
    }
    case 'group': {
      checkFields(value, spec.fields, path, report);
      return;
    }
    case 'groups': {
      if (!Array.isArray(value)) {
        report.add(path, 'not_a_list');
        return;
      }
      if (value.length === 0) report.add(path, 'empty_list');
      value.forEach((item, index) => checkFields(item, spec.fields, at(path, index), report));
      return;
    }
  }
}

/**
 * Um valor tem de ter um valor fixo ou um contado por carta — sem nenhum dos dois a
 * ação existiria sem fazer nada. A regra sai do próprio descritor (os dois campos
 * opcionais lado a lado), então não precisa ser repetida por tipo de ação.
 */
const isOptional = (spec: FieldMap[string] | undefined): boolean =>
  spec !== undefined && 'optional' in spec && spec.optional === true;

const needsAmount = (fields: FieldMap): boolean =>
  isOptional(fields.value) && isOptional(fields.value_per_card);

function checkFields(
  value: unknown,
  fields: FieldMap,
  path: string,
  report: Report,
  extraKeys: readonly string[] = [],
): void {
  if (!isObject(value)) {
    report.add(path, 'not_an_object');
    return;
  }

  for (const [key, spec] of Object.entries(fields)) {
    const given = value[key];
    if (given === undefined) {
      if (!isOptional(spec)) report.add(at(path, key), 'missing');
      continue;
    }
    checkField(given, spec, at(path, key), report);
  }

  for (const key of Object.keys(value)) {
    if (key in fields || extraKeys.includes(key)) continue;
    report.add(at(path, key), 'unknown_field');
  }

  if (needsAmount(fields) && value.value === undefined && value.value_per_card === undefined) {
    report.add(path, 'needs_value_or_per_card');
  }
}

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

/** escolhe a tabela de campos pelo `type` do bloco e valida o resto contra ela */
function checkVariant(
  value: unknown,
  table: Record<string, FieldMap>,
  path: string,
  report: Report,
  extraKeys: readonly string[] = [],
): void {
  if (!isObject(value)) {
    report.add(path, 'not_an_object');
    return;
  }
  const kind = value.type;
  if (typeof kind !== 'string' || !(kind in table)) {
    report.add(at(path, 'type'), 'unknown_type');
    return;
  }
  checkFields(value, table[kind]!, path, report, ['type', ...extraKeys]);
}

const checkAction = (value: unknown, path: string, report: Report): void =>
  checkVariant(value, ACTION_FIELDS, path, report, ['optional']);

function checkTriggered(value: unknown, path: string, report: Report): void {
  if (!isObject(value)) {
    report.add(path, 'not_an_object');
    return;
  }
  checkFields(value, TRIGGERED_FIELDS, path, report, ['action']);
  if (value.action === undefined) report.add(at(path, 'action'), 'missing');
  else checkAction(value.action, at(path, 'action'), report);
}

function checkActivated(value: unknown, path: string, report: Report): void {
  if (!isObject(value)) {
    report.add(path, 'not_an_object');
    return;
  }
  checkFields(value, ACTIVATED_FIELDS, path, report, ['action', 'cost', 'condition']);

  if (value.action === undefined) report.add(at(path, 'action'), 'missing');
  else checkAction(value.action, at(path, 'action'), report);

  if (value.cost !== undefined) checkVariant(value.cost, COST_FIELDS, at(path, 'cost'), report);
  if (value.condition !== undefined) {
    checkFields(value.condition, ACTIVATION_CONDITION_FIELDS, at(path, 'condition'), report);
  }
}

function checkBlock(value: unknown, kind: BlockKind, path: string, report: Report): void {
  if (!Array.isArray(value)) {
    report.add(path, 'not_a_list');
    return;
  }
  if (value.length === 0) report.add(path, 'empty_list');

  value.forEach((item, index) => {
    const where = at(path, index);
    if (kind === 'action') checkAction(item, where, report);
    else if (kind === 'triggered') checkTriggered(item, where, report);
    else if (kind === 'activated') checkActivated(item, where, report);
    else if (kind === 'continuous') checkVariant(item, CONTINUOUS_FIELDS, where, report);
    else checkVariant(item, SCENARIO_FIELDS, where, report);
  });
}

// ---------------------------------------------------------------------------
// A carta inteira
// ---------------------------------------------------------------------------

const IDENTITY_KEYS = [
  'id',
  'type',
  'name',
  'text',
  'element',
  'rarity',
  'edition',
  'img',
  'art',
  'ref',
  'author',
  'behaviorPending',
  'status',
] as const;

const optionalText = (value: unknown, path: string, report: Report): void => {
  if (typeof value !== 'string') report.add(path, 'not_a_text');
  else if (!value.trim()) report.add(path, 'empty_text');
};

function checkIdentity(card: Record<string, unknown>, report: Report): void {
  if (typeof card.id !== 'number' || !Number.isInteger(card.id) || card.id < 1) {
    report.add('id', 'not_an_integer');
  }
  optionalText(card.name, 'name', report);
  if (card.text !== null) optionalText(card.text, 'text', report);

  if (typeof card.element !== 'string' || !ELEMENTS.includes(card.element as never)) {
    report.add('element', 'not_in_options');
  }
  if (typeof card.rarity !== 'string' || !RARITIES.includes(card.rarity as never)) {
    report.add('rarity', 'not_in_options');
  }
  if (typeof card.edition !== 'string' || !EDITIONS.includes(card.edition as never)) {
    report.add('edition', 'not_in_options');
  }

  for (const key of ['img', 'art', 'ref', 'author'] as const) {
    if (card[key] !== undefined) optionalText(card[key], key, report);
  }
  if (card.behaviorPending !== undefined && card.behaviorPending !== true) {
    report.add('behaviorPending', 'wrong_literal');
  }
  // ausente é `published` (decisão nº 41): o campo só é conferido quando existe
  if (card.status !== undefined) {
    if (typeof card.status !== 'string' || !CARD_STATUSES.includes(card.status as never)) {
      report.add('status', 'not_in_options');
    }
  }
}

function checkCreature(card: Record<string, unknown>, report: Report): void {
  if (typeof card.race !== 'string' || !RACES.includes(card.race as never)) {
    report.add('race', 'not_in_options');
  }
  for (const key of ['attack', 'health'] as const) {
    const value = card[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      report.add(key, 'not_an_integer');
    }
  }
  if (card.keywords !== undefined) {
    checkField(card.keywords, { kind: 'choices', options: KEYWORDS }, 'keywords', report);
  }
  if (card.summonRule !== undefined) {
    checkFields(card.summonRule, SUMMON_RULE_FIELDS, 'summonRule', report);
  }
}

/**
 * Valida uma carta candidata. Devolve lista vazia quando ela pode ser gravada no
 * catálogo — o `as Card` do chamador só é seguro depois disto.
 */
export function validateCard(value: unknown): CardProblem[] {
  const report = new Report();

  if (!isObject(value)) {
    report.add('', 'not_an_object');
    return report.problems;
  }

  const type = value.type;
  if (typeof type !== 'string' || !CARD_TYPES.includes(type as CardType)) {
    report.add('type', 'unknown_type');
    return report.problems;
  }

  checkIdentity(value, report);

  const isCreature = type === 'creature';
  if (isCreature) checkCreature(value, report);

  const blocks = CARD_BLOCKS[type as CardType];
  for (const [name, kind] of Object.entries(blocks)) {
    const block = value[name];
    if (block === undefined) {
      // só o cenário não existe sem efeito: sem ele a carta não faz nada em campo
      if (type === 'scenario' && name === 'effects') report.add(name, 'missing');
      continue;
    }
    checkBlock(block, kind, name, report);
  }

  const allowed = new Set<string>([
    ...IDENTITY_KEYS,
    ...Object.keys(blocks),
    ...(isCreature ? ['race', 'attack', 'health', 'keywords', 'summonRule'] : []),
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) report.add(key, 'unknown_field');
  }

  return report.problems;
}

/** açúcar para quem já validou e quer o tipo estreito */
export const asCard = (value: unknown): Card => value as Card;
