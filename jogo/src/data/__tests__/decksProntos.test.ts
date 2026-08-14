import { describe, expect, test } from 'vitest';
import { decksProntos } from '../decksProntos.ts';
import { heroiPorChave } from '../herois.ts';
import { validarDeck } from '../regras.ts';

describe('decks prontos', () => {
  test('são 4, com chaves e nomes únicos', () => {
    expect(decksProntos.length).toBe(4);
    expect(new Set(decksProntos.map((deck) => deck.chave)).size).toBe(4);
    expect(new Set(decksProntos.map((deck) => deck.nome)).size).toBe(4);
  });

  test('todos passam na validação de deck (cartas existentes, limites de cópia e total)', () => {
    for (const deck of decksProntos) {
      const problemas = validarDeck({ nome: deck.nome, heroi: deck.heroi, cartas: deck.cartas });
      expect(problemas, `${deck.chave}: ${problemas.join(' ')}`).toEqual([]);
    }
  });

  test('o herói sugerido existe e casa com o elemento do deck (quando o herói tem elemento)', () => {
    for (const deck of decksProntos) {
      const heroi = heroiPorChave(deck.heroi);
      expect(heroi, deck.chave).toBeDefined();
      if (heroi?.elemento) expect(heroi.elemento, deck.chave).toBe(deck.elemento);
    }
  });
});
