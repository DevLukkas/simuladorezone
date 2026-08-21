import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildServer } from '../app.ts';
import { createMatch } from '../../src/engine/createMatch.ts';
import { reduce } from '../../src/engine/reduce.ts';
import { decideCommand } from '../../src/engine/bot.ts';
import { PLAYABLE_CARDS } from '../../src/data/cards.ts';
import { MAX_DECK_CARDS } from '../../src/data/deckRules.ts';
import { GAME_VERSION } from '../../src/shared/version.ts';
import { TAPE_FORMAT } from '../../src/shared/tape.ts';
import type { Command } from '../../src/engine/commands.ts';
import type { GameView } from '../../src/engine/view.ts';
import type { Db } from '../db.ts';
import type http from 'node:http';

/**
 * O arquivo de partidas e o replay (decisões nº 43 e nº 44).
 *
 * Três coisas se provam aqui. A AUTORIDADE: o treino chega do cliente como seed
 * + decks + comandos, e é o servidor que apura o desfecho — placar relatado não
 * é gravado. A REDAÇÃO: o replay é montado no servidor justamente para não
 * entregar a mão do oponente junto. E a FITA: rever é tocar o que foi gravado na
 * partida, não reexecutar o motor — o teste que cobra isso destrói a receita
 * (seed, decks, comandos) e exige que o replay continue idêntico.
 */

let root: string;
let base: string;
let server: http.Server;
let db: Db;

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  route: string,
  body?: unknown,
  token?: string | null,
): Promise<Reply> {
  const reply = await fetch(base + route, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: reply.status, body: (await reply.json()) as Record<string, unknown> };
}

async function guest(nickname: string): Promise<string> {
  const reply = await call('POST', '/api/guest', { nickname });
  return reply.body.token as string;
}

/** 40 cartas publicadas, respeitando o limite de cópias: uma de cada. */
const deckCards = (): Record<number, number> =>
  Object.fromEntries(
    PLAYABLE_CARDS.slice(0, MAX_DECK_CARDS).map((card) => [card.id, 1] as const),
  );

const deckList = (): number[] => PLAYABLE_CARDS.slice(0, MAX_DECK_CARDS).map((card) => card.id);

const DECKS = {
  a: { hero: 'badur', cards: deckList() },
  b: { hero: 'ispisher', cards: deckList() },
};

/** Uma partida de treino inteira, do jeito que o cliente a colhe. */
function botMatch(seed: number): { commands: Command[]; winner: string | null } {
  let state = createMatch({ seed, decks: DECKS }).state;
  const commands: Command[] = [];
  while (!state.winner && state.turn <= 300) {
    const side = state.pending?.side ?? (state.phase === 'mulligan' ? 'a' : state.activeSide);
    const command =
      decideCommand(state, side) ?? decideCommand(state, side === 'a' ? 'b' : 'a');
    if (!command) throw new Error('bot sem comando');
    const result = reduce(state, command);
    if (result.error) throw new Error(result.error);
    state = result.state;
    commands.push(command);
  }
  return { commands, winner: state.winner };
}

const SEED = 20260820;
const played = botMatch(SEED);

