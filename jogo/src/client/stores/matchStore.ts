import { create } from 'zustand';
import { createMatch } from '../../engine/createMatch.ts';
import { reduce } from '../../engine/reduce.ts';
import { decideCommand } from '../../engine/bot.ts';
import { viewFor, type GameView } from '../../engine/view.ts';
import type { Command } from '../../engine/commands.ts';
import { advanceClock, newClock, type ClockDeadline } from '../../shared/clock.ts';
import type { GameState, SideId } from '../../engine/state.ts';
import type { GameEvent } from '../../engine/events.ts';
import { PLAYABLE_CARDS } from '../../data/cards.ts';
import { MAX_DECK_CARDS } from '../../data/deckRules.ts';
import { ApiError, api, storedSession } from '../services/api.ts';
import { describeEvent } from '../describeEvent.ts';
import { animationBusy, useAnimationStore, whenAnimationIdle } from './animationStore.ts';
import { errorText, type ErrorCode } from '../../shared/errors.ts';
import type { TextRef } from '../../shared/text.ts';

export interface TrainingDeck {
  hero: string;
  cards: number[];
  /** nome do baralho ativo, copiado para o histórico (decisão nº 43) */
  name?: string;
}

/**
 * Um quadro do replay, como o servidor o monta: a visão DEPOIS do passo e o que
 * o passo emitiu, os dois já redigidos. O cliente não reexecuta o motor — ele
 * teria de receber o baralho do oponente para isso.
 */
export interface ReplayFrame {
  view: GameView;
  events: GameEvent[];
}

/**
 * De onde saiu o replay (decisão nº 44):
 *
 * - `tape` é o normal: a FITA gravada durante a partida. O que se vê é o que
 *   aconteceu, com a versão do jogo da época carimbada no canto;
 * - `engine` é a reconstituição de uma partida anterior à fita — o motor de HOJE
 *   reexecutando a receita de ontem. Pode divergir, e a tela diz isso.
 */
export type ReplaySource = 'tape' | 'engine';

interface ReplayReply {
  side: SideId;
  opponent: string;
  source: ReplaySource;
  /** a versão do jogo que gravou a fita; `null` na reconstituição */
  version: string | null;
  recordedAt: string | null;
  truncated: boolean;
  frames: ReplayFrame[];
}

/** o que a barra do replay precisa ver; os quadros ficam fora do React */
export interface ReplayControl {
  index: number;
  total: number;
  playing: boolean;
  speed: number;
  /** fita gravada na partida, ou reconstituição pelo motor de hoje */
  source: ReplaySource;
  /** a versão do jogo usada NA PARTIDA; `null` quando não foi gravada */
  version: string | null;
  /** o registro parou no meio: só acontece na reconstituição */
  truncated: boolean;
}

interface Snapshot {
  matchId: number;
  seq: number;
  deadlineMs: number;
  /** o prazo que veio é o de uma janela de reação (curto), não o do turno */
  deadlineIsReaction?: boolean;
  nicknames: { me: string; opponent: string };
  view: GameView;
}

