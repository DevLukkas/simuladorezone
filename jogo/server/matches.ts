import crypto from 'node:crypto';
import { createMatch } from '../src/engine/createMatch.ts';
import { reduce } from '../src/engine/reduce.ts';
import { redactEvent, viewFor } from '../src/engine/view.ts';
import type { Command } from '../src/engine/commands.ts';
import { advanceClock, newClock, type MatchClock } from '../src/shared/clock.ts';
import { framesByReplaying, recordMatchHistory } from './history.ts';
import { frameOfState, type TapeFrame } from '../src/shared/tape.ts';
import { dropLiveFrames, liveFrames, recordLiveFrame } from './tapes.ts';
import type { SideDeck } from '../src/engine/createMatch.ts';
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
//
// Partida de outra pessoa responde o MESMO 404 de partida inexistente, e não um
// "essa não é sua": com id sequencial, a diferença entre as duas respostas é um
// contador de quantas partidas o servidor já teve, entregue a quem só sabe
// somar 1. Cliente legítimo nunca vê a diferença — ele só pede a partida que o
// próprio servidor acabou de lhe dar.

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
  /**
   * O relógio da partida. Fica aqui (e não recalculado a cada comando) porque o
   * prazo do TURNO tem de sobreviver aos lances: antes `armTimer` dava 60
   * segundos novos a cada invocação/anexo, e a barra do cliente voltava ao cheio
   * toda vez (relato do DevLukkas).
   */
  clock: MatchClock;
  deadlineMs: number;
  /** o prazo vigente é o de uma janela de reação, não o do turno */
  deadlineIsReaction: boolean;
  passesInARow: Record<SideId, number>;
  /**
   * O que o replay precisa (decisão nº 43): a seed já está na tabela, e estes
   * dois completam a receita — os decks de abertura e os comandos ACEITOS, na
   * ordem. Os dois são persistidos junto, porque um restart do servidor recarrega
   * a partida do `state_json` e perderia o registro que só vivia na memória.
   */
  decks: Record<SideId, SideDeck>;
  commands: Command[];
  /**
   * A FITA em construção (decisão nº 44): um quadro por comando aceito, mais a
   * abertura. É o log oculto da partida — gravado no ato, persistido em
   * `match_frames` e fechado numa fita quando a partida acaba.
   *
   * Fica AQUI, e não é reconstruído no fim, porque reconstruir seria reexecutar
   * — e reexecutar é exatamente o que esta decisão tirou do caminho. O que foi
   * jogado é o que foi jogado, mesmo que o servidor tenha sido reiniciado com
   * outro build no meio da partida.
   */
  frames: TapeFrame[];
  deckNames: Record<SideId, string>;
  startedAtMs: number;
}

const liveOnes = new Map<number, LiveMatch>();

export interface MatchPlayer {
  accountId: number;
  nickname: string;
  /** o nome do baralho, copiado para o histórico */
  deckName: string;
  hero: string;
  cards: number[];
}

