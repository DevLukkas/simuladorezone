import { cardById } from '../data/cards.ts';
import { isAttachable, creatureDef, newCreatureInPlay } from './cardsInPlay.ts';
import type { Command } from './commands.ts';
import type { ErrorCode } from '../shared/errors.ts';
import { canBeAttackTarget } from './combat.ts';
import {
  queueAttack,
  scheduleReaction,
  queueOnAttach,
  queueOnEnter,
  activateAbility,
  playCommand,
  processQueue,
  answer,
  resolveEndOfTurn,
} from './effects.ts';
import type { GameEvent } from './events.ts';
import {
  STARTING_HAND,
  SLOTS_PER_SIDE,
  oppositeSide,
  type CreatureInPlay,
  type GameState,
  type SideId,
} from './state.ts';
import {
  onAttachmentDiscarded,
  onOtherCreatureEntered,
  heroOnCreatureEnter,
  heroOnTurnStart,
  regenerateOnTurnStart,
} from './triggers.ts';
import { canAttachTo, canAttack, canBeSummonedNormally } from './targeting.ts';
import { shuffle, randomInt } from './rng.ts';
import { drawCards } from './zones.ts';

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
  /**
   * Presente quando o comando foi recusado; o estado devolvido é o original.
   * É um CÓDIGO, não uma frase: quem traduz é o cliente (i18n `error.*`).
   */
  error?: ErrorCode;
}

const MAX_ATTACHMENTS_PER_CREATURE = 2;

/**
 * Entrada única do motor. Pura: clona o estado, valida, aplica e devolve
 * `{ estado, eventos }` — ou `{ erro }` com o estado intacto. Nunca lança por
 * comando ilegal; lançar é reservado a violação de invariante interno.
 */
