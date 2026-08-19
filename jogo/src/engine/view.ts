import type {
  TurnActions,
  CardInZone,
  CreatureInPlay,
  GameState,
  Phase,
  SideId,
  Pending,
} from './state.ts';
import { oppositeSide } from './state.ts';
import type { GameEvent } from './events.ts';

/**
 * O que um jogador enxerga. Mão e deck do oponente viram contagens; o resto
 * (campo, anexos, descarte, exílio, cenário) é público. Só o servidor tem o
 * estado completo — esta visão é o máximo que cruza a rede.
 */
export interface GameView {
  side: SideId;
  turn: number;
  phase: Phase;
  activeSide: SideId;
  winner: SideId | null;
  endReason?: 'points' | 'concede' | 'timeout';
  /** presente quando é VOCÊ quem deve escolher (sem o contexto interno) */
  pending: Omit<Pending, 'context'> | null;
  /** o oponente está decidindo algo */
  waitingForOpponent: boolean;
  me: VisibleSide & { hand: CardInZone[]; actions: TurnActions; mulliganDone: boolean };
  opponent: VisibleSide & { handCount: number };
}

export interface VisibleSide {
  hero: string;
  points: number;
  directDamage: number;
  deckCount: number;
  field: (CreatureInPlay | null)[];
  scenario: CardInZone | null;
  discard: CardInZone[];
  exile: CardInZone[];
}

export function viewFor(state: GameState, side: SideId): GameView {
  const me = state.sides[side];
  const opponent = state.sides[oppositeSide(side)];
  const pending = state.pending;

  const view: GameView = {
    side,
    turn: state.turn,
    phase: state.phase,
    activeSide: state.activeSide,
    winner: state.winner,
    pending:
      pending && pending.side === side
        ? {
            id: pending.id,
            side: pending.side,
            type: pending.type,
            title: pending.title,
            options: pending.options,
            canDecline: pending.canDecline,
            ...(pending.reaction ? { reaction: true as const } : {}),
          }
        : null,
    waitingForOpponent: pending !== null && pending.side !== side,
    me: {
      hero: me.hero,
      points: me.points,
      directDamage: me.directDamage,
      deckCount: me.deck.length,
      field: me.field,
      scenario: me.scenario,
      discard: me.discard,
      exile: me.exile,
      hand: me.hand,
      actions: me.actions,
      mulliganDone: me.mulliganDone,
    },
    opponent: {
      hero: opponent.hero,
      points: opponent.points,
      directDamage: opponent.directDamage,
      deckCount: opponent.deck.length,
      field: opponent.field,
      scenario: opponent.scenario,
      discard: opponent.discard,
      exile: opponent.exile,
      handCount: opponent.hand.length,
    },
  };
  if (state.endReason) view.endReason = state.endReason;
  return view;
}

/**
 * Redação de eventos por destinatário: compras e buscas do oponente perdem a
 * carta (só a contagem anima). Tudo o mais já é informação pública — descartes,
 * revelações e o campo são visíveis aos dois lados.
 */
export function redactEvent(event: GameEvent, to: SideId): GameEvent {
  if (event.type === 'CARD_DRAWN' && event.side !== to) {
    return { type: 'CARD_DRAWN', side: event.side };
  }
  if (event.type === 'CARD_SEARCHED' && event.side !== to) {
    return { type: 'CARD_SEARCHED', side: event.side };
  }
  return event;
}
