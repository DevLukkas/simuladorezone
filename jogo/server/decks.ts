import { validateDeck, type DeckDraft } from '../src/data/deckRules.ts';
import { asInt, text } from './db.ts';
import { withAccount } from './accounts.ts';
import { created, ok, rejected } from './http.ts';
import type { Db, Row } from './db.ts';
import type { Route } from './http.ts';

// A validação usa a MESMA função do cliente (src/data/regras.ts) — o padrão da
// casa: servidor e jogo compartilham o código, o servidor é a autoridade.

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MAX_NAME_LENGTH = 60;

function draftFromBody(body: unknown): DeckDraft | null {
  if (!isObject(body)) return null;
  if (typeof body.name !== 'string' || typeof body.hero !== 'string') return null;
  if (!isObject(body.cards)) return null;

  const cards: Record<number, number> = {};
  for (const [key, value] of Object.entries(body.cards)) {
    const id = Number(key);
    const amount = Number(value);
    if (!Number.isInteger(id) || !Number.isInteger(amount)) return null;
    cards[id] = amount;
  }

  return {
    name: body.name.trim().slice(0, MAX_NAME_LENGTH),
    hero: body.hero,
    cards,
  };
}

function fullDeck(db: Db, row: Row): Record<string, unknown> {
  const id = asInt(row.id);
  const cards: Record<number, number> = {};
  for (const cardRow of db.all(
    'SELECT card_id, amount FROM deck_cards WHERE deck_id = ?',
    id,
  )) {
    cards[asInt(cardRow.card_id)] = asInt(cardRow.amount);
  }
  return { id, name: text(row.name), hero: text(row.hero), cards };
}

function saveDeckCards(db: Db, deckId: number, cards: Record<number, number>): void {
  db.run('DELETE FROM deck_cards WHERE deck_id = ?', deckId);
  for (const [cardId, amount] of Object.entries(cards)) {
    db.run(
      'INSERT INTO deck_cards (deck_id, card_id, amount) VALUES (?, ?, ?)',
      deckId,
      Number(cardId),
      amount,
    );
  }
}

export const deckRoutes = (db: Db): Route[] => [
  {
    method: 'GET',
    pattern: '/api/decks',
    handle: withAccount(db, (_pedido, account) => {
      const rows = db.all(
        'SELECT id, name, hero FROM decks WHERE account_id = ? ORDER BY id',
        account.id,
      );
      return ok({ decks: rows.map((row) => fullDeck(db, row)) });
    }),
  },
  {
    method: 'POST',
    pattern: '/api/decks',
    handle: withAccount(db, (request, account) => {
      const draft = draftFromBody(request.body);
      if (!draft) return rejected(400, 'deck_malformed');
      const problems = validateDeck(draft);
      if (problems.length) return rejected(422, 'deck_malformed', undefined, problems);

      return db.inTransaction(() => {
        db.run(
          'INSERT INTO decks (account_id, name, hero, created_at) VALUES (?, ?, ?, ?)',
          account.id,
          draft.name,
          draft.hero,
          new Date().toISOString(),
        );
        const id = asInt(db.one('SELECT last_insert_rowid() AS id')?.id);
        saveDeckCards(db, id, draft.cards);
        return created({ id, name: draft.name, hero: draft.hero, cards: draft.cards });
      });
    }),
  },
  {
    method: 'PUT',
    pattern: '/api/decks/:id',
    handle: withAccount(db, (request, account) => {
      const id = Number(request.params.id);
      const owner = db.one('SELECT id FROM decks WHERE id = ? AND account_id = ?', id, account.id);
      if (!owner) return rejected(404, 'deck_not_found');

      const draft = draftFromBody(request.body);
      if (!draft) return rejected(400, 'deck_malformed');
      const problems = validateDeck(draft);
      if (problems.length) return rejected(422, 'deck_malformed', undefined, problems);

      return db.inTransaction(() => {
        db.run('UPDATE decks SET name = ?, hero = ? WHERE id = ?', draft.name, draft.hero, id);
        saveDeckCards(db, id, draft.cards);
        return ok({ id, name: draft.name, hero: draft.hero, cards: draft.cards });
      });
    }),
  },
  {
    method: 'DELETE',
    pattern: '/api/decks/:id',
    handle: withAccount(db, (request, account) => {
      const id = Number(request.params.id);
      const removedRows = db.run(
        'DELETE FROM decks WHERE id = ? AND account_id = ?',
        id,
        account.id,
      );
      if (!removedRows) return rejected(404, 'deck_not_found');
      return ok({ apagado: true });
    }),
  },
];

/**
 * Carrega um deck da conta no formato do engine (lista de ids + herói).
 *
 * O NOME vem junto porque o histórico o arquiva (decisão nº 43): a linha diz
 * com que baralho a partida foi jogada, e o deck pode ser renomeado ou apagado
 * depois — copiá-lo na hora é o que mantém a leitura de meses atrás de pé.
 */
export function deckForMatch(
  db: Db,
  accountId: number,
  deckId: number,
): { deckName: string; hero: string; cards: number[] } | null {
  const row = db.one(
    'SELECT id, name, hero FROM decks WHERE id = ? AND account_id = ?',
    deckId,
    accountId,
  );
  if (!row) return null;
  const cards: number[] = [];
  for (const cardRow of db.all(
    'SELECT card_id, amount FROM deck_cards WHERE deck_id = ?',
    deckId,
  )) {
    for (let i = 0; i < asInt(cardRow.amount); i++) {
      cards.push(asInt(cardRow.card_id));
    }
  }
  if (!cards.length) return null;
  return { deckName: text(row.name), hero: text(row.hero), cards };
}
