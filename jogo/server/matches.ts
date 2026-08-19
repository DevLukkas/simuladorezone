import crypto from 'node:crypto';
import { createMatch } from '../src/engine/createMatch.ts';
import { reduce } from '../src/engine/reduce.ts';
import { redactEvent, viewFor } from '../src/engine/view.ts';
import type { Command } from '../src/engine/commands.ts';
import { REACTION_SECONDS, TURN_SECONDS } from '../src/engine/state.ts';
import { FORMAT_NAME, type Format } from '../src/data/types.ts';
import type { GameState, SideId } from '../src/engine/state.ts';
import type { GameEvent } from '../src/engine/events.ts';
import { asInt, text } from './db.ts';
import type { ErrorCode } from '../src/shared/errors.ts';
import { withAccount, accountOfRequest } from './accounts.ts';
import { ok, rejected } from './http.ts';
import type { Db } from './db.ts';
import type { Route } from './http.ts';
import type http from 'node:http';

// O coração do online: o servidor é o único que roda o engine. Clientes mandam
// comandos por POST e recebem eventos redigidos por SSE; a visão nunca carrega
// a mão nem o deck do oponente.

/** turnos seguidos perdidos por tempo até a derrota por W.O. */
const PASSES_UNTIL_FORFEIT = 3;

interface LiveMatch {
  id: number;
  state: GameState;
  accounts: Record<SideId, number>;
  nicknames: Record<SideId, string>;
  seq: number;
  subscribers: Map<http.ServerResponse, SideId>;
  timer: ReturnType<typeof setTimeout> | null;
  deadlineMs: number;
  passesInARow: Record<SideId, number>;
}

const liveOnes = new Map<number, LiveMatch>();

export interface MatchPlayer {
  accountId: number;
  nickname: string;
  hero: string;
  cards: number[];
  format: Format;
}

