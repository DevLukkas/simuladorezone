import { describe, expect, test } from 'vitest';
import {
  blankCard,
  defaultAction,
  defaultActivated,
  defaultContinuous,
  defaultCost,
  defaultScenarioEffect,
  defaultTriggered,
  retype,
} from '../defaults.ts';
import { validateCard } from '../validate.ts';
import {
  ACTION_TYPES,
  CONTINUOUS_TYPES,
  COST_TYPES,
  SCENARIO_TYPES,
  CARD_BLOCKS,
} from '../vocabulary.ts';
import { CARD_TYPES } from '../types.ts';
import type { Card } from '../types.ts';

/** carta em branco só falta nome e texto; aqui eles entram para sobrar o bloco */
const filled = (card: Card): Card =>
  ({ ...card, name: `Cobaia ${card.type}`, text: 'Texto de regras.' }) as Card;

const withBlock = (block: string, items: unknown[]): unknown => ({
  ...filled(blankCard(500, 'creature')),
  [block]: items,
});

/**
 * A promessa do montador guiado: escolhida a ação na lista, o que sai já tem a
 * forma certa — alvo, duração, valor fixo e grupo aninhado no lugar. O único
 * buraco que sobra é TEXTO LIVRE que o autor tem de escrever (o nome da ficha
 * invocada, o nome do anexo a destruir): não há valor de partida honesto para
 * esses, e o formulário os mostra vazios esperando a digitação.
 *
 * Estes testes são essa promessa — tipo novo no motor sem campo descrito cai
 * aqui, antes de chegar na tela.
 */
const onlyEmptyText = (problems: { problem: string }[]): boolean =>
  problems.every((item) => item.problem === 'empty_text');

describe('valores de partida', () => {
  test('toda ação nasce com a forma certa, faltando no máximo texto livre', () => {
    for (const type of ACTION_TYPES) {
      const problems = validateCard(withBlock('onEnter', [defaultAction(type)]));
      expect(onlyEmptyText(problems), `${type}: ${JSON.stringify(problems)}`).toBe(true);
    }
  });

  test('quase toda ação nasce inteira: só duas pedem texto livre', () => {
    const pending = ACTION_TYPES.filter(
      (type) => validateCard(withBlock('onEnter', [defaultAction(type)])).length > 0,
    );
    expect(pending).toEqual(['summon_token']);
  });

  test('todo efeito contínuo nasce válido', () => {
    for (const type of CONTINUOUS_TYPES) {
      const card = withBlock('effects', [defaultContinuous(type)]);
      expect(validateCard(card), type).toEqual([]);
    }
  });

  test('todo efeito de cenário nasce válido', () => {
    for (const type of SCENARIO_TYPES) {
      const card = filled(blankCard(500, 'scenario'));
      expect(validateCard({ ...card, effects: [defaultScenarioEffect(type)] }), type).toEqual([]);
    }
  });

  test('toda habilidade nasce válida, com e sem custo', () => {
    expect(validateCard(withBlock('triggeredAbilities', [defaultTriggered('x')]))).toEqual([]);
    expect(validateCard(withBlock('activatedAbilities', [defaultActivated('y')]))).toEqual([]);

    for (const type of COST_TYPES) {
      const ability = { ...defaultActivated('z'), cost: defaultCost(type) };
      const problems = validateCard(withBlock('activatedAbilities', [ability]));
      expect(onlyEmptyText(problems), `${type}: ${JSON.stringify(problems)}`).toBe(true);
    }
  });

  test('ação que soma stat já vem com um valor', () => {
    expect(defaultAction('add_marker')).toMatchObject({ value: 0 });
    expect(defaultContinuous('modify_stat')).toMatchObject({ value: 0 });
  });

  test('valor fixado pelo tipo nasce no valor certo', () => {
    expect(defaultContinuous('aura_modify_stat')).toMatchObject({ target: 'your_field' });
    expect(defaultAction('delayed_damage')).toMatchObject({ when: 'end_of_next_turn' });
  });
});

describe('carta em branco', () => {
  test('vale assim que ganha nome e texto — o resto já vem pronto', () => {
    for (const type of CARD_TYPES) {
      expect(validateCard(filled(blankCard(500, type))), type).toEqual([]);
    }
  });

  test('em branco, o que falta é exatamente nome e texto', () => {
    for (const type of CARD_TYPES) {
      expect(validateCard(blankCard(500, type)).map((item) => item.path).sort(), type).toEqual([
        'name',
        'text',
      ]);
    }
  });

  test('cenário já nasce com efeito, porque sem efeito não é carta', () => {
    expect(validateCard(blankCard(500, 'scenario'))).not.toContainEqual({
      path: 'effects',
      problem: 'missing',
    });
  });
});

describe('trocar de tipo', () => {
  const creature = {
    ...filled(blankCard(500, 'creature')),
    race: 'Orc',
    attack: 4,
    health: 2,
    effects: [defaultContinuous('aura_modify_stat')],
    triggeredAbilities: [defaultTriggered('t')],
  } as unknown as Card;

  test('mantém identidade e joga fora bloco que não vale no tipo novo', () => {
    const asCommand = retype(creature, 'command');
    expect(asCommand).toMatchObject({ id: 500, type: 'command', name: 'Cobaia creature' });
    expect(asCommand).not.toHaveProperty('race');
    expect(asCommand).not.toHaveProperty('effects');
    expect(validateCard(asCommand)).toEqual([]);
  });

  test('gatilho sobrevive quando o tipo novo também aceita gatilho', () => {
    const asItem = retype(creature, 'item');
    expect(asItem).toHaveProperty('triggeredAbilities');
    expect(validateCard(asItem)).toEqual([]);
  });

  test('comando não aceita gatilho, então o bloco não atravessa', () => {
    expect(CARD_BLOCKS.command.triggeredAbilities).toBeUndefined();
    expect(retype(creature, 'command')).not.toHaveProperty('triggeredAbilities');
  });

  test('trocar para o mesmo tipo não mexe em nada', () => {
    expect(retype(creature, 'creature')).toBe(creature);
  });

  test('ida e volta para criatura recupera os campos de criatura', () => {
    const back = retype(retype(creature, 'command'), 'creature');
    expect(back).toMatchObject({ type: 'creature', race: 'Beast', attack: 1, health: 1 });
    expect(validateCard(back)).toEqual([]);
  });
});
