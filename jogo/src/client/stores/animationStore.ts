import { create } from 'zustand';
import type { CreatureToken } from '../../data/types.ts';
import type { GameEvent } from '../../engine/events.ts';
import { oppositeSide, type CreatureInPlay, type SideId } from '../../engine/state.ts';
import type { GameView } from '../../engine/view.ts';
import { text, type TextRef } from '../../shared/text.ts';

/**
 * A camada de animação do invariante 3: o cliente ANIMA CONSUMINDO EVENTOS.
 *
 * Um evento vira um passo e entra numa LINHA DO TEMPO ÚNICA que toca um passo de
 * cada vez — ataque, destruição, ponto conquistado e aviso de virada dividem a
 * mesma fila, então nada começa antes de o anterior acabar (decisão nº 25). O que
 * voa na tela continua sendo um FANTASMA: uma cópia da carta posicionada sobre o
 * tabuleiro. Por isso a criatura destruída ainda consegue "ir até o descarte"
 * mesmo já tendo saído do campo na visão.
 *
 * Enquanto a linha do tempo toca, o cliente se considera OCUPADO
 * (`animationBusy`): o tabuleiro não aceita lance novo, o bot do treino espera,
 * o registro segura as linhas e nenhum modal — reação, mulligan, vitória — abre.
 * `whenAnimationIdle` é o gancho de quem precisa acordar quando ela esvazia.
 *
 * Ancoragem: o tabuleiro marca os pontos de origem/destino com `data-anchor`
 * ("slot:a:2", "discard:b", "hero:b") e a camada os mede com getBoundingClientRect.
 */

export type Anchor = string;

interface Ghost {
  cardId: number | null;
  token?: CreatureToken;
}

export type Animation =
  | ({
      id: number;
      kind: 'attack';
      /** a criatura atacante fica invisível no slot enquanto o fantasma voa */
      uid: string;
      from: Anchor;
      to: Anchor;
      /** ataque direto ao herói (sem criatura na coluna em frente) */
      direct: boolean;
    } & Ghost)
  | ({ id: number; kind: 'destroy'; from: Anchor; to: Anchor } & Ghost)
  /**
   * Carta indo PARA O DESCARTE — da mão, do deck (moagem) ou de cima de uma
   * criatura (anexo). Carrega uma LISTA porque descarte costuma vir em lote
   * ("descarte a mão inteira"): uma carta por passo faria a mão sumir num
   * comboio de dois segundos, e o que interessa é ver as cartas saindo juntas.
   */
  | { id: number; kind: 'discard'; from: Anchor; to: Anchor; cards: Ghost[] }
  | { id: number; kind: 'score'; mine: boolean; gained: number; total: number }
  /**
   * A pausa que esconde a mão do oponente (decisão nº 39). Sem ela, a jogada que
   * resolve na hora denuncia que o outro não tinha comando para responder.
   */
  | { id: number; kind: 'thinking' }
  /** o efeito passivo do herói disparou: sem isto ele acontecia sem ninguém ver */
  | { id: number; kind: 'hero'; side: SideId; hero: string; mine: boolean }
  /** aviso de virada — "SEU TURNO", "FASE DE BATALHA" */
  | {
      id: number;
      kind: 'announce';
      title: TextRef;
      subtitle?: TextRef;
      tone: 'mine' | 'theirs' | 'neutral';
    };

/**
 * Cristais de dano direto que ACABARAM de quebrar, por lado.
 *
 * Vive FORA da linha do tempo de propósito: perder um cristal é decoração da placa
 * do herói, não um momento que o jogo tenha de esperar — enfileirar aqui travaria
 * o tabuleiro a cada ponto de dano direto, e o dano já vem colado num ataque que
 * a fila está animando. O invariante 3 continua de pé: quem diz que quebrou é o
 * evento DIRECT_DAMAGE, nunca uma comparação entre dois valores de `directDamage`.
 */
export interface Shatter {
  /** muda a cada lote: é a chave que faz a animação CSS recomeçar do zero */
  id: number;
  /** quantos cristais este lote levou */
  count: number;
}

/**
 * Teto de segurança da fila. Em condição normal ela nunca chega perto: o bot só
 * joga o lance seguinte com a linha do tempo vazia, e no online os eventos chegam
 * no ritmo em que o oponente joga. O corte existe para reconexão/replay, onde um
 * lote grande desaba de uma vez, e derruba os passos MAIS ANTIGOS — num atraso
 * desses o que interessa é alcançar o presente.
 */
const MAX_QUEUE = 24;
const MAX_IDENTITIES = 400;

interface Identity {
  uid: string;
  cardId: number | null;
  token?: CreatureToken;
}

