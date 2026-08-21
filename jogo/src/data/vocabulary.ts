/**
 * O vocabulário de efeitos descrito como DADO: para cada tipo de gatilho, efeito
 * contínuo e ação, quais campos existem e de que natureza são.
 *
 * Serve a dois consumidores que não podem discordar — o estúdio de cartas monta o
 * formulário a partir daqui (nada de tela escrita à mão por tipo de ação) e o
 * servidor valida com isto antes de gravar no catálogo (o cliente não é confiável).
 *
 * O que amarra este arquivo a `types.ts` é o tipo `SpecFor`, que exige UM campo
 * descrito para cada propriedade da variante: ação nova, campo novo ou campo
 * renomeado em `types.ts` e este arquivo para de compilar. É o mesmo mecanismo do
 * invariante nº 5 — o compilador acusa efeito sem handler — aplicado à autoria.
 *
 * Os grupos aninhados (`summon`, `debuff`, `condition`, `conditionals`) usam
 * `groupOf<...>` justamente para não escaparem dessa checagem.
 */

import {
  ACTION_TARGETS,
  ELEMENTS,
  KEYWORDS,
  RACES,
  RARITIES,
  STAT_NAMES,
  TRIGGER_TYPES,
} from './types.ts';
import type {
  ActionKind,
  ActionTarget,
  ActivatedAbility,
  ActivationCondition,
  ActivationCost,
  CardFilter,
  CardType,
  ContinuousEffect,
  CreatureCard,
  CreatureToken,
  PerCardCount,
  ScenarioEffect,
  TriggeredAbility,
  TriggerType,
} from './types.ts';
/** só o tipo: `src/data` não depende do i18n em tempo de execução */
import type { TextKey } from '../i18n/keys.ts';

// ---------------------------------------------------------------------------
// A gramática do descritor
// ---------------------------------------------------------------------------

export type FieldSpec =
  | { kind: 'number'; optional?: true; min?: number; max?: number }
  | { kind: 'text'; optional?: true }
  | { kind: 'boolean'; optional?: true }
  /** valor que o tipo fixa (`target: 'your_field'`): não se escolhe, se confere */
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'choice'; options: readonly string[]; optional?: true }
  | { kind: 'choices'; options: readonly string[]; optional?: true }
  | { kind: 'group'; fields: FieldMap; optional?: true }
  | { kind: 'groups'; fields: FieldMap; optional?: true };

export type FieldMap = { readonly [key: string]: FieldSpec };

/**
 * Um campo descrito para CADA propriedade da variante, menos o `type` que a
 * discrimina. O `-?` é o que torna a cobertura obrigatória: campo opcional em
 * `types.ts` continua tendo de aparecer aqui, marcado `optional`.
 */
type SpecFor<T> = { readonly [K in Exclude<keyof T, 'type'>]-?: FieldSpec };

const groupOf = <T>(fields: SpecFor<T>, optional?: true): FieldSpec =>
  optional ? { kind: 'group', fields, optional } : { kind: 'group', fields };

const groupsOf = <T>(fields: SpecFor<T>, optional?: true): FieldSpec =>
  optional ? { kind: 'groups', fields, optional } : { kind: 'groups', fields };

/** atalho para falar de uma variante da união pelo seu `type` */
type Act<K extends ActionKind['type']> = Extract<ActionKind, { type: K }>;

// ---------------------------------------------------------------------------
// Formas reaproveitadas
// ---------------------------------------------------------------------------

const CARD_FILTER: SpecFor<CardFilter> = {
  race: { kind: 'choice', options: RACES, optional: true },
  element: { kind: 'choice', options: ELEMENTS, optional: true },
  name: { kind: 'text', optional: true },
  name_includes: { kind: 'text', optional: true },
};

const PER_CARD_COUNT: SpecFor<PerCardCount> = {
  zone: { kind: 'choice', options: ['your_field', 'your_discard', 'target_attachments'] },
  card_type: { kind: 'choice', options: ['creature'], optional: true },
  race: { kind: 'choice', options: RACES, optional: true },
  name_includes: { kind: 'text', optional: true },
  exclude_self: { kind: 'boolean', optional: true },
  exclude_holder: { kind: 'boolean', optional: true },
  value: { kind: 'number' },
};