export function createOnlineMatch(
  db: Db,
  playerA: MatchPlayer,
  playerB: MatchPlayer,
): number {
  const seed = crypto.randomInt(1, 0xffffffff);
  const decks: Record<SideId, SideDeck> = {
    a: { hero: playerA.hero, cards: playerA.cards },
    b: { hero: playerB.hero, cards: playerB.cards },
  };
  const created = createMatch({ seed, decks });

  const now = new Date().toISOString();
  db.run(
    `INSERT INTO matches
       (account_a, account_b, seed, decks_json, deck_names_json, state_json, seq, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    playerA.accountId,
    playerB.accountId,
    seed,
    JSON.stringify(decks),
    JSON.stringify({ a: playerA.deckName, b: playerB.deckName }),
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
    clock: newClock(),
    deadlineMs: 0,
    deadlineIsReaction: false,
    passesInARow: { a: 0, b: 0 },
    decks,
    commands: [],
    frames: [],
    deckNames: { a: playerA.deckName, b: playerB.deckName },
    startedAtMs: Date.now(),
  };
  liveOnes.set(id, live);
  // o primeiro quadro é a abertura: embaralhamento, mãos iniciais e quem começa
  keepFrame(db, live, null, created.events);
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

  // o registro do replay volta do banco junto com o estado: sem isto a partida
  // retomada depois de um restart chegaria ao fim sem poder ser revista
  const commands = db
    .all('SELECT command_json FROM match_commands WHERE match_id = ? ORDER BY ord', id)
    .map((line) => JSON.parse(text(line.command_json)) as Command);
  // e a fita em construção volta junto: os quadros do começo da partida foram
  // gravados antes do restart e não seriam recuperáveis de outro jeito
  const frames = liveFrames(db, id);

  const live: LiveMatch = {
    id,
    state: JSON.parse(text(row.state_json)) as GameState,
    accounts: { a: asInt(row.account_a), b: asInt(row.account_b) },
    nicknames: { a: nicknameOf(asInt(row.account_a)), b: nicknameOf(asInt(row.account_b)) },
    seq: asInt(row.seq),
    subscribers: new Map(),
    timer: null,
    clock: newClock(),
    deadlineMs: 0,
    deadlineIsReaction: false,
    passesInARow: { a: 0, b: 0 },
    decks: parseDecks(text(row.decks_json)),
    commands,
    frames,
    deckNames: parseDeckNames(text(row.deck_names_json)),
    startedAtMs: Date.parse(text(row.created_at)) || Date.now(),
  };
  liveOnes.set(id, live);
  armTimer(db, live);
  return live;
}

/** decks gravados na abertura; vazio só em partida anterior à decisão nº 43 */
function parseDecks(json: string): Record<SideId, SideDeck> {
  try {
    const parsed = JSON.parse(json) as Record<SideId, SideDeck>;
    if (parsed?.a?.cards && parsed?.b?.cards) return parsed;
  } catch {
    // registro velho ou corrompido: a partida segue, só não rende replay
  }
  return { a: { hero: '', cards: [] }, b: { hero: '', cards: [] } };
}

function parseDeckNames(json: string): Record<SideId, string> {
  try {
    const parsed = JSON.parse(json) as Record<SideId, string>;
    if (typeof parsed?.a === 'string' && typeof parsed?.b === 'string') return parsed;
  } catch {
    // idem
  }
  return { a: '', b: '' };
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

/**
 * Grava o quadro do passo que acabou de acontecer (decisão nº 44).
 *
 * Falhar aqui não pode derrubar a partida: o filme é para depois, e o jogo em
 * andamento vale mais que o arquivo dele. O que se perde num erro é fidelidade
 * do replay, e o arquivamento cai na reconstituição — nunca a partida.
 */
function keepFrame(db: Db, live: LiveMatch, command: Command | null, events: GameEvent[]): void {
  try {
    const frame = frameOfState(live.state, command, events);
    live.frames.push(frame);
    recordLiveFrame(db, live.id, live.frames.length, frame);
  } catch (error) {
    console.error('quadro não gravado', error);
  }
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
  // janela de reação: prazo curto e recusa automática, sem contar como passe. O
  // prazo do turno fica SEGURADO enquanto ela corre e volta de onde parou.
  const now = Date.now();
  const reaction = live.state.pending?.reaction ? live.state.pending : null;
  const deadline = advanceClock(live.clock, live.state, now);
  live.deadlineMs = deadline.deadlineMs;
  live.deadlineIsReaction = deadline.reaction;
  const delay = Math.max(0, deadline.deadlineMs - now);
  live.timer = setTimeout(() => {
    if (reaction) declineReaction(db, live, reaction.id, reaction.side);
    else timeOut(db, live);
  }, delay);
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
  // só comando ACEITO entra no registro: uma recusa gravada faria o passo
  // seguinte partir de um tabuleiro que nunca existiu
  live.commands.push(command);
  db.run(
    'INSERT INTO match_commands (match_id, ord, command_json) VALUES (?, ?, ?)',
    live.id,
    live.commands.length,
    JSON.stringify(command),
  );
  keepFrame(db, live, command, result.events);
  recordEvents(db, live, result.events);
  armTimer(db, live);

  if (live.state.winner) {
    for (const reply of live.subscribers.keys()) reply.end();
    live.subscribers.clear();
    if (live.timer) clearTimeout(live.timer);
    liveOnes.delete(live.id);
    archive(db, live);
  }
  return null;
}

/**
 * A partida acabou: fecha a fita e arquiva uma linha de histórico para cada lado
 * (decisões nº 43 e nº 44). Falhar aqui não pode derrubar o fim de jogo — o
 * desfecho já está no `matches`, e o arquivo é leitura posterior.
 *
 * Os quadros já estão prontos: foram gravados um a um enquanto a partida
 * acontecia. Reexecutar só entra como rede de segurança, para a partida que
 * começou antes desta decisão existir e portanto não tem fita nenhuma.
 */
function archive(db: Db, live: LiveMatch): void {
  if (!live.decks.a.cards.length || !live.decks.b.cards.length) return;
  const frames =
    live.frames.length === live.commands.length + 1
      ? live.frames
      : framesByReplaying(live.state.seed, live.decks, live.commands);
  if (!frames) {
    console.error('partida sem fita nem receita: histórico não gravado', live.id);
    return;
  }
  try {
    recordMatchHistory(db, {
      matchId: live.id,
      mode: 'online',
      seed: live.state.seed,
      decks: live.decks,
      commands: live.commands,
      frames,
      seconds: Math.round((Date.now() - live.startedAtMs) / 1000),
      players: [
        {
          accountId: live.accounts.a,
          side: 'a',
          opponent: live.nicknames.b,
          deckName: live.deckNames.a,
        },
        {
          accountId: live.accounts.b,
          side: 'b',
          opponent: live.nicknames.a,
          deckName: live.deckNames.b,
        },
      ],
    });
    // a fita está fechada: os quadros soltos da partida viva não servem mais
    dropLiveFrames(db, live.id);
  } catch (error) {
    console.error('histórico não gravado', error);
  }
}

function snapshot(live: LiveMatch, side: SideId): Record<string, unknown> {
  return {
    matchId: live.id,
    seq: live.seq,
    deadlineMs: live.deadlineMs,
    deadlineIsReaction: live.deadlineIsReaction,
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
      if (!side) return rejected(404, 'match_not_found');
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
      if (!side) return rejected(404, 'match_not_found');

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
        reply.writeHead(404, { 'content-type': 'application/json' });
        reply.end(JSON.stringify(rejected(404, 'match_not_found').body));
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