interface MatchState {
  mode: 'training' | 'online' | 'replay' | null;
  view: GameView | null;
  opponentNickname: string;
  deadlineMs: number | null;
  /** o prazo vigente é o de uma janela de reação: a barra mede em 7s, não em 60 */
  deadlineIsReaction: boolean;
  /** linhas do registro, ainda em chave+parâmetros: quem traduz é a tela */
  log: TextRef[];
  lastRefusal: TextRef | null;
  /** presente só no modo replay */
  replay: ReplayControl | null;
  startTraining: (deck?: TrainingDeck) => void;
  startOnline: (matchId: number) => Promise<void>;
  watchReplay: (historyId: number) => Promise<void>;
  replaySeek: (index: number) => void;
  replayStep: (delta: number) => void;
  replayToggle: () => void;
  replaySpeed: (speed: number) => void;
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
// timer do treino: espelha o do servidor (60s por turno, 7s por reação), e usa
// a MESMA peça de relógio (src/shared/clock.ts) para as duas contagens baterem
let trainingTimer: ReturnType<typeof setTimeout> | null = null;
let trainingClock = newClock();
// o relógio do treino só começa quando a linha do tempo da animação esvazia
let cancelClockArm: (() => void) | null = null;
// linhas de registro presas até a animação do lance que as gerou terminar
let bufferedLog: TextRef[] = [];
let cancelLogFlush: (() => void) | null = null;
/** o baralho da última partida de treino: é o que a revanche repete */
let lastTrainingDeck: TrainingDeck | null = null;
// passo do bot em espera + contador da trava
let botTimer: ReturnType<typeof setTimeout> | null = null;
let botSteps = 0;
/**
 * O registro da partida de treino (decisão nº 43). O treino roda aqui, então é
 * aqui que a receita do replay é colhida: seed, os dois baralhos e todo comando
 * ACEITO — o do jogador, o do bot e o do estouro de prazo. No fim ela sobe para
 * o servidor, que reexecuta e apura o desfecho; o placar daqui não é gravado.
 */
let trainingRecord: {
  seed: number;
  decks: Record<SideId, TrainingDeck>;
  commands: Command[];
  startedMs: number;
  deckName: string;
} | null = null;
// quadros do replay + o lado de quem assiste: fora da store, como o `localState`
let replayFrames: ReplayFrame[] = [];
let replaySide: SideId = 'a';
let replayTimer: ReturnType<typeof setTimeout> | null = null;
let cancelReplayIdle: (() => void) | null = null;

/**
 * O ritmo de cada velocidade (decisão nº 43), calibrado MEDINDO no navegador.
 *
 * A conta que não fecha sozinha: um passo animado leva ~1s de animação, então
 * encurtar só a pausa entre eles não passa de ~1,4×. A primeira versão fazia
 * exatamente isso — o botão dizia 4× e entregava 1,3×, MEDIDO no navegador.
 * Acima de 1×, portanto, o replay SALTA: assenta o quadro sem animar, que é o
 * que avanço rápido quer dizer em qualquer tocador.
 *
 * Os números dos botões são os medidos depois da mudança, não os pretendidos:
 * 0,53 passo/s em 1×, 2,8 em 5× e 10,9 em 20× — um replay de 173 quadros leva
 * cinco minutos no primeiro e dezesseis segundos no último.
 */
interface ReplayPace {
  pauseMs: number;
  /** anima o lance e espera a linha do tempo esvaziar antes do passo seguinte */
  animated: boolean;
}

const REPLAY_PACE: Record<number, ReplayPace> = {
  1: { pauseMs: 620, animated: true },
  5: { pauseMs: 350, animated: false },
  20: { pauseMs: 85, animated: false },
};

export const REPLAY_SPEEDS = [1, 5, 20] as const;

function trainingDeck(): number[] {
  return PLAYABLE_CARDS.slice(0, MAX_DECK_CARDS).map((card) => card.id);
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
    if (!command || applyLocal(command) !== null) {
      syncTraining();
      return;
    }
    syncTraining();
    botTimer = setTimeout(botStep, BOT_THINK_MS);
  }

  /**
   * Aplica um comando local, guarda-o no registro do replay e solta os eventos.
   * Devolve o CÓDIGO da recusa, ou `null` quando o motor aceitou — quem traduz
   * (ou ignora, no caso do bot) é quem chamou.
   */
  function applyLocal(command: Command): ErrorCode | null {
    if (!localState) return 'match_not_found';
    rememberLocal();
    const result = reduce(localState, command);
    if (result.error) return result.error;
    localState = result.state;
    // só o comando aceito entra: o replay reexecuta o motor, e uma recusa
    // gravada faria o passo seguinte partir de um estado que nunca existiu
    trainingRecord?.commands.push(command);
    consume(result.events, TRAINING_SIDE);
    archiveTraining();
    return null;
  }