const CREATURE_TOKEN: SpecFor<CreatureToken> = {
  id: { kind: 'text' },
  name: { kind: 'text' },
  race: { kind: 'choice', options: RACES },
  attack: { kind: 'number', min: 0 },
  health: { kind: 'number', min: 0 },
  element: { kind: 'choice', options: ELEMENTS },
  rarity: { kind: 'choice', options: RARITIES },
  color: { kind: 'number', optional: true },
};

const filter = (optional?: true): FieldSpec => groupOf<CardFilter>(CARD_FILTER, optional);
const perCard = (optional?: true): FieldSpec => groupOf<PerCardCount>(PER_CARD_COUNT, optional);
const target: FieldSpec = { kind: 'choice', options: ACTION_TARGETS };
const stats: FieldSpec = { kind: 'choices', options: STAT_NAMES };

// ---------------------------------------------------------------------------
// O QUE acontece: uma entrada por variante de `ActionKind`
// ---------------------------------------------------------------------------

export const ACTION_FIELDS: {
  readonly [K in ActionKind['type']]: SpecFor<Act<K>>;
} = {
  add_marker: {
    target,
    stats,
    value: { kind: 'number', optional: true },
    value_per_card: perCard(true),
  },
  modify_stats: {
    target,
    filter: filter(true),
    stats,
    value: { kind: 'number', optional: true },
    value_per_card: perCard(true),
    exclude_source: { kind: 'boolean', optional: true },
    duration: { kind: 'choice', options: ['until_end_of_turn'] },
  },
  swap_stats: {
    target,
    filter: filter(true),
    duration: { kind: 'choice', options: ['until_end_of_turn', 'while_element_changed'] },
    return_attachment_to_hand: { kind: 'boolean', optional: true },
  },
  change_element: {
    target,
    filter: filter(true),
    choose: { kind: 'choices', options: ELEMENTS, optional: true },
    duration: { kind: 'choice', options: ['until_end_of_turn', 'while_attached', 'permanent'] },
  },
  deal_damage: {
    target,
    damage: { kind: 'number', min: 0 },
  },
  delayed_damage: {
    target,
    damage: { kind: 'number', min: 0 },
    when: { kind: 'literal', value: 'end_of_next_turn' },
  },
  destroy: { target },
  return_to_hand: { target },
  prevent_attack: {
    target,
    duration: { kind: 'choice', options: ['this_turn', 'next_turn'] },
  },
  prevent_being_targeted: {
    target,
    duration: { kind: 'literal', value: 'this_turn' },
  },
  discard_self_to_prevent_attack: { filter: filter(true) },
  force_attack: { target, filter: filter(true) },
  summon_token: { token: groupOf<CreatureToken>(CREATURE_TOKEN) },
  summon_from_deck: {
    filter: filter(),
    count: { kind: 'number', min: 1 },
    can_attack_this_turn: { kind: 'boolean', optional: true },
  },
  summon_from_discard: {
    filter: filter(),
    count: { kind: 'number', min: 1 },
  },
  special_summon_over_ally: { filter: filter() },
  sacrifice_then_summon_from_deck: {
    target,
    summon: groupOf<Act<'sacrifice_then_summon_from_deck'>['summon']>({
      count: { kind: 'number', min: 1 },
      card_type: { kind: 'literal', value: 'creature' },
      race: { kind: 'choice', options: RACES, optional: true },
      max_attack: { kind: 'number', optional: true },
      can_attack_this_turn: { kind: 'boolean', optional: true },
    }),
  },
  draw: { count: { kind: 'number', min: 1 } },
  draw_then_discard: {
    draw: { kind: 'number', min: 0 },
    discard: { kind: 'number', min: 0 },
  },
  discard_hand_then_draw: {},
  opponent_discards_at_random: { count: { kind: 'number', min: 1 } },
  discard_from_hand_then_search_deck: {
    discard: filter(),
    search: filter(),
  },
  shuffle_discarded_creature_then_debuff: {
    discardFilter: filter(),
    debuff: groupOf<Act<'shuffle_discarded_creature_then_debuff'>['debuff']>({
      stat: { kind: 'choice', options: STAT_NAMES },
      value_from: { kind: 'literal', value: 'shuffled_card_attack' },
      duration: { kind: 'literal', value: 'until_end_of_turn' },
    }),
  },
  reveal_opponent_hand_then_shuffle_one: {
    reveal: { kind: 'number', min: 1 },
    choose: { kind: 'number', min: 1 },
  },
  mill_then_gain_health_per_element: {
    mill: { kind: 'number', min: 1 },
    value: { kind: 'number' },
  },
};

