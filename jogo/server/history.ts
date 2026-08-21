import { cardById } from '../src/data/cards.ts';
import { validateDeckContents } from '../src/data/deckRules.ts';
import { replayMatch } from '../src/engine/replay.ts';
import { redactEvent, viewFor, type GameView } from '../src/engine/view.ts';
import { oppositeSide, type SideId } from '../src/engine/state.ts';
import {
  eventsOfFrame,
  frameOfState,
  viewOfFrame,
  type TapeFrame,
} from '../src/shared/tape.ts';
import type { SideDeck } from '../src/engine/createMatch.ts';
import type { Command } from '../src/engine/commands.ts';
import type { GameEvent } from '../src/engine/events.ts';
import { text, cardRef, type TextRef } from '../src/shared/text.ts';
import { asInt, text as str } from './db.ts';
import { withAccount } from './accounts.ts';
import { created, ok, rejected } from './http.ts';
import { fuse } from './rateLimit.ts';
import { loadTape, saveTape, sealTape } from './tapes.ts';
import type { Db, Row } from './db.ts';
import type { Route } from './http.ts';

/**
 * O histórico de partidas e o replay (decisões nº 43 e nº 44).
 *
 * **Rever não é reexecutar; é tocar a fita.** A linha do histórico aponta para
 * uma FITA (`match_tapes`): a partida gravada quadro a quadro no momento em que
 * aconteceu, com a versão do jogo carimbada nela. Tocar é percorrer os quadros —
 * nenhuma regra é consultada, nenhum comando é validado, nada é recalculado. Uma
 * partida de agosto continua sendo a partida de agosto depois de qualquer
 * mudança no motor, que é o ponto inteiro da decisão nº 44.
 *
 * A reexecução (`replayMatch`) sobrou em dois lugares, e nos dois ela é a
 * GRAVAÇÃO, nunca a leitura: o treino chega do cliente como seed + decks +
 * comandos e é reexecutado UMA vez, aqui, para virar fita e apurar o desfecho.
 * Linha antiga (anterior à decisão nº 44) não tem fita e cai na reexecução de
 * antes — a tela avisa que aquilo é reconstituição, não o que se viu na hora.
 *
 * O servidor continua sendo a autoridade: placar relatado pelo cliente não é
 * gravado em lugar nenhum — é apurado da fita.
 */

/** de onde vieram os pontos: as três fontes que o motor conhece */
export interface PointSources {
  /** lendária abatida vale 2 */
  legendary: number;
  /** rara abatida vale 1 */
  rare: number;
  /** a cada 5 de dano direto, 1 ponto */
  direct: number;
}

export interface Highlight {
  turn: number;
  ref: TextRef;
  tone: 'good' | 'bad' | 'neutral';
}

export interface MatchSummary {
  winner: SideId | null;
  reason: string;
  turns: number;
  pointsMe: number;
  pointsThem: number;
  directDealt: number;
  directTaken: number;
  points: PointSources;
  highlights: Highlight[];
}

/** teto de destaques por partida: a coluna da direita não é o registro inteiro */
const MAX_HIGHLIGHTS = 14;
/** o que a tela lista de uma vez */
const HISTORY_PAGE = 60;
/** guardas do corpo que chega do treino */
const MAX_COMMANDS = 4_000;
/** teto de FORMA da lista de cartas; o teto de REGRA é o `MAX_DECK_CARDS` */
const MAX_DECK_CARDS_RECORDED = 120;
const MAX_SECONDS = 24 * 60 * 60;
const MAX_NAME = 60;

/**
 * Fusível do arquivamento de treino, por CONTA.
 *
 * É a rota mais cara do servidor: reexecuta a partida inteira no motor, comprime
 * a fita e grava — tudo na única thread que também atende as partidas ao vivo.
 * A chave é a conta (e não a origem) porque aqui já há alguém autenticado, o que
 * a torna imune à ressalva do proxy.
 *
 * 20 por 10 minutos é folga larga: uma partida de treino de verdade leva
 * minutos, então ninguém jogando chega perto do teto.
 */
const trainingFuse = fuse(20, 10 * 60);