/**
 * Quem estava em cada slot antes dos eventos chegarem. Vive fora da store porque
 * nada disto redesenha a tela: é só a memória que dá identidade ao fantasma
 * (a carta destruída já não está mais na visão) e o alvo do ataque (a criatura
 * inimiga na coluna em frente pode morrer no mesmo lance).
 */
const identities = new Map<string, Identity>();
const columns = new Map<string, string>();
let nextId = 1;

/** quem pediu para ser acordado quando a linha do tempo esvaziar */
let idleWaiters: (() => void)[] = [];

function columnKey(side: SideId, slot: number): string {
  return `${side}:${slot}`;
}

function rememberField(side: SideId, field: readonly (CreatureInPlay | null)[]): void {
  field.forEach((creature, slot) => {
    const key = columnKey(side, slot);
    if (!creature) {
      columns.delete(key);
      return;
    }
    columns.set(key, creature.uid);
    identities.set(creature.uid, {
      uid: creature.uid,
      cardId: creature.cardId,
      ...(creature.token ? { token: creature.token } : {}),
    });
  });
  if (identities.size > MAX_IDENTITIES) {
    // o Map preserva a ordem de inserção: as mais antigas saem primeiro
    for (const uid of [...identities.keys()].slice(0, identities.size - MAX_IDENTITIES)) {
      identities.delete(uid);
    }
  }
}

function ghostOf(identity: Identity | undefined): Ghost {
  if (!identity) return { cardId: null };
  return { cardId: identity.cardId, ...(identity.token ? { token: identity.token } : {}) };
}

function discardStep(from: Anchor, side: SideId, ghost: Ghost): Animation {
  return { id: nextId++, kind: 'discard', from, to: `discard:${side}`, cards: [ghost] };
}

/** Um evento vira um passo da linha do tempo — ou nada, se não houver o que mostrar. */
function plan(event: GameEvent, mySide: SideId): Animation | null {
  switch (event.type) {
    case 'ATTACK_DECLARED': {
      const attackerUid = columns.get(columnKey(event.side, event.slot));
      const attacker = attackerUid ? identities.get(attackerUid) : undefined;
      if (!attackerUid || !attacker) return null;
      const enemy = oppositeSide(event.side);
      const defended = columns.has(columnKey(enemy, event.slot));
      return {
        id: nextId++,
        kind: 'attack',
        uid: attackerUid,
        from: `slot:${event.side}:${event.slot}`,
        to: defended ? `slot:${enemy}:${event.slot}` : `hero:${enemy}`,
        direct: !defended,
        ...ghostOf(attacker),
      };
    }
    case 'CREATURE_DESTROYED':
      return {
        id: nextId++,
        kind: 'destroy',
        from: `slot:${event.side}:${event.slot}`,
        // ficha não vai ao descarte: some ali mesmo, na fumaça
        to: event.toDiscard ? `discard:${event.side}` : `slot:${event.side}:${event.slot}`,
        ...ghostOf(identities.get(event.uid)),
      };
    // tudo que vai para o descarte faz o caminho até lá; o que muda é a ORIGEM
    case 'CARD_DISCARDED':
    case 'HAND_LIMIT_DISCARD':
    case 'COMMAND_PLAYED':
      return discardStep(`hand:${event.side}`, event.side, { cardId: event.card.cardId });
    case 'CARD_MILLED':
      return discardStep(`deck:${event.side}`, event.side, { cardId: event.card.cardId });
    case 'ATTACHMENT_DISCARDED':
      return discardStep(`slot:${event.side}:${event.slot}`, event.side, {
        cardId: event.card.cardId,
      });
    case 'REACTION_WINDOW':
      // a espera é para quem NÃO decide: quem decide vê o próprio modal, e uma
      // pausa antes dele só comeria o relógio curto da reação
      return event.side === mySide ? null : { id: nextId++, kind: 'thinking' };
    case 'HERO_ACTIVATED':
      return {
        id: nextId++,
        kind: 'hero',
        side: event.side,
        hero: event.hero,
        mine: event.side === mySide,
      };
    case 'ATTACK_BLOCKED':
      return {
        id: nextId++,
        kind: 'announce',
        title: text('board.announce.attackBlocked'),
        tone: 'neutral',
      };
    case 'SCORED':
      return {
        id: nextId++,
        kind: 'score',
        mine: event.side === mySide,
        gained: event.gained,
        total: event.total,
      };
    case 'TURN_STARTED': {
      const mine = event.side === mySide;
      return {
        id: nextId++,
        kind: 'announce',
        title: text(mine ? 'board.announce.yourTurn' : 'board.announce.opponentTurn'),
        subtitle: text('board.announce.round', { turn: event.turn }),
        tone: mine ? 'mine' : 'theirs',
      };
    }
    case 'PHASE_CHANGED':
      return {
        id: nextId++,
        kind: 'announce',
        title: text(
          event.phase === 'battle' ? 'board.announce.battlePhase' : 'board.announce.mainPhase',
        ),
        tone: 'neutral',
      };
    default:
      return null;
  }
}