export function createOnlineMatch(
  db: Db,
  playerA: MatchPlayer,
  playerB: MatchPlayer,
): number {
  // uma partida corre num formato só; quem parear decks diferentes erra antes daqui
  if (playerA.format !== playerB.format) {
    throw new Error(
      `Formatos diferentes: ${FORMAT_NAME[playerA.format]} contra` +
        ` ${FORMAT_NAME[playerB.format]}.`,
    );
  }
  const format = playerA.format;
  const seed = crypto.randomInt(1, 0xffffffff);
  const created = createMatch({
    seed,
    format,
    decks: {
      a: { hero: playerA.hero, cards: playerA.cards },
      b: { hero: playerB.hero, cards: playerB.cards },
    },
  });

  const now = new Date().toISOString();
  db.run(
    `INSERT INTO matches (account_a, account_b, seed, format, state_json, seq, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    playerA.accountId,
    playerB.accountId,
    seed,
    format,
    JSON.stringify(created.state),
    now,
    now,
  );
  const id = asInt(db.one('SELECT last_insert_rowid() AS id')?.id);

  const live: LiveMatch = {
    id,
    state: created.state,
    accounts: { a: playerA.accountId, b: playerB.accountId },
    nicknames: { a: playerA.nickname, b: playerB.nickname },
    seq: 0,
    subscribers: new Map(),
    timer: null,
    deadlineMs: 0,
    passesInARow: { a: 0, b: 0 },
  };
  liveOnes.set(id, live);
  recordEvents(db, live, created.events);
  armTimer(db, live);
  return id;
}

/** Recarrega uma partida viva depois de um restart do servidor. */
function loadLive(db: Db, id: number): LiveMatch | null {
  const inMemory = liveOnes.get(id);
  if (inMemory) return inMemory;

  const row = db.one('SELECT * FROM matches WHERE id = ?', id);
  if (!row || text(row.winner)) return null;

  const nicknameOf = (accountId: number): string =>
    text(db.one('SELECT nickname FROM accounts WHERE id = ?', accountId)?.nickname) || 'Jogador';

  const live: LiveMatch = {
    id,
    state: JSON.parse(text(row.state_json)) as GameState,
    accounts: { a: asInt(row.account_a), b: asInt(row.account_b) },
    nicknames: { a: nicknameOf(asInt(row.account_a)), b: nicknameOf(asInt(row.account_b)) },
    seq: asInt(row.seq),
    subscribers: new Map(),
    timer: null,
    deadlineMs: 0,
    passesInARow: { a: 0, b: 0 },
  };
  liveOnes.set(id, live);
  armTimer(db, live);
  return live;
}

export function currentMatchOfAccount(db: Db, accountId: number): number | null {
  const row = db.one(
    `SELECT id FROM matches
      WHERE winner IS NULL AND (account_a = ? OR account_b = ?)
      ORDER BY id DESC LIMIT 1`,
    accountId,
    accountId,
  );
  return row ? asInt(row.id) : null;
}

function accountSide(live: LiveMatch, accountId: number): SideId | null {
  if (live.accounts.a === accountId) return 'a';
  if (live.accounts.b === accountId) return 'b';
  return null;
}

function recordEvents(db: Db, live: LiveMatch, events: GameEvent[]): void {
  db.inTransaction(() => {
    for (const event of events) {
      live.seq += 1;
      db.run(
        'INSERT INTO match_events (match_id, seq, event_json) VALUES (?, ?, ?)',
        live.id,
        live.seq,
        JSON.stringify(event),
      );
    }
    db.run(
      'UPDATE matches SET state_json = ?, seq = ?, winner = ?, reason = ?, updated_at = ? WHERE id = ?',
      JSON.stringify(live.state),
      live.seq,
      live.state.winner,
      live.state.endReason ?? null,
      new Date().toISOString(),
      live.id,
    );
  });

  let baseSeq = live.seq - events.length;
  for (const event of events) {
    baseSeq += 1;
    for (const [reply, side] of live.subscribers) {
      writeEvent(reply, baseSeq, redactEvent(event, side));
    }
  }
}

function writeEvent(reply: http.ServerResponse, seq: number, event: GameEvent): void {
  reply.write(`id: ${seq}\ndata: ${JSON.stringify(event)}\n\n`);
}

function armTimer(db: Db, live: LiveMatch): void {
  if (live.timer) clearTimeout(live.timer);
  if (live.state.winner) {
    live.timer = null;
    return;
  }
  // janela de reação: prazo curto e recusa automática, sem contar como passe
  const reaction = live.state.pending?.reaction ? live.state.pending : null;
  const seconds = reaction ? REACTION_SECONDS : TURN_SECONDS;
  live.deadlineMs = Date.now() + seconds * 1000;
  live.timer = setTimeout(() => {
    if (reaction) declineReaction(db, live, reaction.id, reaction.side);
    else timeOut(db, live);
  }, seconds * 1000);
  // um timer parado não segura o processo vivo
  live.timer.unref?.();
}

function declineReaction(db: Db, live: LiveMatch, pendingId: string, side: SideId): void {
  if (live.state.winner) return;
  if (live.state.pending?.id !== pendingId) return;
  applyToLive(db, live, { type: 'ANSWER', side, pendingId, optionId: 'decline' });
}

function timeOut(db: Db, live: LiveMatch): void {
  if (live.state.winner) return;

  // W.O.: quem estoura o próprio turno seguidas vezes perde a partida
  const ownerOfTimer = live.state.phase === 'mulligan' ? null : live.state.activeSide;
  if (ownerOfTimer) {
    live.passesInARow[ownerOfTimer] += 1;
    if (live.passesInARow[ownerOfTimer] >= PASSES_UNTIL_FORFEIT) {
      applyToLive(db, live, { type: 'CONCEDE', side: ownerOfTimer });
      return;
    }
  }
  applyToLive(db, live, { type: 'TIME_OUT' });
}

function applyToLive(db: Db, live: LiveMatch, command: Command): ErrorCode | null {
  const result = reduce(live.state, command);
  if (result.error) return result.error;

  live.state = result.state;
  recordEvents(db, live, result.events);
  armTimer(db, live);

  if (live.state.winner) {
    for (const reply of live.subscribers.keys()) reply.end();
    live.subscribers.clear();
    if (live.timer) clearTimeout(live.timer);
    liveOnes.delete(live.id);
  }
  return null;
}

function snapshot(live: LiveMatch, side: SideId): Record<string, unknown> {
  return {
    matchId: live.id,
    seq: live.seq,
    deadlineMs: live.deadlineMs,
    nicknames: { me: live.nicknames[side], opponent: live.nicknames[side === 'a' ? 'b' : 'a'] },
    view: viewFor(live.state, side),
  };
}

export const matchRoutes = (db: Db): Route[] => [
  {
    method: 'GET',
    pattern: '/api/matches/current',
    handle: withAccount(db, (_pedido, account) => {
      const id = currentMatchOfAccount(db, account.id);
      return ok({ matchId: id });
    }),
  },
  {
    method: 'GET',
    pattern: '/api/matches/:id',
    handle: withAccount(db, (request, account) => {
      const live = loadLive(db, Number(request.params.id));
      if (!live) return rejected(404, 'match_not_found');
      const side = accountSide(live, account.id);
      if (!side) return rejected(403, 'not_your_match');
      return ok(snapshot(live, side));
    }),
  },
  {
    method: 'POST',
    pattern: '/api/matches/:id/commands',
    handle: withAccount(db, (request, account) => {
      const live = loadLive(db, Number(request.params.id));
      if (!live) return rejected(404, 'match_not_found');
      const side = accountSide(live, account.id);
      if (!side) return rejected(403, 'not_your_match');

      const body = request.body as { command?: Command } | null;
      const command = body?.command;
      if (!command || typeof command.type !== 'string') return rejected(400, 'command_malformed');
      if (command.type === 'TIME_OUT') return rejected(403, 'server_only_timeout');

      // autoridade: o lado do comando é SEMPRE o do jogador autenticado,
      // não o que o cliente diz que é
      const commandFromSide = { ...command, side } as Command;
      const error = applyToLive(db, live, commandFromSide);
      if (error) return rejected(422, error);

      live.passesInARow[side] = 0;
      const stillLive = liveOnes.get(live.id);
      return ok(stillLive ? snapshot(stillLive, side) : { ended: true, seq: live.seq });
    }),
  },
  {
    method: 'GET',
    pattern: '/api/matches/:id/events',
    raw: (request, reply) => {
      const account = accountOfRequest(db, {
        ...request,
        // EventSource não manda cabeçalhos: o token viaja na query string
        authorization: request.search.get('token') ? `Bearer ${request.search.get('token')}` : request.authorization,
      });
      if (!account) {
        reply.writeHead(401, { 'content-type': 'application/json' });
        reply.end(JSON.stringify(rejected(401, 'account_required').body));
        return;
      }
      const live = loadLive(db, Number(request.params.id));
      if (!live) {
        reply.writeHead(404, { 'content-type': 'application/json' });
        reply.end(JSON.stringify(rejected(404, 'match_not_found').body));
        return;
      }
      const side = accountSide(live, account.id);
      if (!side) {
        reply.writeHead(403, { 'content-type': 'application/json' });
        reply.end(JSON.stringify(rejected(403, 'not_your_match').body));
        return;
      }

      reply.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      reply.write(':oi\n\n');

      // reentrega o que faltou (reconexão): ?desde=N ou Last-Event-ID
      const since = Number(request.search.get('desde')) || 0;
      if (since < live.seq) {
        const rows = db.all(
          'SELECT seq, event_json FROM match_events WHERE match_id = ? AND seq > ? ORDER BY seq',
          live.id,
          since,
        );
        for (const row of rows) {
          const event = JSON.parse(text(row.event_json)) as GameEvent;
          writeEvent(reply, asInt(row.seq), redactEvent(event, side));
        }
      }

      live.subscribers.set(reply, side);
      const heartbeat = setInterval(() => reply.write(':hb\n\n'), 25_000);
      reply.on('close', () => {
        clearInterval(heartbeat);
        live.subscribers.delete(reply);
      });
    },
  },
];
