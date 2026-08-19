import { create } from 'zustand';
import { createMatch } from '../../engine/createMatch.ts';
import { reduce } from '../../engine/reduce.ts';
import { decideCommand } from '../../engine/bot.ts';
import { viewFor, type GameView } from '../../engine/view.ts';
import type { Command } from '../../engine/commands.ts';
import { REACTION_SECONDS, TURN_SECONDS } from '../../engine/state.ts';
import type { GameState, SideId } from '../../engine/state.ts';
import type { GameEvent } from '../../engine/events.ts';
import { cardsOfFormat } from '../../data/cards.ts';
import { MAX_DECK_CARDS } from '../../data/deckRules.ts';
import type { Format } from '../../data/types.ts';
import { ApiError, api, storedSession } from '../services/api.ts';
import { describeEvent } from '../describeEvent.ts';
import { animationBusy, useAnimationStore, whenAnimationIdle } from './animationStore.ts';
import { errorText } from '../../shared/errors.ts';
import type { TextRef } from '../../shared/text.ts';

export interface TrainingDeck {
  hero: string;
  cards: number[];
  /** ausente = clássico */
  format?: Format;
}

interface Snapshot {
  matchId: number;
  seq: number;
  deadlineMs: number;
  nicknames: { me: string; opponent: string };
  view: GameView;
}

interface MatchState {
  mode: 'training' | 'online' | null;
  view: GameView | null;
  opponentNickname: string;
  deadlineMs: number | null;
  /** linhas do registro, ainda em chave+parâmetros: quem traduz é a tela */
  log: TextRef[];
  lastRefusal: TextRef | null;
  startTraining: (deck?: TrainingDeck) => void;
  startOnline: (matchId: number) => Promise<void>;
  send: (command: Command) => void;
  leave: () => void;
}

const TRAINING_SIDE: SideId = 'a';
const BOT_SIDE: SideId = 'b';

/**
 * Ritmo do bot (decisão nº 24). O turno da máquina resolvia num laço síncrono e o
 * jogador via o resultado pronto, sem enxergar o que aconteceu; agora cada lance é
 * um passo com pausa entre eles — e o passo seguinte ainda espera a animação do
 * anterior terminar, senão a fila engoliria a pausa.
 */
const BOT_THINK_MS = 850;
const BOT_WAIT_MS = 140;
/** trava contra bot que não conclui o turno (regra nova em laço) */
const BOT_MAX_STEPS = 400;

// estado interno fora da store: o React nunca precisa ver isto
let localState: GameState | null = null;
let eventSource: EventSource | null = null;
let currentMatchId: number | null = null;
let lastSeq = 0;
let scheduledRefresh: ReturnType<typeof setTimeout> | null = null;
// timer do treino: espelha o do servidor (60s por turno, 7s por reação)
let trainingTimer: ReturnType<typeof setTimeout> | null = null;
// o relógio do treino só começa quando a linha do tempo da animação esvazia
let cancelClockArm: (() => void) | null = null;
// linhas de registro presas até a animação do lance que as gerou terminar
let bufferedLog: TextRef[] = [];
let cancelLogFlush: (() => void) | null = null;
// passo do bot em espera + contador da trava
let botTimer: ReturnType<typeof setTimeout> | null = null;
let botSteps = 0;
let trainingDeadlineKey = '';
/** 0 = prazo ainda não começou a correr (esperando a animação) */
let trainingDeadline = 0;

function trainingDeck(format: Format): number[] {
  return cardsOfFormat(format)
    .slice(0, MAX_DECK_CARDS)
    .map((card) => card.id);
}

