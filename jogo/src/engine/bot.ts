import { cardById } from '../data/cards.ts';
import { isAttachable } from './cardsInPlay.ts';
import type { Command } from './commands.ts';
import { canBeAttackTarget } from './combat.ts';
import { oppositeSide, type GameState, type SideId } from './state.ts';
import {
  canAttachTo,
  canAttack,
  canBeSummonedNormally,
  forcedAttackerSlot,
} from './targeting.ts';

/**
 * Bot heurístico mínimo (paridade com o soloAi do legado): invoca a primeira
 * criatura no primeiro slot vazio, anexa o que der, ataca com todo mundo e
 * passa. Um comando por chamada — o chamador re-invoca até receber null.
 */
export function decideCommand(state: GameState, side: SideId): Command | null {
  if (state.winner) return null;

  if (state.pending) {
    if (state.pending.side !== side) return null;
    const pending = state.pending;
    // política do soloAi: opcionais recusados, exceto o escudo (a IA do legado
    // sempre nega o ataque); listas de escolha pegam a primeira opção
    let optionId: string | undefined;
    if (pending.type === 'yes_no') {
      optionId = pending.context.type === 'shield' ? 'yes' : 'no';
    } else if (pending.canDecline) {
      optionId = 'decline';
    } else {
      optionId = pending.options[0]?.id;
    }
    if (!optionId) return null;
    return { type: 'ANSWER', side, pendingId: pending.id, optionId };
  }

  const owner = state.sides[side];

  if (state.phase === 'mulligan') {
    if (owner.mulliganDone) return null;
    return { type: 'DECIDE_MULLIGAN', side, swap: false };
  }

  if (state.activeSide !== side) return null;

  if (state.phase === 'main') {
    if (!owner.actions.summoned) {
      const emptySlot = owner.field.findIndex((slot) => slot === null);
      if (emptySlot >= 0) {
        for (const inHand of owner.hand) {
          const card = cardById(inHand.cardId);
          if (card.type === 'creature' && canBeSummonedNormally(card)) {
            return { type: 'SUMMON', side, cardUid: inHand.uid, slot: emptySlot };
          }
        }
      }
    }

    for (const inHand of owner.hand) {
      const card = cardById(inHand.cardId);
      if (!isAttachable(card)) continue;
      const slot = owner.field.findIndex(
        (creature) => creature !== null && creature.attachments.length < 2 && canAttachTo(card, creature),
      );
      if (slot >= 0) return { type: 'ATTACH', side, cardUid: inHand.uid, slot };
    }

    if (!owner.scenario) {
      const scenario = owner.hand.find((inHand) => cardById(inHand.cardId).type === 'scenario');
      if (scenario) return { type: 'PLAY_SCENARIO', side, cardUid: scenario.uid };
    }

    return { type: 'ADVANCE_PHASE', side };
  }

  // criatura obrigada a atacar (Marionete de Guerra) vai primeiro: é o ataque
  // que o motor não deixa o turno terminar sem
  const forced = forcedAttackerSlot(state, side);
  if (forced !== null) return { type: 'ATTACK', side, slot: forced };

  const attackerSlot = owner.field.findIndex((creature, slot) => {
    if (creature === null || !canAttack(state, side, creature)) return false;
    const defender = state.sides[oppositeSide(side)].field[slot];
    return !defender || canBeAttackTarget(state.turn, defender, creature, owner.field);
  });
  if (attackerSlot >= 0) return { type: 'ATTACK', side, slot: attackerSlot };

  return { type: 'END_TURN', side };
}
