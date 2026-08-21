import crypto from 'node:crypto';
import { asInt, text } from './db.ts';
import { withAccount } from './accounts.ts';
import { deckForMatch } from './decks.ts';
import { created, ok, rejected } from './http.ts';
import { fuse } from './rateLimit.ts';
import { createOnlineMatch, currentMatchOfAccount } from './matches.ts';
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

// uma fila só: com formato único (decisão nº 37) qualquer deck pareia com qualquer
// outro, então quem chega encontra quem já estava esperando
let waiting: QueueEntry | null = null;

const ROOM_TTL_HOURS = 2;

/**
 * Fusível de PALPITE de código de sala, por conta.
 *
 * `EZ-XXXX` num alfabeto de 32 letras dá ~1 milhão de combinações, e uma sala
 * aberta vive 2 horas: sem teto, um laço de `fetch` varre o espaço inteiro e
 * entra na sala de quem estava esperando um amigo. Só o palpite ERRADO conta —
 * quem digitou o código certo passa direto, e errar o código algumas vezes
 * continua sendo uma tarde ruim e não um ataque.
 */
const joinFuse = fuse(20, 10 * 60);

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
): { deckId: number; deckName: string; hero: string; cards: number[] } | null {
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

      const wait = waiting;
      if (wait && wait.accountId !== account.id) {
        waiting = null;
        const waitingDeck = deckForMatch(db, wait.accountId, wait.deckId);
        if (waitingDeck) {
          const matchId = createOnlineMatch(
            db,
            { accountId: wait.accountId, nickname: wait.nickname, ...waitingDeck },
            {
              accountId: account.id,
              nickname: account.nickname,
              deckName: deck.deckName,
              hero: deck.hero,
              cards: deck.cards,
            },
          );
          return created({ matchId });
        }
      }

      waiting = {
        accountId: account.id,
        nickname: account.nickname,
        deckId: deck.deckId,
      };
      return ok({ waiting: true });
    }),
  },
  {
    method: 'DELETE',
    pattern: '/api/queue',
    handle: withAccount(db, (_pedido, account) => {
      if (waiting?.accountId === account.id) waiting = null;
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
      if (!room) {
        const wait = joinFuse(String(account.id));
        return wait > 0
          ? rejected(429, 'too_many_attempts', { seconds: wait })
          : rejected(404, 'room_not_found');
      }

      const hostId = asInt(room.host_account);
      if (hostId === account.id) return rejected(409, 'own_room');
      const hostDeck = deckForMatch(db, hostId, asInt(room.host_deck));
      if (!hostDeck) return rejected(409, 'host_deck_gone');
      const hostNickname =
        text(db.one('SELECT nickname FROM accounts WHERE id = ?', hostId)?.nickname) || 'Jogador';

      const matchId = createOnlineMatch(
        db,
        { accountId: hostId, nickname: hostNickname, ...hostDeck },
        {
          accountId: account.id,
          nickname: account.nickname,
          deckName: deck.deckName,
          hero: deck.hero,
          cards: deck.cards,
        },
      );
      db.run('UPDATE rooms SET match_id = ? WHERE id = ?', matchId, asInt(room.id));
      return created({ matchId });
    }),
  },
];
