import { describe, expect, test, vi } from 'vitest';
import { ALL_CARDS, PLAYABLE_CARDS, cardPlayable, cardStatus } from '../cards.ts';
import { canonicalCard } from '../canonical.ts';
import { blankCard } from '../defaults.ts';
import { validateCard } from '../validate.ts';
import { CARD_STATUSES } from '../types.ts';

/**
 * A esteira da carta (decisão nº 41): rascunho → em revisão → publicada, com o
 * arquivo como saída lateral. O que se afirma aqui é a fronteira entre o CATÁLOGO
 * (tudo) e o JOGO (só o publicado) — é dela que depende a promessa de escrever
 * carta nova com o servidor no ar sem ela vazar para uma partida pela metade.
 */

describe('situação da carta', () => {
  test('campo ausente é publicada: as cartas anteriores à esteira seguem em jogo', () => {
    const withoutField = ALL_CARDS.filter((card) => card.status === undefined);
    expect(withoutField.length).toBeGreaterThan(0);
    for (const card of withoutField) expect(cardStatus(card)).toBe('published');
  });

  test('o jogo enxerga só o publicado', () => {
    const published = ALL_CARDS.filter((card) => cardStatus(card) === 'published');
    expect(PLAYABLE_CARDS).toEqual(published);
    for (const card of PLAYABLE_CARDS) expect(cardPlayable(card.id)).toBe(true);
  });

  test('carta nova nasce em rascunho, fora do jogo', () => {
    const fresh = blankCard(999, 'creature');
    expect(cardStatus(fresh)).toBe('draft');
    expect(cardPlayable(999)).toBe(false);
  });

  test('o validador aceita as quatro situações e recusa qualquer outra', () => {
    const card = { ...blankCard(999, 'creature'), name: 'Teste', text: 'x' };
    for (const status of CARD_STATUSES) {
      expect(validateCard({ ...card, status })).toEqual([]);
    }
    expect(validateCard({ ...card, status: 'quase' })).toEqual([
      { path: 'status', problem: 'not_in_options' },
    ]);
  });

  test('a situação entra na forma canônica, depois da procedência', () => {
    const card = { ...blankCard(999, 'creature'), name: 'Teste', text: 'x', status: 'review' };
    const keys = Object.keys(canonicalCard(card as never));
    expect(keys).toContain('status');
    expect(keys.indexOf('status')).toBeGreaterThan(keys.indexOf('edition'));
  });
});

/**
 * Carta que existe no catálogo mas não está publicada não entra em baralho. O
 * catálogo de verdade não tem nenhuma assim (as 78 são todas publicadas), então o
 * caso se prova com o pool trocado — é a única maneira de exercitar a recusa sem
 * despublicar uma carta de verdade só para o teste ver.
 */
describe('baralho com carta não publicada', () => {
  test('a construção recusa e diz por quê', async () => {
    vi.doMock('../cards.ts', async () => {
      const real = await vi.importActual<typeof import('../cards.ts')>('../cards.ts');
      return { ...real, cardPlayable: (id: number) => id !== 1 };
    });

    vi.resetModules();
    const { validateDeck } = await import('../deckRules.ts');
    const problems = validateDeck({ name: 'Teste', hero: 'badur', cards: { 1: 1, 2: 1 } });

    expect(problems.map((problem) => problem.key)).toContain('deckRule.unpublished_card');
    vi.doUnmock('../cards.ts');
    vi.resetModules();
  });
});
