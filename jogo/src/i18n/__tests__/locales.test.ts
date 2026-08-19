import { describe, expect, test } from 'vitest';
import { ALL_CARDS, cardById } from '../../data/cards.ts';
import { FORMAT_BY_EDITION, type Keyword } from '../../data/types.ts';
import { LOCALES, DEFAULT_LOCALE, cardName, cardRulesText, getLocale, setLocale, t } from '../index.ts';
import ptBR from '../locales/pt-BR.ts';
import enUS from '../locales/en-US.ts';
import esES from '../locales/es-ES.ts';

const BUNDLES = { 'pt-BR': ptBR, 'en-US': enUS, 'es-ES': esES } as const;
/** todo idioma menos o fonte: nele o texto da carta vem do catálogo, não do dicionário */
const TRANSLATED = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

const KEYWORDS: Keyword[] = ['aggressive', 'trample', 'martial', 'vorpal', 'regenerate'];

describe('dicionário de cartas', () => {
  test('o idioma-fonte não sobrescreve nada: o impresso vive no catálogo', () => {
    expect(Object.keys(BUNDLES[DEFAULT_LOCALE].cards)).toEqual([]);
  });

  for (const locale of TRANSLATED) {
    describe(locale, () => {
      const { cards } = BUNDLES[locale];

      test('traduz todas as cartas do catálogo, com nome e texto', () => {
        for (const card of ALL_CARDS) {
          const entry = cards[card.id];
          expect(entry, `carta ${card.id} ("${card.name}") sem tradução`).toBeDefined();
          expect(entry?.name?.trim(), `carta ${card.id} sem nome`).toBeTruthy();
          expect(entry?.text?.trim(), `carta ${card.id} sem texto`).toBeTruthy();
        }
      });

      test('não traduz id que não existe no catálogo', () => {
        for (const id of Object.keys(cards)) {
          expect(() => cardById(Number(id)), `id ${id} não está no catálogo`).not.toThrow();
        }
      });

      test('nomes traduzidos seguem únicos', () => {
        const names = ALL_CARDS.map((card) => cards[card.id]?.name);
        expect(new Set(names).size).toBe(names.length);
      });

      /**
       * A palavra-chave é regra, não prosa: se o impresso abre com ela, a tradução
       * abre com a palavra daquele idioma — senão o jogador lê MARCIAL numa carta e
       * MARTIAL na outra, e o tabuleiro deixa de explicar o que faz.
       */
      test('a linha de palavra-chave usa a palavra do idioma', () => {
        for (const card of ALL_CARDS) {
          const firstLine = (card.text ?? '').split('\n')[0]!.trim();
          const printed = KEYWORDS.find((key) => ptBR.ui.keyword[key] === firstLine);
          if (!printed) continue;
          const translated = (cards[card.id]?.text ?? '').split('\n')[0]!.trim();
          expect(translated, `carta ${card.id} perdeu a palavra-chave na tradução`).toBe(
            BUNDLES[locale].ui.keyword[printed],
          );
        }
      });
    });
  }
});

describe('edições', () => {
  test('todo idioma nomeia exatamente as edições do catálogo', () => {
    const editions = Object.keys(FORMAT_BY_EDITION).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(BUNDLES[locale].ui.edition).sort(), locale).toEqual(editions);
    }
  });
});

describe('resolução de texto de carta', () => {
  const original = getLocale();
  const afterEach = () => setLocale(original);

  test('no idioma-fonte vem do catálogo', () => {
    setLocale('pt-BR');
    expect(cardName(1)).toBe(cardById(1).name);
    expect(cardRulesText(1)).toBe(cardById(1).text);
    afterEach();
  });

  test('nos demais vem do dicionário, e a edição também é traduzida', () => {
    setLocale('en-US');
    expect(cardName(1)).toBe('Azzure, Priestess of Atlantis');
    expect(cardRulesText(1)).toContain('Aquarium');
    expect(t('edition.Abismos & Profundezas')).toBe('Abysses & Depths');

    setLocale('es-ES');
    expect(cardName(53)).toBe('Moneda del Bosque');
    expect(t('edition.Quatro Elementos')).toBe('Cuatro Elementos');
    afterEach();
  });

  test('id fora do catálogo não quebra a tela', () => {
    setLocale('en-US');
    expect(cardName(999)).toBe('#999');
    expect(cardRulesText(999)).toBeNull();
    afterEach();
  });
});
