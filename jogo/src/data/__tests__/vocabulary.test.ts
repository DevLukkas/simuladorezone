import { describe, expect, test } from 'vitest';
import { ALL_CARDS, cardById } from '../cards.ts';
import { validateCard } from '../validate.ts';
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
  type FieldMap,
} from '../vocabulary.ts';
import { CARD_TYPES } from '../types.ts';
import { hasText } from '../../i18n/index.ts';

/**
 * O descritor de `vocabulary.ts` só vale se descrever o catálogo REAL. O compilador
 * garante que todo tipo de ação tem entrada; é este teste que garante que os campos
 * descritos são os campos usados — sem ele, um `optional` errado ou um campo esquecido
 * só apareceria quando alguém tentasse editar aquela carta no estúdio.
 */
describe('vocabulário declarativo', () => {
  test('o validador aceita todas as cartas do catálogo', () => {
    for (const card of ALL_CARDS) {
      expect(validateCard(card), `${card.id} — ${card.name}`).toEqual([]);
    }
  });

  test('descreve um bloco para cada tipo de carta', () => {
    for (const type of CARD_TYPES) {
      expect(Object.keys(CARD_BLOCKS[type]).length, type).toBeGreaterThan(0);
    }
  });

  test('todo tipo de ação e de efeito do catálogo está descrito', () => {
    const usedActions = new Set<string>();
    const usedContinuous = new Set<string>();
    const usedScenario = new Set<string>();

    const collectAction = (action: { type: string } | undefined) => {
      if (action) usedActions.add(action.type);
    };

    for (const card of ALL_CARDS) {
      if (card.type === 'scenario') {
        for (const effect of card.effects) usedScenario.add(effect.type);
        continue;
      }
      if (card.type === 'command') {
        for (const action of card.effects ?? []) collectAction(action);
        continue;
      }
      for (const effect of card.effects ?? []) usedContinuous.add(effect.type);
      for (const ability of card.triggeredAbilities ?? []) collectAction(ability.action);
      if (card.type === 'creature' || card.type === 'item') {
        for (const ability of card.activatedAbilities ?? []) collectAction(ability.action);
      }
      if (card.type === 'creature') for (const action of card.onEnter ?? []) collectAction(action);
      else for (const action of card.onAttach ?? []) collectAction(action);
    }

    for (const type of usedActions) expect(ACTION_FIELDS, type).toHaveProperty(type);
    for (const type of usedContinuous) expect(CONTINUOUS_FIELDS, type).toHaveProperty(type);
    for (const type of usedScenario) expect(SCENARIO_FIELDS, type).toHaveProperty(type);
  });
});

describe('validação de carta', () => {
  const base = () => structuredClone(cardById(1)) as unknown as Record<string, unknown>;

  test('acusa campo inventado', () => {
    expect(validateCard({ ...base(), poder: 9 })).toContainEqual({
      path: 'poder',
      problem: 'unknown_field',
    });
  });

  test('acusa raridade fora da união', () => {
    expect(validateCard({ ...base(), rarity: 'mítica' })).toContainEqual({
      path: 'rarity',
      problem: 'not_in_options',
    });
  });

  test('acusa ação de tipo desconhecido, com o caminho até ela', () => {
    const card = base();
    card.effects = [{ type: 'aura_de_fogo', target: 'your_field' }];
    expect(validateCard(card)).toContainEqual({
      path: 'effects[0].type',
      problem: 'unknown_type',
    });
  });

  test('acusa campo obrigatório faltando dentro do bloco', () => {
    const card = base();
    card.effects = [{ type: 'aura_modify_stat', target: 'your_field', stats: ['attack'] }];
    expect(validateCard(card)).toContainEqual({ path: 'effects[0].value', problem: 'missing' });
  });

  test('acusa alvo fixado pelo tipo quando vem trocado', () => {
    const card = base();
    card.effects = [
      { type: 'aura_modify_stat', target: 'enemy_field', stats: ['attack'], value: 1 },
    ];
    expect(validateCard(card)).toContainEqual({
      path: 'effects[0].target',
      problem: 'wrong_literal',
    });
  });

  test('exige valor fixo ou contado por carta', () => {
    const card = structuredClone(cardById(2)) as unknown as Record<string, unknown>;
    card.triggeredAbilities = [
      {
        id: 'x',
        trigger: 'ally_element_changed',
        action: { type: 'add_marker', target: 'trigger_source', stats: ['defense'] },
      },
    ];
    expect(validateCard(card)).toContainEqual({
      path: 'triggeredAbilities[0].action',
      problem: 'needs_value_or_per_card',
    });
  });

  test('cenário sem efeito é recusado', () => {
    const scenario = structuredClone(cardById(45)) as unknown as Record<string, unknown>;
    delete scenario.effects;
    expect(validateCard(scenario)).toContainEqual({ path: 'effects', problem: 'missing' });
  });

  test('bloco de anexo não vale em criatura', () => {
    const card = base();
    card.onAttach = [{ type: 'draw', count: 1 }];
    expect(validateCard(card)).toContainEqual({ path: 'onAttach', problem: 'unknown_field' });
  });
});

/**
 * O estúdio explica cada peça do vocabulário com `vocab.*` no dicionário, e o
 * compilador cobra as listas fechadas (ver as asserções no fim de `vocabulary.ts`).
 * O que ele NÃO consegue cobrar é o nome de campo, que é string livre — então é
 * aqui: campo novo no descritor sem uma linha em `vocab.field` e este teste cai.
 */
describe('descrição do vocabulário', () => {
  const fieldNames = (fields: FieldMap, into: Set<string>): Set<string> => {
    for (const [name, spec] of Object.entries(fields)) {
      into.add(name);
      if (spec.kind === 'group' || spec.kind === 'groups') fieldNames(spec.fields, into);
    }
    return into;
  };

  test('todo campo do descritor tem descrição em vocab.field', () => {
    const names = new Set<string>();
    const tables: Record<string, FieldMap>[] = [
      ACTION_FIELDS,
      CONTINUOUS_FIELDS,
      SCENARIO_FIELDS,
      COST_FIELDS,
    ];
    for (const table of tables) {
      for (const fields of Object.values(table)) fieldNames(fields, names);
    }
    for (const fields of [
      TRIGGERED_FIELDS,
      ACTIVATED_FIELDS,
      ACTIVATION_CONDITION_FIELDS,
      SUMMON_RULE_FIELDS,
    ]) {
      fieldNames(fields as FieldMap, names);
    }

    for (const name of names) {
      expect(hasText(`vocab.field.${name}`), `campo "${name}" sem descrição`).toBe(true);
    }
  });
});
