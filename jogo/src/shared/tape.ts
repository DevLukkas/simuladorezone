import { oppositeSide, type CardInZone, type CreatureInPlay, type GameState, type Phase, type SideId, type TurnActions } from '../engine/state.ts';
import { redactEvent, type GameView } from '../engine/view.ts';
import type { Command } from '../engine/commands.ts';
import type { GameEvent } from '../engine/events.ts';
import type { SideDeck } from '../engine/createMatch.ts';

/**
 * A FITA da partida (decisão nº 44): o que aconteceu, quadro a quadro, gravado
 * enquanto acontecia.
 *
 * A decisão nº 43 guardava a RECEITA (seed + decks + comandos) e rever era
 * reexecutar o motor. Funcionava enquanto o motor não mudasse — e motor muda.
 * Uma regra nova reescrevia partidas antigas, e um comando que deixou de ser
 * legal interrompia o replay no meio (`truncated`). Um arquivo que a próxima
 * versão do jogo reescreve não é arquivo.
 *
 * Aqui a partida vira dado. A fita não é código, não é regra e não é reexecução:
 * é a lista dos quadros pelos quais o tabuleiro passou, cada um com o comando
 * que o produziu e os eventos que ele emitiu. Rever é PERCORRER a fita. Nada
 * valida nada — o que está gravado é o que aconteceu, e um motor de daqui a dois
 * anos toca a mesma partida quadro a quadro sem opinar sobre ela.
 *
 * O único pedaço do motor que a LEITURA usa é a redação de eventos, e de
 * propósito: redação duplicada é redação que um dia diverge e vaza a mão do
 * oponente (invariante 4). Regra nenhuma é consultada.
 *
 * A GRAVAÇÃO, essa sim, conhece o `GameState` — é o motor da época escrevendo o
 * que ele acabou de fazer. Depois de gravada, a fita não é mais tocada.
 */

/**
 * Formato do que está GRAVADO. Sobe quando um quadro muda de forma — nunca para
 * acompanhar mudança de regra, que a fita antiga já tem resolvida dentro dela.
 * Fita de formato desconhecido não é tocada às cegas: é recusada.
 */
export const TAPE_FORMAT = 1;

/**
 * Um lado do tabuleiro num quadro, COMPLETO — a mão inclusive.
 *
 * A fita guarda a verdade inteira porque ela é a única testemunha da partida;
 * quem esconde é a leitura (`viewOfFrame`), do lado do servidor. Guardar duas
 * versões redigidas custaria o dobro e ainda deixaria o arquivo sem ninguém que
 * soubesse o que de fato estava na mão de quem.
 */
export interface TapeSide {
  hero: string;
  points: number;
  directDamage: number;
  deckCount: number;
  field: (CreatureInPlay | null)[];
  scenario: CardInZone | null;
  discard: CardInZone[];
  exile: CardInZone[];
  hand: CardInZone[];
  actions: TurnActions;
  mulliganDone: boolean;
}

/** Um quadro: o tabuleiro DEPOIS do passo, o comando que o causou e o que ele emitiu. */
export interface TapeFrame {
  /** `null` só no primeiro quadro: a abertura da partida não é lance de ninguém */
  command: Command | null;
  turn: number;
  phase: Phase;
  activeSide: SideId;
  winner: SideId | null;
  endReason?: 'points' | 'concede' | 'timeout';
  sides: Record<SideId, TapeSide>;
  /** sem redação: a fita é a verdade, e a redação é feita na saída */
  events: GameEvent[];
}

export interface MatchTape {
  format: number;
  /** a versão do jogo que GRAVOU — é ela que aparece no canto do replay */
  version: string;
  /** ISO, hora em que a fita foi fechada */
  recordedAt: string;
  /** guardados para depuração: não são lidos para tocar a fita */
  seed: number;
  decks: Record<SideId, SideDeck>;
  frames: TapeFrame[];
}

/**
 * Grava um quadro a partir do estado que o motor acabou de produzir.
 *
 * Copia por JSON de propósito: o quadro tem de sobreviver ao resto da partida
 * sem depender de o motor nunca reaproveitar um array — e a fita vai virar JSON
 * de todo jeito. O que não é serializável não deveria estar no `GameState`.
 */
export function frameOfState(
  state: GameState,
  command: Command | null,
  events: readonly GameEvent[],
): TapeFrame {
  const frame: TapeFrame = {
    command,
    turn: state.turn,
    phase: state.phase,
    activeSide: state.activeSide,
    winner: state.winner,
    sides: {
      a: sideOfState(state, 'a'),
      b: sideOfState(state, 'b'),
    },
    events: [...events],
  };
  if (state.endReason) frame.endReason = state.endReason;
  return JSON.parse(JSON.stringify(frame)) as TapeFrame;
}

function sideOfState(state: GameState, side: SideId): TapeSide {
  const it = state.sides[side];
  return {
    hero: it.hero,
    points: it.points,
    directDamage: it.directDamage,
    deckCount: it.deck.length,
    field: it.field,
    scenario: it.scenario,
    discard: it.discard,
    exile: it.exile,
    hand: it.hand,
    actions: it.actions,
    mulliganDone: it.mulliganDone,
  };
}

/**
 * O quadro visto por um lado, na forma que o tabuleiro desenha.
 *
 * A mão do oponente vira contagem — a mesma regra do `viewFor` da partida ao
 * vivo, aplicada aqui sobre dado gravado em vez de sobre estado de motor. Se o
 * `GameView` ganhar campo novo um dia, o compilador para NESTA função, que é o
 * lugar certo para decidir o que uma fita antiga responde a uma pergunta que
 * ninguém fazia quando ela foi gravada.
 */
export function viewOfFrame(frame: TapeFrame, side: SideId): GameView {
  const me = frame.sides[side];
  const them = frame.sides[oppositeSide(side)];
  const view: GameView = {
    side,
    turn: frame.turn,
    phase: frame.phase,
    activeSide: frame.activeSide,
    winner: frame.winner,
    // ninguém responde uma pergunta de partida gravada: a escolha que a resolveu
    // já está no quadro seguinte
    pending: null,
    waitingForOpponent: false,
    me: {
      hero: me.hero,
      points: me.points,
      directDamage: me.directDamage,
      deckCount: me.deckCount,
      field: me.field,
      scenario: me.scenario,
      discard: me.discard,
      exile: me.exile,
      hand: me.hand,
      actions: me.actions,
      mulliganDone: me.mulliganDone,
    },
    opponent: {
      hero: them.hero,
      points: them.points,
      directDamage: them.directDamage,
      deckCount: them.deckCount,
      field: them.field,
      scenario: them.scenario,
      discard: them.discard,
      exile: them.exile,
      handCount: them.hand.length,
    },
  };
  if (frame.endReason) view.endReason = frame.endReason;
  return view;
}

/** Os eventos do quadro como este lado pode vê-los (compra e busca do outro somem). */
export function eventsOfFrame(frame: TapeFrame, side: SideId): GameEvent[] {
  return frame.events.map((event) => redactEvent(event, side));
}