const trainingBody = (over: Record<string, unknown> = {}) => ({
  seed: SEED,
  decks: DECKS,
  commands: played.commands,
  side: 'a',
  seconds: 431,
  deckName: 'Maré de Aquarium',
  opponent: 'Bot',
  ...over,
});

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ezone-history-'));
  const built = buildServer(path.join(root, 'teste.db'), null);
  server = built.server;
  db = built.db;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('sem porta');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('arquivo do treino', () => {
  let token: string;

  beforeAll(async () => {
    token = await guest('Treinador');
  });

  test('sem conta não arquiva nada', async () => {
    const reply = await call('POST', '/api/history/training', trainingBody(), null);
    expect(reply.status).toBe(401);
  });

  test('grava a partida e apura o desfecho reexecutando o motor', async () => {
    const posted = await call('POST', '/api/history/training', trainingBody(), token);
    expect(posted.status).toBe(201);

    const listed = await call('GET', '/api/history', undefined, token);
    const matches = listed.body.matches as Record<string, unknown>[];
    expect(matches).toHaveLength(1);

    const entry = matches[0]!;
    expect(entry.mode).toBe('training');
    expect(entry.opponent).toBe('Bot');
    expect(entry.deckName).toBe('Maré de Aquarium');
    expect(entry.heroMe).toBe('badur');
    expect(entry.heroThem).toBe('ispisher');
    expect(entry.won).toBe(played.winner === 'a');
    expect(entry.turns).toBeGreaterThan(1);
    expect(entry.seconds).toBe(431);
    // 3 pontos vencem; quem perdeu tem menos
    expect(Math.max(entry.pointsMe as number, entry.pointsThem as number)).toBe(3);
  });

  test('a origem dos pontos soma exatamente o placar do dono', async () => {
    const listed = await call('GET', '/api/history', undefined, token);
    const entry = (listed.body.matches as Record<string, unknown>[])[0]!;
    const points = entry.points as { legendary: number; rare: number; direct: number };
    expect(points.legendary * 2 + points.rare + points.direct).toBe(entry.pointsMe);
  });

  test('partida sem desfecho é recusada', async () => {
    const reply = await call(
      'POST',
      '/api/history/training',
      trainingBody({ commands: played.commands.slice(0, 2) }),
      token,
    );
    expect(reply.status).toBe(422);
    expect((reply.body.error as { key: string }).key).toBe('error.match_not_finished');
  });

  test('registro que o motor recusa é malformado, não meia partida', async () => {
    const reply = await call(
      'POST',
      '/api/history/training',
      trainingBody({
        commands: [{ type: 'ATTACK', side: 'a', slot: 0 }, ...played.commands],
      }),
      token,
    );
    expect(reply.status).toBe(422);
    expect((reply.body.error as { key: string }).key).toBe('error.history_malformed');
  });

  test('carta que não existe no catálogo não derruba a rota', async () => {
    const reply = await call(
      'POST',
      '/api/history/training',
      trainingBody({ decks: { a: { hero: 'badur', cards: [999_999] }, b: DECKS.b } }),
      token,
    );
    expect(reply.status).toBe(422);
  });
});

describe('replay', () => {
  let token: string;
  let historyId: number;

  beforeAll(async () => {
    token = await guest('Espectador');
    await call('POST', '/api/history/training', trainingBody(), token);
    const listed = await call('GET', '/api/history', undefined, token);
    historyId = (listed.body.matches as { id: number }[])[0]!.id;
  });

  test('devolve um quadro por comando, mais a abertura', async () => {
    const reply = await call('GET', `/api/history/${historyId}/replay`, undefined, token);
    expect(reply.status).toBe(200);
    expect(reply.body.truncated).toBe(false);
    expect(reply.body.side).toBe('a');
    const frames = reply.body.frames as { view: GameView; events: unknown[] }[];
    expect(frames).toHaveLength(played.commands.length + 1);
    expect(frames[0]!.view.turn).toBe(1);
    expect(frames[frames.length - 1]!.view.winner).toBe(played.winner);
  });

  test('a visão do quadro é redigida: a mão do oponente é contagem, não carta', async () => {
    const reply = await call('GET', `/api/history/${historyId}/replay`, undefined, token);
    const frames = reply.body.frames as { view: GameView }[];
    for (const frame of frames) {
      expect(frame.view.side).toBe('a');
      expect(frame.view.opponent).not.toHaveProperty('hand');
      expect(typeof frame.view.opponent.handCount).toBe('number');
      // pendência de partida acabada não abre modal: ela é limpa no quadro
      expect(frame.view.pending).toBeNull();
    }
  });

  test('a compra do oponente chega sem a carta', async () => {
    const reply = await call('GET', `/api/history/${historyId}/replay`, undefined, token);
    const frames = reply.body.frames as { events: { type: string; side?: string; card?: unknown }[] }[];
    const theirDraws = frames
      .flatMap((frame) => frame.events)
      .filter((event) => event.type === 'CARD_DRAWN' && event.side === 'b');
    expect(theirDraws.length).toBeGreaterThan(0);
    for (const draw of theirDraws) expect(draw.card).toBeUndefined();
  });

  test('o arquivo é de quem jogou: outra conta não abre', async () => {
    const stranger = await guest('Xereta');
    const listed = await call('GET', '/api/history', undefined, stranger);
    expect(listed.body.matches).toEqual([]);

    const reply = await call('GET', `/api/history/${historyId}/replay`, undefined, stranger);
    expect(reply.status).toBe(404);
  });
});