export const ACTION_TYPES = Object.keys(ACTION_FIELDS) as ActionKind['type'][];

// ---------------------------------------------------------------------------
// Efeitos contínuos e de cenário
// ---------------------------------------------------------------------------

export const CONTINUOUS_FIELDS: {
  readonly [K in ContinuousEffect['type']]: SpecFor<Extract<ContinuousEffect, { type: K }>>;
} = {
  aura_modify_stat: {
    target: { kind: 'literal', value: 'your_field' },
    filter: filter(true),
    stats,
    value: { kind: 'number' },
    exclude_source: { kind: 'boolean', optional: true },
  },
  modify_stat: {
    target: { kind: 'literal', value: 'host' },
    stat: { kind: 'choice', options: STAT_NAMES },
    value: { kind: 'number', optional: true },
    value_per_card: perCard(true),
    conditionals: groupsOf<{ if: CardFilter; value: number }>(
      { if: filter(), value: { kind: 'number' } },
      true,
    ),
    condition: groupOf<{ zone: 'your_field'; count_same_element: number }>(
      {
        zone: { kind: 'literal', value: 'your_field' },
        count_same_element: { kind: 'number', min: 1 },
      },
      true,
    ),
  },
  reduce_combat_damage_taken: {
    target: { kind: 'choice', options: ['allies', 'host'] },
    filter: filter(true),
    value: { kind: 'number' },
    exclude_source: { kind: 'boolean', optional: true },
    once_per_turn: { kind: 'boolean', optional: true },
  },
  grant_keyword: {
    target: { kind: 'literal', value: 'host' },
    keyword: { kind: 'choice', options: KEYWORDS },
  },
  cannot_be_attacked_by_creatures_with_min_defense: {
    target: { kind: 'literal', value: 'host' },
    min_defense: { kind: 'number', min: 0 },
  },
};

export const CONTINUOUS_TYPES = Object.keys(CONTINUOUS_FIELDS) as ContinuousEffect['type'][];

export const SCENARIO_FIELDS: {
  readonly [K in ScenarioEffect['type']]: SpecFor<Extract<ScenarioEffect, { type: K }>>;
} = {
  on_enemy_destroyed_in_battle_draw: {
    oncePerTurn: { kind: 'literal', value: true },
    requiresYourCreature: filter(true),
    targetOwner: { kind: 'literal', value: 'enemy' },
    value: { kind: 'number', min: 1 },
  },
  on_ally_sent_to_discard_buff_ally: {
    when: filter(),
    target: filter(),
    stats,
    value: { kind: 'number' },
    duration: { kind: 'literal', value: 'until_end_of_turn' },
  },
};

export const SCENARIO_TYPES = Object.keys(SCENARIO_FIELDS) as ScenarioEffect['type'][];

// ---------------------------------------------------------------------------
// Habilidades: o envelope em volta da ação
// ---------------------------------------------------------------------------

/** tudo da habilidade de gatilho menos a ação, que tem editor próprio */
export const TRIGGERED_FIELDS: SpecFor<Omit<TriggeredAbility, 'action'>> = {
  id: { kind: 'text' },
  trigger: { kind: 'choice', options: TRIGGER_TYPES },
  filter: filter(true),
  priority: { kind: 'number', optional: true },
  attachedName: { kind: 'text', optional: true },
  count: { kind: 'number', optional: true },
};

export const ACTIVATED_FIELDS: SpecFor<Omit<ActivatedAbility, 'action' | 'cost' | 'condition'>> = {
  id: { kind: 'text' },
  timing: { kind: 'choice', options: ['once_per_turn'], optional: true },
  source: { kind: 'choice', options: ['field_creature', 'hand', 'attached_card'] },
};