export function reduce(originalState: GameState, command: Command): ReduceResult {
  const reject = (error: ErrorCode): ReduceResult => ({ state: originalState, events: [], error });

  if (originalState.winner) return reject('match_over');

  const state = structuredClone(originalState);
  const events: GameEvent[] = [];

  if (
    state.pending &&
    command.type !== 'ANSWER' &&
    command.type !== 'CONCEDE' &&
    command.type !== 'TIME_OUT'
  ) {
    return reject('pending_choice');
  }

  switch (command.type) {
    case 'DECIDE_MULLIGAN': {
      if (state.phase !== 'mulligan') return reject('not_mulligan_time');
      const owner = state.sides[command.side];
      if (owner.mulliganDone) return reject('mulligan_done');
      if (command.swap) {
        const shuffled = shuffle(state.rng, [...owner.hand, ...owner.deck]);
        state.rng = shuffled.rng;
        owner.hand = shuffled.items.slice(0, STARTING_HAND);
        owner.deck = shuffled.items.slice(STARTING_HAND);
      }
      owner.mulliganDone = true;
      events.push({ type: 'MULLIGAN_DECIDED', side: command.side, swapped: command.swap });
      if (command.swap) {
        for (const card of owner.hand) {
          events.push({ type: 'CARD_DRAWN', side: command.side, card });
        }
      }
      if (state.sides.a.mulliganDone && state.sides.b.mulliganDone) {
        startFirstTurn(state, events);
      }
      return { state, events };
    }

    case 'SUMMON': {
      const error = validateMainAction(state, command.side);
      if (error) return reject(error);
      const owner = state.sides[command.side];
      if (owner.actions.summoned) return reject('already_summoned');
      if (!isValidSlot(command.slot)) return reject('invalid_slot');
      if (owner.field[command.slot]) return reject('slot_taken');
      const index = owner.hand.findIndex((card) => card.uid === command.cardUid);
      if (index < 0) return reject('card_not_in_hand');
      const zoneCard = owner.hand[index]!;
      const card = cardById(zoneCard.cardId);
      if (card.type !== 'creature') return reject('not_a_creature');
      if (!canBeSummonedNormally(card)) return reject('cannot_summon_normally');

      owner.hand.splice(index, 1);
      const creature = newCreatureInPlay(state.turn, zoneCard.uid, zoneCard.cardId);
      owner.field[command.slot] = creature;
      owner.actions.summoned = true;
      events.push({ type: 'CREATURE_SUMMONED', side: command.side, slot: command.slot, card: zoneCard });

      heroOnCreatureEnter(state, command.side, creature, events);
      queueOnEnter(state, command.side, command.slot);
      onOtherCreatureEntered(state, command.side, creature, events);
      scheduleReaction(state, oppositeSide(command.side), 'summon', 'command');
      processQueue(state, events);
      return { state, events };
    }

    case 'ATTACH': {
      const error = validateMainAction(state, command.side);
      if (error) return reject(error);
      const owner = state.sides[command.side];
      if (!isValidSlot(command.slot)) return reject('invalid_slot');
      const creature = owner.field[command.slot];
      if (!creature) return reject('no_creature_in_slot');
      const index = owner.hand.findIndex((card) => card.uid === command.cardUid);
      if (index < 0) return reject('card_not_in_hand');
      const zoneCard = owner.hand[index]!;
      const card = cardById(zoneCard.cardId);
      if (!isAttachable(card)) return reject('not_attachable');
      if (!canAttachTo(card, creature)) return reject('incompatible_element');

      if (creature.attachments.length >= MAX_ATTACHMENTS_PER_CREATURE) {
        const substituir = creature.attachments.findIndex(
          (attachment) => attachment.uid === command.replaceAttachmentUid,
        );
        if (substituir < 0) return reject('attachment_limit');
        const [removido] = creature.attachments.splice(substituir, 1);
        owner.discard.push({ uid: removido!.uid, cardId: removido!.cardId });
        events.push({
          type: 'ATTACHMENT_DISCARDED',
          side: command.side,
          slot: command.slot,
          card: { uid: removido!.uid, cardId: removido!.cardId },
        });
        onAttachmentDiscarded(state, command.side, removido!.uid, removido!.cardId, true);
      }

      owner.hand.splice(index, 1);
      creature.attachments.push({ uid: zoneCard.uid, cardId: zoneCard.cardId });
      events.push({ type: 'CARD_ATTACHED', side: command.side, slot: command.slot, card: zoneCard });

      queueOnAttach(state, command.side, command.slot, zoneCard.uid);
      fireAttachmentCountTrigger(state, command.side, creature, zoneCard.cardId, events);
      scheduleReaction(state, oppositeSide(command.side), 'attach', 'command');
      processQueue(state, events);
      return { state, events };
    }

    case 'PLAY_SCENARIO': {
      const error = validateMainAction(state, command.side);
      if (error) return reject(error);
      const owner = state.sides[command.side];
      if (owner.actions.scenario) return reject('scenario_already_played');
      const index = owner.hand.findIndex((card) => card.uid === command.cardUid);
      if (index < 0) return reject('card_not_in_hand');
      const zoneCard = owner.hand[index]!;
      if (cardById(zoneCard.cardId).type !== 'scenario') return reject('not_a_scenario');

      owner.hand.splice(index, 1);
      if (owner.scenario) owner.discard.push(owner.scenario);
      owner.scenario = zoneCard;
      owner.actions.scenario = true;
      events.push({ type: 'SCENARIO_PLAYED', side: command.side, card: zoneCard });
      return { state, events };
    }

    case 'PLAY_COMMAND': {
      const error = validateMainAction(state, command.side);
      if (error) return reject(error);
      const failure = playCommand(state, command.side, command.cardUid, command.target, events);
      if (failure) return reject(failure);
      processQueue(state, events);
      return { state, events };
    }

    case 'ACTIVATE_ABILITY': {
      if (state.activeSide !== command.side) return reject('not_your_turn');
      if (state.phase === 'mulligan') return reject('match_not_started');
      const failure = activateAbility(
        state,
        command.side,
        command.sourceUid,
        command.abilityId,
        command.element,
        events,
      );
      if (failure) return reject(failure);
      processQueue(state, events);
      return { state, events };
    }

    case 'ATTACK': {
      if (state.activeSide !== command.side) return reject('not_your_turn');
      if (state.phase !== 'battle') return reject('battle_phase_only');
      if (!isValidSlot(command.slot)) return reject('invalid_slot');
      const attackerSide = state.sides[command.side];
      const creature = attackerSide.field[command.slot];
      if (!creature) return reject('no_creature_in_slot');
      if (!canAttack(state, command.side, creature)) return reject('creature_cannot_attack');
      const defender = state.sides[oppositeSide(command.side)].field[command.slot];
      if (defender && !canBeAttackTarget(state.turn, defender, creature, attackerSide.field)) {
        return reject('cannot_be_attack_target');
      }

      events.push({ type: 'ATTACK_DECLARED', side: command.side, slot: command.slot });
      queueAttack(state, command.side, command.slot);
      scheduleReaction(
        state,
        oppositeSide(command.side),
        defender ? 'attackCreature' : 'attackDirect',
        'command',
      );
      processQueue(state, events);
      return { state, events };
    }

    case 'ADVANCE_PHASE': {
      if (state.activeSide !== command.side) return reject('not_your_turn');
      if (state.phase !== 'main') return reject('advance_from_main_only');
      state.phase = 'battle';
      events.push({ type: 'PHASE_CHANGED', phase: 'battle' });
      scheduleReaction(state, oppositeSide(command.side), 'battlePhase', 'ability');
      processQueue(state, events);
      return { state, events };
    }

    case 'END_TURN': {
      if (state.activeSide !== command.side) return reject('not_your_turn');
      if (state.phase === 'mulligan') return reject('match_not_started');
      endTurn(state, events);
      processQueue(state, events);
      return { state, events };
    }

    case 'TIME_OUT': {
      if (state.phase === 'mulligan') {
        for (const side of ['a', 'b'] as const) {
          if (!state.sides[side].mulliganDone) {
            state.sides[side].mulliganDone = true;
            events.push({ type: 'MULLIGAN_DECIDED', side, swapped: false });
          }
        }
        startFirstTurn(state, events);
        return { state, events };
      }
      autoResolvePending(state, events);
      if (!state.winner) {
        endTurn(state, events);
        processQueue(state, events);
        autoResolvePending(state, events);
      }
      return { state, events };
    }

    case 'CONCEDE': {
      const winner = oppositeSide(command.side);
      state.winner = winner;
      state.endReason = 'concede';
      state.pending = null;
      state.queue = [];
      events.push({ type: 'GAME_OVER', winner, reason: 'concede' });
      return { state, events };
    }

    case 'ANSWER': {
      if (!state.pending) return reject('nothing_pending');
      if (state.pending.side !== command.side) return reject('choice_not_yours');
      if (state.pending.id !== command.pendingId) return reject('stale_choice');
      const failure = answer(state, command.side, command.optionId, events);
      if (failure) return reject(failure);
      processQueue(state, events);
      return { state, events };
    }
  }
}