describe('a fita (decisão nº 44)', () => {
  let token: string;
  let historyId: number;

  beforeAll(async () => {
    token = await guest('Arquivista');
    await call('POST', '/api/history/training', trainingBody(), token);
    const listed = await call('GET', '/api/history', undefined, token);
    historyId = (listed.body.matches as { id: number }[])[0]!.id;
  });

  test('a partida é gravada em fita, carimbada com a versão do jogo', async () => {
    const reply = await call('GET', `/api/history/${historyId}/replay`, undefined, token);
    expect(reply.status).toBe(200);
    expect(reply.body.source).toBe('tape');
    expect(reply.body.version).toBe(GAME_VERSION);
    expect(typeof reply.body.recordedAt).toBe('string');
    expect(reply.body.truncated).toBe(false);
  });

  test('uma fita por partida, gzipada, com um quadro por passo', () => {
    const row = db.one(
      `SELECT t.* FROM match_tapes t
         JOIN match_history h ON h.tape_id = t.id
        WHERE h.id = ?`,
      historyId,
    );
    expect(row).not.toBeNull();
    expect(Number(row!.format)).toBe(TAPE_FORMAT);
    expect(String(row!.version)).toBe(GAME_VERSION);
    expect(Number(row!.frames)).toBe(played.commands.length + 1);
    // o gzip é o que torna a fita mais barata que a receita que ela aposenta
    expect((row!.tape_gz as Uint8Array).byteLength).toBeLessThan(Number(row!.bytes) / 4);
  });

  /**
   * O teste que dá nome à decisão. A receita (seed + decks + comandos) é
   * DESTRUÍDA no banco e o replay tem de sair byte a byte igual — porque ele não
   * a lê. É o mesmo que aconteceria se uma regra mudasse: a fita não pergunta
   * nada ao motor de hoje.
   */
  test('receita destruída, replay intacto: tocar a fita não passa pelo motor', async () => {
    const before = await call('GET', `/api/history/${historyId}/replay`, undefined, token);
    db.run(
      `UPDATE match_history
          SET seed = 0, decks_json = '', commands_json = '[]'
        WHERE id = ?`,
      historyId,
    );
    const after = await call('GET', `/api/history/${historyId}/replay`, undefined, token);

    expect(after.status).toBe(200);
    expect(after.body.source).toBe('tape');
    expect(JSON.stringify(after.body.frames)).toBe(JSON.stringify(before.body.frames));
  });

  test('e mesmo sem receita a fita segue redigida: nada de mão do oponente', async () => {
    const reply = await call('GET', `/api/history/${historyId}/replay`, undefined, token);
    const frames = reply.body.frames as { view: GameView }[];
    for (const frame of frames) {
      expect(frame.view.opponent).not.toHaveProperty('hand');
      expect(typeof frame.view.opponent.handCount).toBe('number');
    }
  });

  /**
   * Linha anterior à decisão nº 44: não tem fita, então sobra reconstituir com o
   * motor de hoje. Sai marcada como reconstituição e sem versão — a tela põe o
   * carimbo vermelho no canto em vez de mentir que aquilo é o que aconteceu.
   */
  test('linha sem fita cai na reconstituição, e o diz', async () => {
    const other = await guest('Saudosista');
    await call('POST', '/api/history/training', trainingBody(), other);
    const listed = await call('GET', '/api/history', undefined, other);
    const id = (listed.body.matches as { id: number }[])[0]!.id;
    db.run('UPDATE match_history SET tape_id = NULL WHERE id = ?', id);

    const reply = await call('GET', `/api/history/${id}/replay`, undefined, other);
    expect(reply.status).toBe(200);
    expect(reply.body.source).toBe('engine');
    expect(reply.body.version).toBeNull();
    expect((reply.body.frames as unknown[]).length).toBe(played.commands.length + 1);
  });

  test('sem fita E sem receita não há replay que se monte', async () => {
    const other = await guest('Perdido');
    await call('POST', '/api/history/training', trainingBody(), other);
    const listed = await call('GET', '/api/history', undefined, other);
    const id = (listed.body.matches as { id: number }[])[0]!.id;
    db.run("UPDATE match_history SET tape_id = NULL, decks_json = '' WHERE id = ?", id);

    const reply = await call('GET', `/api/history/${id}/replay`, undefined, other);
    expect(reply.status).toBe(422);
  });
});

