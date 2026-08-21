import { describe, expect, test } from 'vitest';
import { cardName, getLocale, resolve, resolveParts, setLocale } from '../../i18n/index.ts';
import ptBR from '../../i18n/locales/pt-BR.ts';
import { cardRef, text, tokenRef } from '../../shared/text.ts';
import { LOG_TONE, LOG_TONE_OF, logTone } from '../logTone.ts';

/**
 * O registro colorido (decisão nº 42): duas coisas precisam continuar valendo —
 * TODA linha tem um assunto declarado (senão ela some no cinza sem ninguém
 * notar), e a frase em pedaços diz a mesma coisa que a frase inteira.
 */
describe('cor do registro', () => {
  const keys = Object.keys(ptBR.ui.log);

  test('toda linha do registro tem assunto declarado', () => {
    for (const key of keys) {
      expect(LOG_TONE_OF[key], `a chave log.${key} não tem assunto em LOG_TONE_OF`).toBeDefined();
    }
  });

  test('não sobra assunto para chave que não existe mais', () => {
    for (const key of Object.keys(LOG_TONE_OF)) {
      expect(keys, `LOG_TONE_OF fala de log.${key}, que saiu do dicionário`).toContain(key);
    }
  });

  test('todo assunto tem cor, e chave desconhecida cai no cinza', () => {
    for (const key of keys) expect(LOG_TONE[logTone(`log.${key}` as never)]).toBeDefined();
    expect(logTone('board.log')).toBe('system');
  });
});

describe('frase em pedaços', () => {
  const original = getLocale();

  test('remontada, é a mesma frase do resolve', () => {
    setLocale('pt-BR');
    const line = text('log.summoned', {
      who: text('board.opponent'),
      card: cardRef(1),
    });
    expect(resolveParts(line).map((part) => part.text).join('')).toBe(resolve(line));
    setLocale(original);
  });

  test('etiqueta o autor, a carta e o número', () => {
    setLocale('pt-BR');
    const parts = resolveParts(
      text('log.scored', { who: text('board.you'), gained: 2, total: 3 }),
    );
    expect(parts.filter((part) => part.role === 'you')).toHaveLength(1);
    expect(parts.filter((part) => part.role === 'number').map((part) => part.text)).toEqual([
      '2',
      '3',
    ]);

    const summon = resolveParts(text('log.summoned', { who: text('board.you'), card: cardRef(1) }));
    expect(summon.find((part) => part.role === 'card')?.text).toBe(cardName(1));
    setLocale(original);
  });

  test('a ficha vem etiquetada como ficha, e não como carta', () => {
    setLocale('pt-BR');
    const parts = resolveParts(
      text('log.tokenCreated', { who: text('board.you'), token: tokenRef('golem') }),
    );
    expect(parts.some((part) => part.role === 'token')).toBe(true);
    setLocale(original);
  });

  test('parâmetro que a frase não usa não vira pedaço, e o que falta volta cru', () => {
    setLocale('pt-BR');
    // 'log.battlePhase' não tem placeholder nenhum
    expect(resolveParts(text('log.battlePhase', { who: text('board.you') }))).toEqual([
      { text: ptBR.ui.log.battlePhase, role: 'plain' },
    ]);
    expect(resolveParts(text('log.directDamage')).map((part) => part.text).join('')).toBe(
      ptBR.ui.log.directDamage,
    );
    setLocale(original);
  });
});