function validateMainAction(state: GameState, side: SideId): ErrorCode | null {
  if (state.activeSide !== side) return 'not_your_turn';
  if (state.phase !== 'main') return 'main_phase_only';
  return null;
}

function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOTS_PER_SIDE;
}

/** Tridente Poderoso de Atlas: N anexos de mesmo nome → oponente descarta. */
function fireAttachmentCountTrigger(
  state: GameState,
  side: SideId,
  creature: CreatureInPlay,
  attachedCardId: number,
  events: GameEvent[],
): void {
  const card = cardById(attachedCardId);
  if (card.type !== 'ability' && card.type !== 'item') return;
  for (const ability of card.triggeredAbilities ?? []) {
    if (ability.trigger !== 'host_attachment_count_reaches') continue;
    const targetName = (ability.attachedName ?? card.name).toLowerCase();
    const howManyOf = creature.attachments.filter(
      (attachment) => cardById(attachment.cardId).name.toLowerCase() === targetName,
    ).length;
    if (howManyOf !== ability.count) continue;
    if (ability.action.type !== 'opponent_discards_at_random') continue;

    const enemy = state.sides[oppositeSide(side)];
    for (let i = 0; i < ability.action.count && enemy.hand.length; i++) {
      const roll = randomInt(state.rng, 0, enemy.hand.length - 1);
      state.rng = roll.rng;
      const [discarded] = enemy.hand.splice(roll.value, 1);
      if (!discarded) break;
      enemy.discard.push(discarded);
      events.push({
        type: 'CARD_DISCARDED',
        side: oppositeSide(side),
        card: discarded,
        reason: 'effect',
      });
    }
  }
}

function startFirstTurn(state: GameState, events: GameEvent[]): void {
  state.phase = 'main';
  events.push({ type: 'TURN_STARTED', side: state.activeSide, turn: state.turn });
  regenerateOnTurnStart(state, state.activeSide, events);
  heroOnTurnStart(state, state.activeSide, events);
}

function endTurn(state: GameState, events: GameEvent[]): void {
  // oferta de reação não atravessa a virada de turno
  state.pendingReaction = null;
  events.push({ type: 'TURN_ENDED', side: state.activeSide, turn: state.turn });

  resolveEndOfTurn(state, events);

  for (const side of ['a', 'b'] as const) {
    for (const creature of state.sides[side].field) {
      if (!creature) continue;
      creature.temporaryModifiers = creature.temporaryModifiers.filter(
        (mod) => mod.expiresAfterTurn > state.turn,
      );
      // Sapomerlim: o elemento emprestado vale só até o fim do turno
      if (
        creature.changedElementUntilTurn !== undefined &&
        creature.changedElementUntilTurn <= state.turn
      ) {
        const from = creature.changedElement!;
        delete creature.changedElement;
        delete creature.changedElementUntilTurn;
        events.push({
          type: 'ELEMENT_CHANGED',
          side,
          creatureUid: creature.uid,
          from,
          to: creatureDef(creature).element,
        });
      }
    }
  }

  if (state.winner) return;

  state.turn += 1;
  state.activeSide = oppositeSide(state.activeSide);
  state.phase = 'main';
  const active = state.sides[state.activeSide];
  active.actions = { summoned: false, attached: false, scenario: false };
  for (const side of ['a', 'b'] as const) state.sides[side].scenarioFlags = {};

  events.push({ type: 'TURN_STARTED', side: state.activeSide, turn: state.turn });
  drawCards(state, state.activeSide, 1, events);
  regenerateOnTurnStart(state, state.activeSide, events);
  heroOnTurnStart(state, state.activeSide, events);
}

/** Timer estourou com escolha aberta: recusa/rejeita tudo até destravar. */
function autoResolvePending(state: GameState, events: GameEvent[]): void {
  let guard = 0;
  while (state.pending && guard++ < 50) {
    const pending = state.pending;
    const option = pending.canDecline
      ? 'decline'
      : (pending.options.find((o) => o.id === 'no') ?? pending.options[0])?.id;
    if (!option) break;
    answer(state, pending.side, option, events);
    processQueue(state, events);
  }
}