describe('arquivo do online', () => {
  test('a partida acabada rende uma linha para cada lado, com o placar espelhado', async () => {
    const one = await guest('Ravena');
    const two = await guest('Krauss');

    for (const [token, hero] of [
      [one, 'badur'],
      [two, 'ispisher'],
    ] as const) {
      const deck = await call(
        'POST',
        '/api/decks',
        { name: `Deck de ${hero}`, hero, cards: deckCards() },
        token,
      );
      expect(deck.status).toBe(201);
      await call('POST', '/api/queue', { deckId: deck.body.id }, token);
    }

    const current = await call('GET', '/api/matches/current', undefined, one);
    const matchId = current.body.matchId as number;
    expect(matchId).toBeGreaterThan(0);

    // desistir é o caminho mais curto até um desfecho de verdade
    const conceded = await call(
      'POST',
      `/api/matches/${matchId}/commands`,
      { command: { type: 'CONCEDE' } },
      one,
    );
    expect(conceded.status).toBe(200);

    const mine = (await call('GET', '/api/history', undefined, one)).body.matches as Record<
      string,
      unknown
    >[];
    const theirs = (await call('GET', '/api/history', undefined, two)).body.matches as Record<
      string,
      unknown
    >[];

    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    expect(mine[0]!.mode).toBe('online');
    expect(mine[0]!.won).toBe(false);
    expect(theirs[0]!.won).toBe(true);
    expect(mine[0]!.opponent).toBe('Krauss');
    expect(theirs[0]!.opponent).toBe('Ravena');
    expect(mine[0]!.reason).toBe('concede');
    expect(mine[0]!.deckName).toBe('Deck de badur');

    // cada lado enxerga o replay do SEU lado
    const replay = await call(
      'GET',
      `/api/history/${(theirs[0]!.id as number)}/replay`,
      undefined,
      two,
    );
    expect(replay.status).toBe(200);
    expect(replay.body.side).toBe('b');
    // a partida online foi GRAVADA enquanto acontecia, não reexecutada no fim
    expect(replay.body.source).toBe('tape');
    expect(replay.body.version).toBe(GAME_VERSION);

    // e a fita é UMA: as duas linhas de histórico apontam para o mesmo filme
    const tapeOfMine = db.one('SELECT tape_id FROM match_history WHERE id = ?', mine[0]!.id as number);
    const tapeOfTheirs = db.one(
      'SELECT tape_id FROM match_history WHERE id = ?',
      theirs[0]!.id as number,
    );
    expect(tapeOfMine!.tape_id).not.toBeNull();
    expect(tapeOfMine!.tape_id).toBe(tapeOfTheirs!.tape_id);

    // o log oculto da partida viva some quando a fita fecha
    const leftovers = db.all('SELECT ord FROM match_frames WHERE match_id = ?', matchId);
    expect(leftovers).toHaveLength(0);
  });
});
