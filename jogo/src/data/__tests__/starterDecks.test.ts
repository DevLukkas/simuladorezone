import { describe, expect, test } from 'vitest';
import { starterDecks } from '../starterDecks.ts';
import { heroByKey } from '../heroes.ts';
import { validateDeck } from '../deckRules.ts';

describe('decks prontos', () => {
  test('são 4, com chaves e nomes únicos', () => {
    expect(starterDecks.length).toBe(4);
    expect(new Set(starterDecks.map((deck) => deck.key)).size).toBe(4);
    expect(new Set(starterDecks.map((deck) => deck.name)).size).toBe(4);
  });

  test('todos passam na validação de deck (cartas existentes, limites de cópia e total)', () => {
    for (const deck of starterDecks) {
      const problems = validateDeck({
        name: deck.name,
        hero: deck.hero,
        cards: deck.cards,
        format: deck.format,
      });
      expect(problems, `${deck.key}: ${problems.join(' ')}`).toEqual([]);
    }
  });

  test('o herói sugerido existe e casa com o elemento do deck (quando o herói tem elemento)', () => {
    for (const deck of starterDecks) {
      const hero = heroByKey(deck.hero);
      expect(hero, deck.key).toBeDefined();
      if (hero?.element) expect(hero.element, deck.key).toBe(deck.element);
    }
  });
});