export const useMatchStore = create<MatchState>((set, get) => {
  /**
   * Os eventos são o contrato do invariante 3: viram linha de registro E passo
   * de animação. A animação é planejada com o campo memorizado ANTES do comando
   * (`rememberLocal`), senão a criatura que morreu no lance já sumiu da memória.
   *
   * O registro anda NO PASSO da animação (decisão nº 25): com a linha do tempo
   * tocando, as linhas ficam presas e entram quando ela esvazia — senão o painel
   * contaria o desfecho do lance antes de o jogador ver o lance.
   */
  function consume(events: GameEvent[], mySide: SideId): void {
    useAnimationStore.getState().push(events, mySide);
    const fresh = events
      .map((event) => describeEvent(event, mySide))
      .filter((line): line is TextRef => line !== null);
    if (!fresh.length) return;
    if (!animationBusy()) {
      appendLog(fresh);
      return;
    }
    bufferedLog.push(...fresh);
    if (!cancelLogFlush) cancelLogFlush = whenAnimationIdle(flushLog);
  }

  function appendLog(lines: readonly TextRef[]): void {
    if (lines.length) set({ log: [...get().log, ...lines].slice(-80) });
  }

  function flushLog(): void {
    cancelLogFlush = null;
    const lines = bufferedLog;
    bufferedLog = [];
    appendLog(lines);
  }

  function clearLogBuffer(): void {
    cancelLogFlush?.();
    cancelLogFlush = null;
    bufferedLog = [];
  }

  function rememberLocal(): void {
    if (!localState) return;
    useAnimationStore.getState().rememberFields([
      { side: 'a', field: localState.sides.a.field },
      { side: 'b', field: localState.sides.b.field },
    ]);
  }

  function botMustAct(): boolean {
    if (!localState || localState.winner) return false;
    if (localState.pending) return localState.pending.side === BOT_SIDE;
    if (localState.phase === 'mulligan') return !localState.sides[BOT_SIDE].mulliganDone;
    return localState.activeSide === BOT_SIDE;
  }

  function stopBot(): void {
    if (botTimer) clearTimeout(botTimer);
    botTimer = null;
  }

  /** Devolve a visão ao React e reacerta o fusível do turno. */
  function syncTraining(): void {
    if (localState) set({ view: viewFor(localState, TRAINING_SIDE) });
    rearmTrainingTimer();
  }

  /** Passa a vez ao bot: ele joga um lance por vez, com pausa entre eles. */
  function runBot(): void {
    stopBot();
    botSteps = 0;
    if (get().mode !== 'training' || !botMustAct()) {
      syncTraining();
      return;
    }
    syncTraining();
    botTimer = setTimeout(botStep, BOT_THINK_MS);
  }

  function botStep(): void {
    botTimer = null;
    if (get().mode !== 'training' || !localState || !botMustAct()) {
      syncTraining();
      return;
    }
    if (botSteps++ > BOT_MAX_STEPS) return;
    // enquanto o fantasma do lance anterior voa, o próximo espera
    if (animationBusy()) {
      botTimer = setTimeout(botStep, BOT_WAIT_MS);
      return;
    }
    const command = decideCommand(localState, BOT_SIDE);
    if (!command || !applyLocal(command)) {
      syncTraining();
      return;
    }
    syncTraining();
    botTimer = setTimeout(botStep, BOT_THINK_MS);
  }

  /** Aplica um comando local e registra os eventos; devolve false se recusado. */
  function applyLocal(command: Command): boolean {
    if (!localState) return false;
    rememberLocal();
    const result = reduce(localState, command);
    if (result.error) return false;
    localState = result.state;
    consume(result.events, TRAINING_SIDE);
    return true;
  }

  function stopTrainingClock(): void {
    if (trainingTimer) {
      clearTimeout(trainingTimer);
      trainingTimer = null;
    }
    cancelClockArm?.();
    cancelClockArm = null;
  }

  /**
   * O fusível do treino. O prazo NÃO começa junto com o lance: começa quando a
   * linha do tempo da animação esvazia, que é quando o jogador enfim enxerga a
   * situação e o modal abre. Sem isso a janela de reação (7s) queimava atrás de
   * um modal que ainda nem estava na tela.
   */
  function rearmTrainingTimer(): void {
    stopTrainingClock();
    if (get().mode !== 'training' || !localState || localState.winner) {
      trainingDeadlineKey = '';
      trainingDeadline = 0;
      if (localState?.winner) set({ deadlineMs: null });
      return;
    }
    const pending = localState.pending;
    const key = pending?.reaction
      ? `reacao:${pending.id}`
      : `turno:${localState.turn}:${localState.activeSide}:${localState.phase === 'mulligan'}`;
    if (key !== trainingDeadlineKey) {
      trainingDeadlineKey = key;
      trainingDeadline = 0;
      // sem prazo na tela enquanto ele não vale: barra parada mente menos que barra correndo
      set({ deadlineMs: null });
    }
    if (!trainingDeadline) {
      cancelClockArm = whenAnimationIdle(startTrainingClock);
      return;
    }
    trainingTimer = setTimeout(
      trainingDeadlineExpired,
      Math.max(0, trainingDeadline - Date.now()) + 20,
    );
  }

  function startTrainingClock(): void {
    cancelClockArm = null;
    if (get().mode !== 'training' || !localState || localState.winner) return;
    const seconds = localState.pending?.reaction ? REACTION_SECONDS : TURN_SECONDS;
    trainingDeadline = Date.now() + seconds * 1000;
    set({ deadlineMs: trainingDeadline });
    if (trainingTimer) clearTimeout(trainingTimer);
    trainingTimer = setTimeout(trainingDeadlineExpired, seconds * 1000 + 20);
  }

  function trainingDeadlineExpired(): void {
    trainingTimer = null;
    if (get().mode !== 'training' || !localState || localState.winner) return;
    const pending = localState.pending;
    if (pending?.reaction && pending.side === TRAINING_SIDE) {
      applyLocal({
        type: 'ANSWER',
        side: TRAINING_SIDE,
        pendingId: pending.id,
        optionId: 'decline',
      });
    } else {
      applyLocal({ type: 'TIME_OUT' });
    }
    runBot();
  }

  async function refreshFromServer(): Promise<void> {
    if (currentMatchId === null) return;
    try {
      const snapshot = await api<Snapshot>('GET', `/api/matches/${currentMatchId}`);
      set({ view: snapshot.view, deadlineMs: snapshot.deadlineMs });
      // memoriza DEPOIS de animar: os eventos do SSE chegam antes desta busca e
      // precisam enxergar o campo como estava antes do lance
      useAnimationStore.getState().rememberView(snapshot.view);
    } catch {
      // a partida pode ter acabado entre o evento e a busca; o FIM_DE_JOGO cuida
    }
  }

  function scheduleRefresh(): void {
    if (scheduledRefresh) clearTimeout(scheduledRefresh);
    scheduledRefresh = setTimeout(() => {
      scheduledRefresh = null;
      void refreshFromServer();
    }, 150);
  }

  return {
    mode: null,
    view: null,
    opponentNickname: 'Oponente',
    deadlineMs: null,
    log: [],
    lastRefusal: null,

    startTraining: (deck) => {
      const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
      // o bot joga no MESMO formato do jogador — decks de formatos diferentes não
      // formam partida (o motor recusa em criarPartida)
      const format: Format = deck?.format ?? 'classic';
      const myDeck = deck ?? { hero: 'badur', cards: trainingDeck(format) };
      const created = createMatch({
        seed,
        format,
        decks: { a: myDeck, b: { hero: 'ispisher', cards: trainingDeck(format) } },
      });
      localState = created.state;
      stopBot();
      stopTrainingClock();
      clearLogBuffer();
      // a partida nova recomeça o relógio do zero: chave velha faria o prazo já
      // nascer vencido na revanche
      trainingDeadlineKey = '';
      trainingDeadline = 0;
      useAnimationStore.getState().reset();
      set({
        mode: 'training',
        opponentNickname: 'Bot',
        deadlineMs: null,
        log: [],
        lastRefusal: null,
        view: viewFor(localState, TRAINING_SIDE),
      });
      consume(created.events, TRAINING_SIDE);
      runBot();
    },

    startOnline: async (matchId) => {
      const snapshot = await api<Snapshot>('GET', `/api/matches/${matchId}`);
      currentMatchId = matchId;
      lastSeq = 0;
      clearLogBuffer();
      useAnimationStore.getState().reset();
      useAnimationStore.getState().rememberView(snapshot.view);
      set({
        mode: 'online',
        view: snapshot.view,
        opponentNickname: snapshot.nicknames.opponent,
        deadlineMs: snapshot.deadlineMs,
        log: [],
        lastRefusal: null,
      });

      const token = storedSession()?.token ?? '';
      eventSource?.close();
      eventSource = new EventSource(
        `/api/matches/${matchId}/events?desde=0&token=${encodeURIComponent(token)}`,
      );
      const mySide = snapshot.view.side;
      eventSource.onmessage = (message) => {
        const seq = Number(message.lastEventId) || 0;
        if (seq <= lastSeq) return;
        lastSeq = seq;
        const event = JSON.parse(message.data as string) as GameEvent;
        consume([event], mySide);
        if (event.type === 'GAME_OVER') {
          const view = get().view;
          if (view) {
            set({ view: { ...view, winner: event.winner, endReason: event.reason } });
          }
          eventSource?.close();
          return;
        }
        scheduleRefresh();
      };
    },

    send: (command) => {
      const { mode } = get();
      if (mode === 'training') {
        if (!localState) return;
        rememberLocal();
        const result = reduce(localState, command);
        if (result.error) {
          set({ lastRefusal: errorText(result.error) });
          return;
        }
        localState = result.state;
        consume(result.events, TRAINING_SIDE);
        set({ view: viewFor(localState, TRAINING_SIDE), lastRefusal: null });
        runBot();
        return;
      }

      if (mode === 'online' && currentMatchId !== null) {
        void api<Snapshot | { ended: boolean }>(
          'POST',
          `/api/matches/${currentMatchId}/commands`,
          { command },
        )
          .then((reply) => {
            if ('view' in reply) {
              set({ view: reply.view, deadlineMs: reply.deadlineMs, lastRefusal: null });
            }
          })
          .catch((error: unknown) => {
            set({ lastRefusal: error instanceof ApiError ? error.ref : errorText('request_failed') });
          });
      }
    },

    leave: () => {
      eventSource?.close();
      eventSource = null;
      currentMatchId = null;
      localState = null;
      stopBot();
      stopTrainingClock();
      clearLogBuffer();
      trainingDeadlineKey = '';
      trainingDeadline = 0;
      useAnimationStore.getState().reset();
      set({ mode: null, view: null, log: [], lastRefusal: null, deadlineMs: null });
    },
  };
});
