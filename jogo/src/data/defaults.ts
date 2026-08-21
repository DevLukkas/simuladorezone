/**
 * Como nasce cada peça do vocabulário: o valor inicial de um campo, de um efeito,
 * de uma habilidade e de uma carta inteira.
 *
 * O estúdio precisa poder oferecer QUALQUER ação da união sem que alguém escreva
 * um formulário por ação — escolhida a ação, é daqui que sai o objeto já com os
 * campos obrigatórios preenchidos e os fixos no valor certo. Como tudo sai do
 * descritor, ação nova no motor já nasce montável.
 */

import {
  ACTION_FIELDS,
  ACTIVATED_FIELDS,
  CARD_BLOCKS,
  CONTINUOUS_FIELDS,
  COST_FIELDS,
  SCENARIO_FIELDS,
  TRIGGERED_FIELDS,
  type FieldMap,
  type FieldSpec,
} from './vocabulary.ts';
import type {
  Action,
  ActionKind,
  ActivatedAbility,
  ActivationCost,
  Card,
  CardType,
  ContinuousEffect,
  ScenarioEffect,
  TriggeredAbility,
} from './types.ts';

export function defaultField(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case 'number':
      return spec.min ?? 0;
    case 'text':
      return '';
    case 'boolean':
      return false;
    case 'literal':
      return spec.value;
    case 'choice':
      return spec.options[0] ?? '';
    case 'choices':
      return spec.options[0] === undefined ? [] : [spec.options[0]];
    case 'group':
      return defaultFields(spec.fields);
    case 'groups':
      return [defaultFields(spec.fields)];
  }
}

const isOptional = (spec: FieldSpec | undefined): boolean =>
  spec !== undefined && 'optional' in spec && spec.optional === true;

/** Só o que é obrigatório entra; o opcional o autor liga quando quiser. */
export function defaultFields(fields: FieldMap): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(fields)) {
    if (isOptional(spec)) continue;
    out[key] = defaultField(spec);
  }

  // os dois são opcionais, mas um deles é obrigatório na prática (ver o validador)
  if (isOptional(fields.value) && isOptional(fields.value_per_card) && fields.value) {
    out.value = defaultField(fields.value);
  }

  return out;
}

const variant = <T>(type: string, table: Record<string, FieldMap>): T =>
  ({ type, ...defaultFields(table[type] ?? {}) }) as T;

export const defaultAction = (type: ActionKind['type']): Action =>
  variant<Action>(type, ACTION_FIELDS);

export const defaultContinuous = (type: ContinuousEffect['type']): ContinuousEffect =>
  variant<ContinuousEffect>(type, CONTINUOUS_FIELDS);

export const defaultScenarioEffect = (type: ScenarioEffect['type']): ScenarioEffect =>
  variant<ScenarioEffect>(type, SCENARIO_FIELDS);

export const defaultCost = (type: ActivationCost['type']): ActivationCost =>
  variant<ActivationCost>(type, COST_FIELDS);

export const defaultTriggered = (id: string): TriggeredAbility =>
  ({ ...defaultFields(TRIGGERED_FIELDS), id, action: defaultAction('draw') }) as TriggeredAbility;

export const defaultActivated = (id: string): ActivatedAbility =>
  ({ ...defaultFields(ACTIVATED_FIELDS), id, action: defaultAction('draw') }) as ActivatedAbility;

// ---------------------------------------------------------------------------
// A carta
// ---------------------------------------------------------------------------

/** campos que só existem em criatura, com o valor de partida de cada um */
const CREATURE_START = { race: 'Beast', attack: 1, health: 1 } as const;

export function blankCard(id: number, type: CardType): Card {
  const base = {
    id,
    type,
    name: '',
    text: '',
    element: 'neutral',
    rarity: 'common',
    edition: 'Quatro Elementos',
    // carta nasce fora do jogo e sobe a esteira quando o autor mandar (decisão nº 41)
    status: 'draft',
  };

  if (type === 'creature') return { ...base, ...CREATURE_START } as unknown as Card;
  // cenário sem efeito não é carta válida: já nasce com um
  if (type === 'scenario') {
    return {
      ...base,
      effects: [defaultScenarioEffect('on_enemy_destroyed_in_battle_draw')],
    } as unknown as Card;
  }
  return base as unknown as Card;
}

/**
 * Troca o tipo mantendo a identidade. Bloco que não vale no tipo novo é DESCARTADO
 * — `effects` quer dizer coisas diferentes em cada tipo (contínuo, ação, cenário) e
 * carregar o antigo produziria uma carta que não valida.
 */
export function retype(card: Card, type: CardType): Card {
  if (card.type === type) return card;

  const source = card as unknown as Record<string, unknown>;
  const next = blankCard(card.id, type) as unknown as Record<string, unknown>;

  for (const key of ['name', 'text', 'element', 'rarity', 'edition', 'img', 'art', 'ref', 'author', 'status']) {
    if (source[key] !== undefined) next[key] = source[key];
  }
  if (source.behaviorPending === true) next.behaviorPending = true;

  if (type === 'creature') {
    for (const key of ['race', 'attack', 'health', 'keywords', 'summonRule']) {
      if (source[key] !== undefined) next[key] = source[key];
    }
  }

  // gatilho é o único bloco cujo conteúdo é o mesmo nos dois tipos
  const blocks = CARD_BLOCKS[type];
  if (blocks.triggeredAbilities && source.triggeredAbilities !== undefined) {
    next.triggeredAbilities = source.triggeredAbilities;
  }

  return next as unknown as Card;
}
