import crypto from 'node:crypto';
import { asInt, text } from './db.ts';
import { withAccount } from './accounts.ts';
import { deckForMatch } from './decks.ts';
import { created, ok, rejected } from './http.ts';
import { createOnlineMatch, currentMatchOfAccount } from './matches.ts';
import type { Format } from '../src/data/types.ts';
import type { Db } from './db.ts';
import type { Route } from './http.ts';

// Duas portas para o PvP: fila (dois na fila = pareia) e sala com código de
// convite (EZ-XXXX). As duas desembocam em criarPartidaOnline; quem espera
// descobre a partida por GET /api/partidas/atual.

interface QueueEntry {
  accountId: number;
  nickname: string;
  deckId: number;
}

// uma fila POR formato: parear decks de formatos diferentes daria uma partida
// impossível, então quem entra com deck novo só encontra quem também está no novo
const queues = new Map<Format, QueueEntry>();

const ROOM_TTL_HOURS = 2;

// alfabeto sem 0/O/1/I para código ditável por voz
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = 'EZ-';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function validDeckFromBody(
  db: Db,
  accountId: number,
  body: unknown,
): { deckId: number; hero: string; cards: number[]; format: Format } | null {
  if (typeof body !== 'object' || body === null) return null;
  const deckId = Number((body as Record<string, unknown>).deckId);
  if (!Number.isInteger(deckId)) return null;
  const deck = deckForMatch(db, accountId, deckId);
  if (!deck) return null;
  return { deckId, ...deck };
}

export const roomRoutes = (db: Db): Route[] => [
  {
    // entrar na fila: se já há alguém esperando, a partida nasce agora
    method: 'POST',
    pattern: '/api/queue',
    handle: withAccount(db, (request, account) => {
      if (currentMatchOfAccount(db, account.id)) {
        return rejected(409, 'already_in_match');
      }
      const deck = validDeckFromBody(db, account.id, request.body);
      if (!deck) return rejected(400, 'choose_a_deck');

      const wait = queues.get(deck.format);
      if (wait && wait.accountId !== account.id) {
        queues.delete(deck.format);
        const waitingDeck = deckForMatch(db, wait.accountId, wait.deckId);
        if (waitingDeck && waitingDeck.format === deck.format) {
          const matchId = createOnlineMatch(
            db,
            { accountId: wait.accountId, nickname: wait.nickname, ...waitingDeck },
            {
              accountId: account.id,
              nickname: account.nickname,
              hero: deck.hero,
              cards: deck.cards,
              format: deck.format,
            },
          );
          return created({ matchId });
        }
      }

      queues.set(deck.format, {
        accountId: account.id,
        nickname: account.nickname,
        deckId: deck.deckId,
      });
      return ok({ waiting: true, format: deck.format });
    }),
  },
  {
    method: 'DELETE',
    pattern: '/api/queue',
    handle: withAccount(db, (_pedido, account) => {
      for (const [format, wait] of queues) {
        if (wait.accountId === account.id) queues.delete(format);
      }
      return ok({ saiu: true });
    }),
  },
  {
    method: 'POST',
    pattern: '/api/rooms',
    handle: withAccount(db, (request, account) => {
      if (currentMatchOfAccount(db, account.id)) {
        return rejected(409, 'already_in_match');
      }
      const deck = validDeckFromBody(db, account.id, request.body);
      if (!deck) return rejected(400, 'choose_a_deck');

      const code = generateCode();
      db.run(
        'INSERT INTO rooms (code, host_account, host_deck, created_at) VALUES (?, ?, ?, ?)',
        code,
        account.id,
        deck.deckId,
        new Date().toISOString(),
      );
      return created({ code });
    }),
  },
  {
    method: 'POST',
    pattern: '/api/rooms/join',
    handle: withAccount(db, (request, account) => {
      if (currentMatchOfAccount(db, account.id)) {
        return rejected(409, 'already_in_match');
      }
      const body = (request.body ?? {}) as Record<string, unknown>;
      const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
      const deck = validDeckFromBody(db, account.id, request.body);
      if (!deck) return rejected(400, 'choose_a_deck');

      const expiresAt = new Date(Date.now() - ROOM_TTL_HOURS * 3_600_000).toISOString();
      const room = db.one(
        'SELECT * FROM rooms WHERE code = ? AND match_id IS NULL AND created_at > ?',
        code,
        expiresAt,
      );
      if (!room) return rejected(404, 'room_not_found');

      const hostId = asInt(room.host_account);
      if (hostId === account.id) return rejected(409, 'own_room');
      const hostDeck = deckForMatch(db, hostId, asInt(room.host_deck));
      if (!hostDeck) return rejected(409, 'host_deck_gone');
      if (hostDeck.format !== deck.format) {
        return rejected(409, 'format_mismatch');
      }
      const hostNickname =
        text(db.one('SELECT nickname FROM accounts WHERE id = ?', hostId)?.nickname) || 'Jogador';

      const matchId = createOnlineMatch(
        db,
        { accountId: hostId, nickname: hostNickname, ...hostDeck },
        {
          accountId: account.id,
          nickname: account.nickname,
          hero: deck.hero,
          cards: deck.cards,
          format: deck.format,
        },
      );
      db.run('UPDATE rooms SET match_id = ? WHERE id = ?', matchId, asInt(room.id));
      return created({ matchId });
    }),
  },
];