interface AnimationState {
  /** o passo que está tocando agora; a camada avisa o fim com `finish` */
  current: Animation | null;
  queue: Animation[];
  /** último lote de cristais quebrados de cada lado (fora da fila) */
  shattered: Record<SideId, Shatter | null>;
  push: (events: readonly GameEvent[], mySide: SideId) => void;
  /** memoriza o campo ANTES de aplicar os eventos (treino: estado; online: visão) */
  rememberFields: (fields: { side: SideId; field: readonly (CreatureInPlay | null)[] }[]) => void;
  rememberView: (view: GameView) => void;
  finish: (id: number) => void;
  reset: () => void;
}

export const useAnimationStore = create<AnimationState>((set, get) => ({
  current: null,
  queue: [],
  shattered: { a: null, b: null },

  push: (events, mySide) => {
    const steps: Animation[] = [];
    /** o dano direto do lote não vira passo: só acende o estilhaço na placa */
    const broken: Record<SideId, number> = { a: 0, b: 0 };
    for (const event of events) {
      if (event.type === 'DIRECT_DAMAGE') broken[event.sufferer] += event.value;
      const step = plan(event, mySide);
      if (!step) continue;
      // dois avisos colados não são dois momentos: só o último diz onde a partida parou
      const previousStep = steps[steps.length - 1];
      if (step.kind === 'announce' && previousStep?.kind === 'announce') steps.pop();
      // descartes seguidos para o mesmo lugar viram UM passo com várias cartas
      if (
        step.kind === 'discard' &&
        previousStep?.kind === 'discard' &&
        previousStep.from === step.from &&
        previousStep.to === step.to
      ) {
        previousStep.cards.push(...step.cards);
        continue;
      }
      steps.push(step);
    }
    if (broken.a > 0 || broken.b > 0) {
      const previous = get().shattered;
      set({
        shattered: {
          a: broken.a > 0 ? { id: nextId++, count: broken.a } : previous.a,
          b: broken.b > 0 ? { id: nextId++, count: broken.b } : previous.b,
        },
      });
    }
    if (!steps.length) return;
    const { current, queue } = get();
    if (current) {
      set({ queue: [...queue, ...steps].slice(-MAX_QUEUE) });
      return;
    }
    const [first, ...rest] = [...queue, ...steps];
    set({ current: first ?? null, queue: rest.slice(-MAX_QUEUE) });
  },

  rememberFields: (fields) => {
    for (const { side, field } of fields) rememberField(side, field);
  },

  rememberView: (view) => {
    rememberField(view.side, view.me.field);
    rememberField(oppositeSide(view.side), view.opponent.field);
  },

  finish: (id) => {
    const { current, queue } = get();
    if (current?.id !== id) return;
    const [next, ...rest] = queue;
    set({ current: next ?? null, queue: rest });
    if (!next) releaseIdleWaiters();
  },

  reset: () => {
    identities.clear();
    columns.clear();
    idleWaiters = [];
    set({ current: null, queue: [], shattered: { a: null, b: null } });
  },
}));

/** Ainda há passo tocando? (quem for interromper o jogador pergunta antes) */
export function animationBusy(): boolean {
  const { current, queue } = useAnimationStore.getState();
  return current !== null || queue.length > 0;
}

function releaseIdleWaiters(): void {
  if (!idleWaiters.length) return;
  const waiting = idleWaiters;
  idleWaiters = [];
  for (const run of waiting) run();
}

/**
 * Roda `run` quando a linha do tempo esvaziar — na hora, se já estiver vazia.
 * Devolve o cancelamento, para quem desiste antes (troca de partida, saída da tela).
 */
export function whenAnimationIdle(run: () => void): () => void {
  if (!animationBusy()) {
    run();
    return () => {};
  }
  idleWaiters.push(run);
  return () => {
    idleWaiters = idleWaiters.filter((waiter) => waiter !== run);
  };
}

/** Versão reativa de `animationBusy`, para a tela travar o que precisa travar. */
export function useAnimationBusy(): boolean {
  return useAnimationStore((state) => state.current !== null || state.queue.length > 0);
}

/** O lote de cristais que este lado acabou de perder — `null` enquanto nada quebrou. */
export function useShatter(side: SideId): Shatter | null {
  return useAnimationStore((state) => state.shattered[side]);
}

/** uid da criatura que está fora do slot agora (voando como fantasma). */
export function useMovingUid(): string | null {
  return useAnimationStore((state) =>
    state.current?.kind === 'attack' ? state.current.uid : null,
  );
}