/**
 * Lê a FITA do ponto de vista de um lado: placar, duração e os momentos que
 * valem uma linha na coluna da direita.
 *
 * Lê a fita e não o motor de propósito: o relatório de uma partida de agosto tem
 * de continuar dizendo o que ela dizia em agosto. Como a fita é gravada uma vez
 * e nunca mais tocada, o resumo é estável pelo mesmo motivo que o replay é.
 *
 * A atribuição do ponto é feita pela ORDEM dos eventos, que é a ordem em que o
 * motor os emitiu: `dealDirectDamage` empurra o `DIRECT_DAMAGE` e só então chama
 * `addPoints`, enquanto a destruição pontua ANTES de anunciar a criatura morta.
 * Então o `SCORED` colado num `DIRECT_DAMAGE` é dano direto, e o resto é abate —
 * 2 pontos de uma vez é lendária, 1 é rara.
 */
export function summarize(
  frames: readonly TapeFrame[],
  side: SideId,
  opponent: string,
): MatchSummary {
  const foe = oppositeSide(side);
  const points: PointSources = { legendary: 0, rare: 0, direct: 0 };
  const highlights: Highlight[] = [];
  /** uid da criatura em campo → carta que ela é, colhido dos próprios eventos */
  const identity = new Map<string, number>();
  let directDealt = 0;
  let directTaken = 0;
  let afterDirectDamage = false;

  /**
   * O desfecho entra SEMPRE (`ending`). O teto vale para os lances do meio: uma
   * partida cheia de pontuações não pode empurrar para fora justamente a linha
   * que diz como ela acabou — quando o teto estoura, quem sai é o penúltimo.
   */
  const push = (
    turn: number,
    ref: TextRef,
    tone: Highlight['tone'],
    ending = false,
  ): void => {
    if (highlights.length >= MAX_HIGHLIGHTS) {
      if (!ending) return;
      highlights.pop();
    }
    highlights.push({ turn, ref, tone });
  };

  for (const frame of frames) {
    const turn = frame.turn;
    for (const event of frame.events) {
      switch (event.type) {
        case 'CREATURE_SUMMONED':
        case 'SUMMONED_FROM_DECK':
        case 'SUMMONED_FROM_DISCARD':
          identity.set(event.card.uid, event.card.cardId);
          break;

        case 'DIRECT_DAMAGE':
          if (event.sufferer === side) directTaken += event.value;
          else directDealt += event.value;
          // um só golpe pode render dois pontos (10 de dano = 5+5), e os dois
          // `SCORED` saem colados: a marca vale até o próximo evento que não
          // seja pontuação
          afterDirectDamage = true;
          continue;

        case 'SCORED': {
          const mine = event.side === side;
          if (mine) {
            if (afterDirectDamage) points.direct += event.gained;
            else if (event.gained >= 2) points.legendary += 1;
            else points.rare += 1;
          }
          push(
            turn,
            mine
              ? text('history.event.scoredYou', { gained: event.gained, total: event.total })
              : text('history.event.scoredThem', {
                  name: opponent,
                  gained: event.gained,
                  total: event.total,
                }),
            mine ? 'good' : 'bad',
          );
          continue;
        }

        // a lendária que cai é o momento que a partida vira: vale a linha mesmo
        // quando o ponto dela não fecha nada
        case 'CREATURE_DESTROYED': {
          if (!event.toDiscard) break;
          const fallen = identity.get(event.uid);
          if (fallen === undefined || cardById(fallen).rarity !== 'legendary') break;
          push(
            turn,
            text(
              event.side === side ? 'history.event.myLegendaryFell' : 'history.event.theirLegendaryFell',
              { card: cardRef(fallen), name: opponent },
            ),
            event.side === side ? 'bad' : 'good',
          );
          break;
        }

        case 'GAME_OVER':
          push(
            turn,
            text(event.winner === side ? 'history.event.won' : 'history.event.lost', {
              reason: text(
                event.reason === 'points'
                  ? 'board.byPoints'
                  : event.reason === 'concede'
                    ? 'board.byConcede'
                    : 'board.byTimeout',
              ),
            }),
            event.winner === side ? 'good' : 'bad',
            true,
          );
          break;

        default:
          break;
      }
      afterDirectDamage = false;
    }
  }

  const last = frames[frames.length - 1]!;
  return {
    winner: last.winner,
    reason: last.endReason ?? 'points',
    turns: last.turn,
    pointsMe: last.sides[side].points,
    pointsThem: last.sides[foe].points,
    directDealt,
    directTaken,
    points,
    highlights,
  };
}

/* ── gravação ────────────────────────────────────────────────────────────── */