  /**
   * A partida de treino acabou: manda a receita ao servidor e esquece o registro.
   * Falhar aqui não pode atrapalhar o fim de jogo — sem servidor (ou sem conta) o
   * treino segue jogável, só não vira linha de histórico.
   */
  function archiveTraining(): void {
    const record = trainingRecord;
    if (!record || !localState?.winner) return;
    trainingRecord = null;
    void api('POST', '/api/history/training', {
      seed: record.seed,
      decks: record.decks,
      commands: record.commands,
      side: TRAINING_SIDE,
      seconds: Math.round((Date.now() - record.startedMs) / 1000),
      deckName: record.deckName,
      opponent: 'Bot',
    }).catch(() => undefined);
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
   * O fusível do treino. Duas regras, e as duas vêm de relato de partida:
   *
   * - o prazo NÃO começa junto com o lance, e sim quando a linha do tempo da
   *   animação esvazia — que é quando o jogador enfim enxerga a situação e o
   *   modal abre (decisão nº 25);
   * - o prazo do TURNO não recomeça a cada lance, e a janela de reação o segura
   *   em vez de substituí-lo (decisão nº 35). Quem sabe disso é o relógio
   *   compartilhado com o servidor; aqui só se diz "já dá para correr?".
   */
  function rearmTrainingTimer(): void {
    stopTrainingClock();
    if (get().mode !== 'training' || !localState || localState.winner) {
      if (localState?.winner) set({ deadlineMs: null, deadlineIsReaction: false });
      return;
    }
    armFrom(advanceClock(trainingClock, localState, Date.now(), { start: !animationBusy() }));
    if (!get().deadlineMs) cancelClockArm = whenAnimationIdle(startTrainingClock);
  }

  function startTrainingClock(): void {
    cancelClockArm = null;
    if (get().mode !== 'training' || !localState || localState.winner) return;
    if (trainingTimer) clearTimeout(trainingTimer);
    armFrom(advanceClock(trainingClock, localState, Date.now()));
  }

  /** Publica o prazo na tela e arma o estouro dele. */
  function armFrom(deadline: ClockDeadline): void {
    // sem prazo na tela enquanto ele não vale: barra parada mente menos que barra correndo
    set({
      deadlineMs: deadline.deadlineMs || null,
      deadlineIsReaction: deadline.reaction,
    });
    if (!deadline.deadlineMs) return;
    trainingTimer = setTimeout(
      trainingDeadlineExpired,
      Math.max(0, deadline.deadlineMs - Date.now()) + 20,
    );
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
      set({
        view: snapshot.view,
        deadlineMs: snapshot.deadlineMs,
        deadlineIsReaction: snapshot.deadlineIsReaction === true,
      });
      // memoriza DEPOIS de animar: os eventos do SSE chegam antes desta busca e
      // precisam enxergar o campo como estava antes do lance
      useAnimationStore.getState().rememberView(snapshot.view);
    } catch {
      // a partida pode ter acabado entre o evento e a busca; o FIM_DE_JOGO cuida
    }
  }

  /* ── replay (decisões nº 43 e nº 44) ────────────────────────────────────
     Os quadros vêm prontos do servidor e o tabuleiro é o MESMO da partida —
     mudam só a origem da visão (o quadro, não o motor) e o fato de não haver
     comando a enviar. Tocar é entrar no quadro seguinte com os eventos dele,
     que é exatamente o que o online faz quando um evento chega pelo SSE.

     Do lado do servidor esses quadros são FITA: gravados durante a partida, não
     recalculados agora. Aqui isso não muda uma linha — e é esse o teste de que a
     decisão nº 44 ficou no lugar certo. */

  function stopReplayClock(): void {
    if (replayTimer) clearTimeout(replayTimer);
    replayTimer = null;
    cancelReplayIdle?.();
    cancelReplayIdle = null;
  }

  function stopReplay(): void {
    stopReplayClock();
    replayFrames = [];
  }

  /** o registro reconstruído até um quadro, sem animar nada: é o que a busca usa */
  function logUpTo(index: number): TextRef[] {
    const lines: TextRef[] = [];
    for (let step = 0; step <= index; step += 1) {
      for (const event of replayFrames[step]?.events ?? []) {
        const line = describeEvent(event, replaySide);
        if (line) lines.push(line);
      }
    }
    return lines.slice(-80);
  }

