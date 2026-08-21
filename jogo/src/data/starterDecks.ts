import type { Element, Hero } from './types.ts';

/**
 * Os 4 baralhos iniciais do legado (`backend/config/starter_decks.php`),
 * oferecidos no construtor de decks como ponto de partida editável.
 * O legado escolhia starter e herói em telas separadas; aqui cada deck
 * pronto sugere o herói do seu elemento (ver decisions.md nº 7).
 */
export interface StarterDeck {
  key: string;
  name: string;
  element: Element;
  hero: Hero['key'];
  descricao: string;
  /** id da carta → quantidade */
  cards: Record<number, number>;
}

export const starterDecks: readonly StarterDeck[] = [
  {
    key: 'abismos_profundezas',
    name: 'Abismos & Profundezas',
    element: 'water',
    hero: 'ispisher',
    descricao: 'Um baralho de Água focado em Atlantis, tridentes e controle de combate.',
    cards: {
      1: 2, 2: 2, 3: 1, 4: 1, 5: 2, 6: 3, 7: 2, 8: 2,
      9: 2, 10: 2, 11: 1, 12: 1, 13: 1, 14: 1,
      15: 1, 20: 2,
      21: 2, 22: 1, 24: 1,
    },
  },
  {
    key: 'matilha_predadores',
    name: 'Matilha & Predadores',
    element: 'earth',
    hero: 'badur',
    descricao: 'Um baralho de Terra com Bestas, Badur e pressão de campo.',
    cards: {
      28: 2, 29: 2, 30: 3, 31: 2, 32: 2, 33: 2, 34: 2, 35: 1, 36: 2,
      16: 1, 18: 1, 19: 3,
      23: 3, 25: 1, 26: 1, 27: 3,
      45: 1,
    },
  },
  {
    key: 'goblins_promessas',
    name: 'Goblins & Promessas',
    element: 'fire',
    hero: 'gimlou',
    descricao: 'Starter de Fogo reservado para a coleção Goblins. Usa cartas neutras temporárias até a coleção entrar.',
    // a 4ª cópia da carta 34 do legado foi capada em 3 (regra de deck; decisions.md nº 7)
    cards: {
      6: 2, 8: 2, 28: 2, 29: 2, 30: 2, 34: 3,
      10: 2, 13: 1,
      17: 2, 18: 2, 19: 1,
      21: 2, 22: 2, 23: 1, 26: 1, 27: 2,
    },
  },
  {
    key: 'guardioes_penas',
    name: 'Guardiões & Penas',
    element: 'wind',
    hero: 'tennor',
    descricao: 'Starter de Vento reservado para Guardiões. Usa cartas de suporte temporárias até a coleção entrar.',
    cards: {
      1: 1, 2: 2, 7: 2, 30: 2, 31: 2, 32: 3, 33: 2, 36: 2,
      11: 2, 12: 2, 14: 1,
      16: 1, 20: 2,
      24: 2, 25: 1, 27: 2,
      45: 1,
    },
  },
];