export interface RecordedMatch {
  /** partida online de origem; ausente no treino */
  matchId?: number;
  mode: 'online' | 'training';
  seed: number;
  decks: Record<SideId, SideDeck>;
  commands: Command[];
  /**
   * A FITA (decisão nº 44): os quadros pelos quais o tabuleiro passou, na ordem.
   * No online eles vêm do log oculto da partida viva — foram gravados enquanto
   * ela acontecia. No treino saem da única reexecução que o servidor faz, ao
   * conferir o que o cliente enviou. Depois daqui, ninguém mais os recalcula.
   */
  frames: TapeFrame[];
  seconds: number;
  /** uma entrada por conta: o mesmo registro visto de cada lado */
  players: { accountId: number; side: SideId; opponent: string; deckName: string }[];
}

/**
 * Arquiva a partida: uma FITA e uma linha por conta.
 *
 * A fita é uma só — ela é da partida. As linhas é que são duas no online, porque
 * o resumo é redigido do ponto de vista de quem lê: o mesmo `SCORED` é "você
 * marca" de um lado e "Ravena marca" do outro. As duas apontam para a mesma
 * fita, então rever de qualquer um dos lados é rever o mesmo filme.
 */
export function recordMatchHistory(db: Db, match: RecordedMatch): void {
  const last = match.frames[match.frames.length - 1];
  // partida sem desfecho não entra no arquivo: o histórico é de partidas jogadas
  if (!last?.winner) return;

  const endedAt = new Date().toISOString();
  const decksJson = JSON.stringify(match.decks);
  const commandsJson = JSON.stringify(match.commands);
  const seconds = Math.max(0, Math.min(MAX_SECONDS, Math.round(match.seconds)));
  const tape = sealTape({ seed: match.seed, decks: match.decks, frames: match.frames });

  db.inTransaction(() => {
    const tapeId = saveTape(db, tape, {
      matchId: match.matchId ?? null,
      mode: match.mode,
    });
    for (const player of match.players) {
      const summary = summarize(match.frames, player.side, player.opponent);
      db.run(
        `INSERT INTO match_history (
           account_id, match_id, mode, side, opponent, won, reason, turns, seconds,
           points_me, points_them, direct_dealt, direct_taken, hero_me, hero_them,
           deck_name, points_json, highlights_json, seed, decks_json, commands_json,
           tape_id, ended_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        player.accountId,
        match.matchId ?? null,
        match.mode,
        player.side,
        player.opponent,
        summary.winner === player.side ? 1 : 0,
        summary.reason,
        summary.turns,
        seconds,
        summary.pointsMe,
        summary.pointsThem,
        summary.directDealt,
        summary.directTaken,
        match.decks[player.side].hero,
        match.decks[oppositeSide(player.side)].hero,
        player.deckName,
        JSON.stringify(summary.points),
        JSON.stringify(summary.highlights),
        match.seed,
        decksJson,
        commandsJson,
        tapeId,
        endedAt,
      );
    }
  });
}

/**
 * Reexecuta uma partida para GRAVÁ-LA. É o único uso que sobrou do motor no
 * arquivo, e ele acontece uma vez só, no ato de arquivar: o treino roda no
 * cliente e o servidor precisa conferir o que recebeu antes de acreditar.
 *
 * Devolve `null` quando o registro não fecha — comando recusado ou carta que
 * saiu do catálogo. O que fecha vira fita e nunca mais passa por aqui.
 */
export function framesByReplaying(
  seed: number,
  decks: Record<SideId, SideDeck>,
  commands: readonly Command[],
): TapeFrame[] | null {
  let replayed;
  try {
    replayed = replayMatch({ seed, decks }, commands);
  } catch {
    return null;
  }
  if (replayed.truncated) return null;
  return replayed.steps.map((step) => frameOfState(step.state, step.command, step.events));
}

/* ── leitura ─────────────────────────────────────────────────────────────── */

/** A linha como a tela a lê: sem seed, sem decks e sem o registro de comandos. */
function entryOf(row: Row): Record<string, unknown> {
  return {
    id: asInt(row.id),
    mode: str(row.mode),
    opponent: str(row.opponent),
    won: asInt(row.won) === 1,
    reason: str(row.reason),
    turns: asInt(row.turns),
    seconds: asInt(row.seconds),
    pointsMe: asInt(row.points_me),
    pointsThem: asInt(row.points_them),
    directDealt: asInt(row.direct_dealt),
    directTaken: asInt(row.direct_taken),
    heroMe: str(row.hero_me),
    heroThem: str(row.hero_them),
    deckName: str(row.deck_name),
    points: JSON.parse(str(row.points_json) || '{}') as PointSources,
    highlights: JSON.parse(str(row.highlights_json) || '[]') as Highlight[],
    endedAt: str(row.ended_at),
  };
}

/**
 * Um quadro do replay como o cliente o recebe: a visão DEPOIS do passo e o que o
 * passo emitiu, os dois já redigidos para quem está assistindo.
 *
 * A redação acontece AQUI, na saída, e não na fita: a fita guarda a partida
 * inteira (é a única testemunha dela), e é o servidor que decide o que cada
 * espectador pode ver. Rever a própria partida não é ganhar raio-X do baralho do
 * oponente (invariante 4) — e é também por isso que a fita nunca sai crua.
 */
export interface ReplayFrame {
  view: GameView;
  events: GameEvent[];
}

/** A fita, quadro a quadro, pelos olhos de um lado. Nenhuma regra é consultada. */
function playTape(frames: readonly TapeFrame[], side: SideId): ReplayFrame[] {
  return frames.map((frame) => ({
    view: viewOfFrame(frame, side),
    events: eventsOfFrame(frame, side),
  }));
}

/* ── entrada do treino ───────────────────────────────────────────────────── */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A FORMA do baralho que chega no corpo; se ele é legal, quem diz é `deckProblems`. */
function deckFromBody(value: unknown): SideDeck | null {
  if (!isObject(value)) return null;
  if (typeof value.hero !== 'string' || !Array.isArray(value.cards)) return null;
  if (!value.cards.length || value.cards.length > MAX_DECK_CARDS_RECORDED) return null;
  const cards: number[] = [];
  for (const card of value.cards) {
    if (!Number.isInteger(card)) return null;
    cards.push(card as number);
  }
  return { hero: value.hero, cards };
}

/**
 * Os dois baralhos do treino conferidos contra as MESMAS regras de construção
 * que o PvP cobra — herói do catálogo, carta publicada, teto de cópias e de
 * tamanho.
 *
 * Conferir aqui não é zelo repetido: no online os baralhos saem do banco, já
 * validados na gravação, mas o treino roda no cliente e chega inteiro pelo corpo
 * do pedido — herói, cartas e quantidades vêm de quem pediu. Sem esta conta, um
 * registro com 120 cópias da mesma lendária era aceito e virava fita: partida
 * impossível arquivada como se tivesse acontecido, do lado do jogador E do lado
 * do bot.
 *
 * A lista vira contagem por id porque a regra fala de CÓPIAS e a fita fala de
 * cartas: são o mesmo baralho visto de dois lados.
 */
function deckProblems(decks: Record<SideId, SideDeck>): TextRef[] {
  const problems: TextRef[] = [];
  for (const side of ['a', 'b'] as const) {
    const copies: Record<number, number> = {};
    for (const cardId of decks[side].cards) copies[cardId] = (copies[cardId] ?? 0) + 1;
    problems.push(...validateDeckContents(decks[side].hero, copies));
  }
  return problems;
}

interface TrainingBody {
  seed: number;
  decks: Record<SideId, SideDeck>;
  commands: Command[];
  side: SideId;
  seconds: number;
  deckName: string;
  opponent: string;
}

function trainingFromBody(body: unknown): TrainingBody | null {
  if (!isObject(body)) return null;
  if (!Number.isInteger(body.seed)) return null;
  if (!isObject(body.decks)) return null;
  const a = deckFromBody(body.decks.a);
  const b = deckFromBody(body.decks.b);
  if (!a || !b) return null;
  if (!Array.isArray(body.commands) || body.commands.length > MAX_COMMANDS) return null;
  for (const command of body.commands) {
    if (!isObject(command) || typeof command.type !== 'string') return null;
  }
  const side: SideId = body.side === 'b' ? 'b' : 'a';

  return {
    seed: body.seed as number,
    decks: { a, b },
    commands: body.commands as Command[],
    side,
    seconds: typeof body.seconds === 'number' && Number.isFinite(body.seconds) ? body.seconds : 0,
    deckName: typeof body.deckName === 'string' ? body.deckName.trim().slice(0, MAX_NAME) : '',
    opponent: typeof body.opponent === 'string' ? body.opponent.trim().slice(0, MAX_NAME) : '',
  };
}

export const historyRoutes = (db: Db): Route[] => [
  {
    method: 'GET',
    pattern: '/api/history',
    handle: withAccount(db, (_request, account) => {
      const rows = db.all(
        'SELECT * FROM match_history WHERE account_id = ? ORDER BY id DESC LIMIT ?',
        account.id,
        HISTORY_PAGE,
      );
      return ok({ matches: rows.map(entryOf) });
    }),
  },
  {
    method: 'GET',
    pattern: '/api/history/:id/replay',
    handle: withAccount(db, (request, account) => {
      const row = db.one(
        'SELECT * FROM match_history WHERE id = ? AND account_id = ?',
        Number(request.params.id),
        account.id,
      );
      if (!row) return rejected(404, 'history_not_found');

      const side: SideId = str(row.side) === 'b' ? 'b' : 'a';
      const opponent = str(row.opponent);

      // o caminho normal (decisão nº 44): a fita. Tocar é percorrer quadros —
      // regra nenhuma é consultada, então mudar o motor não mexe nesta partida
      const tape = row.tape_id === null ? null : loadTape(db, asInt(row.tape_id));
      if (tape) {
        return ok({
          side,
          opponent,
          source: 'tape',
          version: tape.version,
          recordedAt: tape.recordedAt,
          truncated: false,
          frames: playTape(tape.frames, side),
        });
      }

      // linha anterior à fita (ou fita ilegível): sobra reconstituir com o motor
      // de HOJE a partir da receita. Vai marcada como reconstituição, porque é o
      // que ela é — e uma regra que mudou desde então interrompe no meio
      let replayed;
      try {
        const decks = JSON.parse(str(row.decks_json) || 'null') as Record<SideId, SideDeck> | null;
        const commands = JSON.parse(str(row.commands_json) || '[]') as Command[];
        if (!decks) return rejected(422, 'replay_unavailable');
        replayed = replayMatch({ seed: asInt(row.seed), decks }, commands);
      } catch {
        // receita ilegível, ou carta que saiu do catálogo depois da partida: o
        // motor não abre a mesa, e sem fita não há de onde tirar o tabuleiro
        return rejected(422, 'replay_unavailable');
      }

      return ok({
        side,
        opponent,
        source: 'engine',
        version: null,
        recordedAt: null,
        truncated: replayed.truncated,
        frames: replayed.steps.map((step) => ({
          // a pendência de uma partida acabada seria modal sem dono: o comando
          // que a resolveu já está no passo seguinte
          view: { ...viewFor(step.state, side), pending: null, waitingForOpponent: false },
          events: step.events.map((event) => redactEvent(event, side)),
        })),
      });
    }),
  },
  {
    /**
     * O treino roda no cliente (é ele quem tem o bot), então a partida chega
     * pronta para ser CONFERIDA: seed + decks + comandos, e o servidor reexecuta
     * UMA vez para apurar o desfecho e gravar a fita. O que o cliente diz sobre o
     * placar não é lido.
     *
     * Esta reexecução é a GRAVAÇÃO, não a leitura: ela acontece com o motor da
     * época, no dia da partida, e o que ela produz vira fita. Rever depois nunca
     * mais passa por aqui. Subir a fita pronta do cliente seria mais fiel ainda,
     * mas são ~114 KB por partida contra 3 KB de receita — e o cliente e o
     * servidor são o mesmo build, então o motor que confere é o que jogou.
     */
    method: 'POST',
    pattern: '/api/history/training',
    maxBody: 512 * 1024,
    handle: withAccount(db, (request, account) => {
      const wait = trainingFuse(String(account.id));
      if (wait > 0) return rejected(429, 'too_many_attempts', { seconds: wait });

      const body = trainingFromBody(request.body);
      if (!body) return rejected(400, 'history_malformed');

      // baralho ilegal é recusa de REGRA, não de forma: sai com a lista de
      // problemas, do mesmo jeito que o construtor de decks responde
      const problems = deckProblems(body.decks);
      if (problems.length) return rejected(422, 'history_malformed', undefined, problems);

      const frames = framesByReplaying(body.seed, body.decks, body.commands);
      if (!frames) return rejected(422, 'history_malformed');
      if (!frames[frames.length - 1]!.winner) return rejected(422, 'match_not_finished');

      recordMatchHistory(db, {
        mode: 'training',
        seed: body.seed,
        decks: body.decks,
        commands: body.commands,
        frames,
        seconds: body.seconds,
        players: [
          {
            accountId: account.id,
            side: body.side,
            opponent: body.opponent || 'Bot',
            deckName: body.deckName,
          },
        ],
      });
      return created({ recorded: true });
    }),
  },
];