  /**
   * Entra num quadro, de três jeitos:
   *
   * - `animate` é o passo a passo de verdade: memoriza o campo do quadro
   *   anterior e solta os eventos, exatamente como o online faz com o SSE;
   * - `snap` assenta o tabuleiro sem animar e ACRESCENTA as linhas daquele
   *   passo — é o avanço rápido, onde animar seria um borrão;
   * - `jump` é a busca: assenta e reescreve o registro inteiro até ali, porque
   *   quem pulou trinta passos não viu as linhas do caminho.
   */
  function enterFrame(index: number, how: 'animate' | 'snap' | 'jump'): void {
    const frame = replayFrames[index];
    const control = get().replay;
    if (!frame || !control) return;
    clearLogBuffer();

    if (how === 'animate') {
      const previous = replayFrames[index - 1];
      if (previous) useAnimationStore.getState().rememberView(previous.view);
      set({ view: frame.view, replay: { ...control, index } });
      consume(frame.events, replaySide);
      return;
    }

    useAnimationStore.getState().reset();
    const log =
      how === 'jump'
        ? logUpTo(index)
        : [
            ...get().log,
            ...frame.events
              .map((event) => describeEvent(event, replaySide))
              .filter((line): line is TextRef => line !== null),
          ].slice(-80);
    set({ view: frame.view, replay: { ...control, index }, log });
  }

