import zlib from 'node:zlib';
import { TAPE_FORMAT, type MatchTape, type TapeFrame } from '../src/shared/tape.ts';
import { GAME_VERSION } from '../src/shared/version.ts';
import { asInt, text } from './db.ts';
import type { Db } from './db.ts';
import type { SideDeck } from '../src/engine/createMatch.ts';
import type { SideId } from '../src/engine/state.ts';

/**
 * Onde a fita da partida mora (decisão nº 44).
 *
 * Duas coisas acontecem aqui e nada mais: a partida VIVA deixa um quadro por
 * comando em `match_frames` (o log oculto — se o servidor cair no meio, o filme
 * continua de onde parou), e a partida ACABADA fecha esses quadros numa fita
 * gzipada em `match_tapes`, uma por partida, apontada pelas linhas de histórico
 * dos dois lados.
 *
 * O gzip não é economia de perfumaria: medido em 5 partidas de bot, a fita crua
 * dá 114 KB de média e comprimida dá 3 KB — um filme completo custando menos que
 * a receita (seed + comandos) que ele aposenta.
 */

/**
 * Teto de quadros por fita. Partida de verdade fica em ~70; isto é fusível
 * contra registro absurdo, não limite de jogo.
 */
const MAX_FRAMES = 8_000;

export interface SealedTape {
  id: number;
  format: number;
  version: string;
  recordedAt: string;
  frames: number;
}

/** Fecha os quadros numa fita, carimbando a versão do jogo que os gravou. */
export function sealTape(input: {
  seed: number;
  decks: Record<SideId, SideDeck>;
  frames: readonly TapeFrame[];
}): MatchTape {
  return {
    format: TAPE_FORMAT,
    version: GAME_VERSION,
    recordedAt: new Date().toISOString(),
    seed: input.seed,
    decks: input.decks,
    frames: input.frames.slice(0, MAX_FRAMES) as TapeFrame[],
  };
}

/** Grava a fita e devolve o id que as linhas de histórico vão apontar. */
export function saveTape(
  db: Db,
  tape: MatchTape,
  about: { matchId: number | null; mode: 'online' | 'training' },
): number {
  const json = JSON.stringify(tape);
  const packed = zlib.gzipSync(Buffer.from(json, 'utf8'));
  db.run(
    `INSERT INTO match_tapes
       (match_id, mode, format, version, frames, bytes, tape_gz, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    about.matchId,
    about.mode,
    tape.format,
    tape.version,
    tape.frames.length,
    json.length,
    packed,
    tape.recordedAt,
  );
  return asInt(db.one('SELECT last_insert_rowid() AS id')?.id);
}

/**
 * Lê a fita de volta. Formato desconhecido devolve `null` em vez de tocar às
 * cegas: uma fita que este código não sabe ler seria pior que nenhuma — mentiria
 * com cara de partida.
 */
export function loadTape(db: Db, id: number): MatchTape | null {
  const row = db.one('SELECT * FROM match_tapes WHERE id = ?', id);
  if (!row) return null;
  if (asInt(row.format) !== TAPE_FORMAT) return null;
  const packed = row.tape_gz;
  if (!(packed instanceof Uint8Array)) return null;
  try {
    const tape = JSON.parse(zlib.gunzipSync(packed).toString('utf8')) as MatchTape;
    return Array.isArray(tape.frames) && tape.frames.length ? tape : null;
  } catch {
    // fita corrompida no disco: a tela cai na reconstituição, avisando que é uma
    return null;
  }
}

/* ── o log oculto da partida viva ─────────────────────────────────────────── */

/** Um quadro da partida em andamento, gravado no ato em que o motor o produziu. */
export function recordLiveFrame(db: Db, matchId: number, ord: number, frame: TapeFrame): void {
  if (ord > MAX_FRAMES) return;
  db.run(
    'INSERT OR REPLACE INTO match_frames (match_id, ord, frame_json) VALUES (?, ?, ?)',
    matchId,
    ord,
    JSON.stringify(frame),
  );
}

/** Os quadros gravados até agora, na ordem — inclusive os de antes de um restart. */
export function liveFrames(db: Db, matchId: number): TapeFrame[] {
  return db
    .all('SELECT frame_json FROM match_frames WHERE match_id = ? ORDER BY ord', matchId)
    .map((row) => JSON.parse(text(row.frame_json)) as TapeFrame);
}

/** A fita está fechada: os quadros soltos não servem mais a ninguém. */
export function dropLiveFrames(db: Db, matchId: number): void {
  db.run('DELETE FROM match_frames WHERE match_id = ?', matchId);
}