export const ACTIVATION_CONDITION_FIELDS: SpecFor<ActivationCondition> = {
  active_player: { kind: 'choice', options: ['opponent'], optional: true },
  attached_creature_race: { kind: 'choice', options: RACES, optional: true },
};

export const COST_FIELDS: {
  readonly [K in ActivationCost['type']]: SpecFor<Extract<ActivationCost, { type: K }>>;
} = {
  destroy_attachment: { name_includes: { kind: 'text' } },
  discard_self: {},
  sacrifice_self: {},
};

export const COST_TYPES = Object.keys(COST_FIELDS) as ActivationCost['type'][];

export const SUMMON_RULE_FIELDS: SpecFor<NonNullable<CreatureCard['summonRule']>> = {
  normal: { kind: 'boolean' },
};

// ---------------------------------------------------------------------------
// Que blocos declarativos cada tipo de carta aceita
// ---------------------------------------------------------------------------

/**
 * `effects` significa coisas diferentes conforme o tipo da carta — contínuo na
 * criatura e no anexo, lista de ações no comando, gatilho de cenário no cenário.
 * É por isso que o bloco é descrito aqui, e não por nome.
 */
export type BlockKind = 'continuous' | 'scenario' | 'action' | 'triggered' | 'activated';

export type BlockName =
  | 'effects'
  | 'triggeredAbilities'
  | 'activatedAbilities'
  | 'onEnter'
  | 'onAttach';

export const CARD_BLOCKS: Record<CardType, Partial<Record<BlockName, BlockKind>>> = {
  creature: {
    effects: 'continuous',
    triggeredAbilities: 'triggered',
    activatedAbilities: 'activated',
    onEnter: 'action',
  },
  ability: { effects: 'continuous', triggeredAbilities: 'triggered', onAttach: 'action' },
  item: {
    effects: 'continuous',
    triggeredAbilities: 'triggered',
    activatedAbilities: 'activated',
    onAttach: 'action',
  },
  command: { effects: 'action' },
  scenario: { effects: 'scenario' },
};

// ---------------------------------------------------------------------------
// Cobertura das descrições
// ---------------------------------------------------------------------------

/**
 * O estúdio mostra o identificador CRU (`add_marker`, `until_end_of_turn`) e a
 * descrição do que ele faz ao lado, que sai do dicionário em `vocab.*`.
 *
 * Estas asserções são o que impede a descrição de ficar para trás do motor: ação,
 * gatilho, efeito contínuo, custo ou alvo novo sem a chave correspondente em
 * `pt-BR.ts` e o projeto NÃO COMPILA — o mesmo acordo que o `SpecFor` faz com os
 * campos, um degrau acima.
 *
 * Vale só para as listas fechadas. Nome de campo é string livre (o descritor pode
 * inventar um), então `vocab.field.*` fica sem rede: campo sem descrição só deixa
 * de ganhar a dica.
 */
type Described<T extends true> = T;
type Covers<Prefix extends string, Members extends string> =
  `${Prefix}${Members}` extends TextKey ? true : false;

export type ActionsDescribed = Described<Covers<'vocab.action.', ActionKind['type']>>;
export type TriggersDescribed = Described<Covers<'vocab.trigger.', TriggerType>>;
export type ContinuousDescribed = Described<Covers<'vocab.continuous.', ContinuousEffect['type']>>;
export type ScenarioDescribed = Described<Covers<'vocab.scenario.', ScenarioEffect['type']>>;
export type CostsDescribed = Described<Covers<'vocab.cost.', ActivationCost['type']>>;
export type TargetsDescribed = Described<Covers<'vocab.target.', ActionTarget>>;
export type BlocksDescribed = Described<Covers<'vocab.block.', BlockName>>;
export type KindsDescribed = Described<Covers<'vocab.kind.', BlockKind>>;

/** campos de identidade que só existem em criatura */
export const CREATURE_ONLY: readonly string[] = [
  'race',
  'attack',
  'health',
  'keywords',
  'summonRule',
];