  /**
   * Agenda o passo seguinte no ritmo da velocidade escolhida. Em 1× ele espera a
   * animação do passo atual esvaziar antes de começar a contar a pausa (senão a
   * pausa seria engolida por ela); nas velocidades de salto não há o que esperar.
   */
  function scheduleReplayStep(): void {
    stopReplayClock();
    const control = get().replay;
    if (get().mode !== 'replay' || !control?.playing) return;
    const pace = REPLAY_PACE[control.speed] ?? REPLAY_PACE[1]!;

    const advance = (): void => {
      replayTimer = null;
      const now = get().replay;
      if (get().mode !== 'replay' || !now?.playing) return;
      if (now.index >= now.total - 1) {
        set({ replay: { ...now, playing: false } });
        return;
      }
      enterFrame(now.index + 1, pace.animated ? 'animate' : 'snap');
      scheduleReplayStep();
    };

    const arm = (): void => {
      cancelReplayIdle = null;
      if (get().mode !== 'replay' || !get().replay?.playing) return;
      replayTimer = setTimeout(advance, pace.pauseMs);
    };

    if (pace.animated) cancelReplayIdle = whenAnimationIdle(arm);
    else arm();
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
    deadlineIsReaction: false,
    log: [],
    lastRefusal: null,
    replay: null,

    startTraining: (deck) => {
      const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
      // a revanche repete o baralho da partida anterior: sem isto o botão
      // "jogar de novo" caía no deck de demonstração (relato do DevLukkas)
      const myDeck = deck ?? lastTrainingDeck ?? { hero: 'badur', cards: trainingDeck() };
      lastTrainingDeck = myDeck;
      const decks: Record<SideId, TrainingDeck> = {
        a: myDeck,
        b: { hero: 'ispisher', cards: trainingDeck() },
      };
      const created = createMatch({ seed, decks });
      localState = created.state;
      trainingRecord = {
        seed,
        decks,
        commands: [],
        startedMs: Date.now(),
        deckName: myDeck.name ?? '',
      };
      stopBot();
      stopTrainingClock();
      clearLogBuffer();
      // a partida nova recomeça o relógio do zero: relógio velho faria o prazo já
      // nascer vencido na revanche
      trainingClock = newClock();
      stopReplay();
      useAnimationStore.getState().reset();
      set({
        mode: 'training',
        opponentNickname: 'Bot',
        deadlineMs: null,
        deadlineIsReaction: false,
        log: [],
        lastRefusal: null,
        replay: null,
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
      stopReplay();
      useAnimationStore.getState().reset();
      useAnimationStore.getState().rememberView(snapshot.view);
      set({
        mode: 'online',
        view: snapshot.view,
        opponentNickname: snapshot.nicknames.opponent,
        deadlineMs: snapshot.deadlineMs,
        deadlineIsReaction: snapshot.deadlineIsReaction === true,
        log: [],
        lastRefusal: null,
        replay: null,
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

    /**
     * Abre o replay de uma partida arquivada. Ele entra pelo MESMO caminho de uma
     * partida (o `view` da store), então o tabuleiro que o desenha é o de sempre —
     * o que muda é `mode: 'replay'`, e é por ele que a tela desliga o que é ação.
     */
    watchReplay: async (historyId) => {
      const reply = await api<ReplayReply>('GET', `/api/history/${historyId}/replay`);
      eventSource?.close();
      eventSource = null;
      currentMatchId = null;
      localState = null;
      trainingRecord = null;
      stopBot();
      stopTrainingClock();
      clearLogBuffer();
      stopReplay();

      replayFrames = reply.frames;
      replaySide = reply.side;
      const first = replayFrames[0];
      if (!first) throw new Error('replay vazio');

      useAnimationStore.getState().reset();
      set({
        mode: 'replay',
        view: first.view,
        opponentNickname: reply.opponent,
        deadlineMs: null,
        deadlineIsReaction: false,
        log: [],
        lastRefusal: null,
        replay: {
          index: 0,
          total: replayFrames.length,
          playing: false,
          speed: 1,
          source: reply.source === 'engine' ? 'engine' : 'tape',
          version: reply.version,
          truncated: reply.truncated,
        },
      });
      // o primeiro quadro é a abertura (mão inicial): ela ANIMA, como na partida
      consume(first.events, replaySide);
    },

    replaySeek: (index) => {
      const control = get().replay;
      if (!control) return;
      const target = Math.max(0, Math.min(control.total - 1, Math.trunc(index)));
      stopReplayClock();
      set({ replay: { ...control, playing: false } });
      enterFrame(target, 'jump');
    },

    replayStep: (delta) => {
      const control = get().replay;
      if (!control) return;
      const target = Math.max(0, Math.min(control.total - 1, control.index + delta));
      if (target === control.index) return;
      stopReplayClock();
      set({ replay: { ...control, playing: false } });
      // um passo à frente ainda anima: é o lance que se quer ver acontecer
      enterFrame(target, delta === 1 ? 'animate' : 'jump');
    },

    replayToggle: () => {
      const control = get().replay;
      if (!control) return;
      if (control.playing) {
        stopReplayClock();
        set({ replay: { ...control, playing: false } });
        return;
      }
      // tocar do fim recomeça do começo, senão o botão não faria nada
      if (control.index >= control.total - 1) {
        set({ replay: { ...control, playing: true } });
        enterFrame(0, 'jump');
      } else {
        set({ replay: { ...control, playing: true } });
      }
      scheduleReplayStep();
    },

    replaySpeed: (speed) => {
      const control = get().replay;
      if (!control) return;
      set({ replay: { ...control, speed } });
      if (control.playing) scheduleReplayStep();
    },

    send: (command) => {
      const { mode } = get();
      // no replay a partida já aconteceu: o tabuleiro é só leitura
      if (mode === 'replay') return;

      if (mode === 'training') {
        if (!localState) return;
        const error = applyLocal(command);
        if (error) {
          set({ lastRefusal: errorText(error) });
          return;
        }
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
              set({
                view: reply.view,
                deadlineMs: reply.deadlineMs,
                deadlineIsReaction: reply.deadlineIsReaction === true,
                lastRefusal: null,
              });
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
      stopReplay();
      trainingRecord = null;
      trainingClock = newClock();
      useAnimationStore.getState().reset();
      set({
        mode: null,
        view: null,
        log: [],
        lastRefusal: null,
        deadlineMs: null,
        deadlineIsReaction: false,
        replay: null,
      });
    },
  };
});
