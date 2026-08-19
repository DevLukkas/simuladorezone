import { cardById } from '../data/cards.ts';
import type {
  Action,
  Card,
  ActivationCost,
  Element,
  CardFilter,
  ActivatedAbility,
} from '../data/types.ts';
import { canBeAttackTarget, effectDamageToCreature, removeCreatureFromField, resolveAttackNow } from './combat.ts';
import { cardMatches, creatureMatches, creatureDef, newCreatureInPlay } from './cardsInPlay.ts';
import type { GameEvent } from './events.ts';
import type { ErrorCode } from '../shared/errors.ts';
import { cardRef, text, tokenRef, type TextRef } from '../shared/text.ts';
import {
  MAX_HAND,
  SLOTS_PER_SIDE,
  oppositeSide,
  type ReactionTrigger,
  type PendingContext,
  type CreatureInPlay,
  type GameState,
  type PendingTrigger,
  type SideId,
  type PendingOption,
  type Pending,
  type Job,
} from './state.ts';
import {
  onCreatureCardEnteredDiscard,
  onAttachmentDiscarded,
  onOtherCreatureEntered,
  applyMarker,
  heroOnCreatureEnter,
} from './triggers.ts';
import { randomInt, shuffle } from './rng.ts';
import { currentStats } from './stats.ts';
import { drawCards } from './zones.ts';

/**
 * Orquestração dos efeitos: processa a fila de trabalhos até esvaziar ou até
 * precisar de decisão humana (vira `pendencia`); o RESPONDER retoma daqui.
 */

// ── infraestrutura de pendências ─────────────────────────────────────────────

function createPending(
  state: GameState,
  data: Omit<Pending, 'id'>,
): void {
  state.pending = { id: `p${state.nextUid++}`, ...data };
}

const YES_NO_OPTIONS: PendingOption[] = [
  { id: 'yes', label: text('common.yes') },
  { id: 'no', label: text('common.no') },
];

function slotOption(state: GameState, side: SideId, slot: number): PendingOption {
  return { id: `${side}:${slot}`, label: creatureLabel(state.sides[side].field[slot]) };
}

/** Nome de uma criatura em campo: carta do catálogo, ficha, ou slot vazio. */
function creatureLabel(creature: CreatureInPlay | null | undefined): TextRef {
  if (!creature) return text('common.empty');
  if (creature.cardId !== null) return text('common.cardName', { card: cardRef(creature.cardId) });
  return text('common.tokenName', { token: tokenRef(creature.token?.id ?? '') });
}

/** Rótulo de uma carta do catálogo (mão, descarte, deck). */
function cardOption(id: string, cardId: number): PendingOption {
  return { id, label: text('common.cardName', { card: cardRef(cardId) }) };
}

function slotsWithCreature(
  state: GameState,
  side: SideId,
  filter?: CardFilter,
): number[] {
  const slots: number[] = [];
  state.sides[side].field.forEach((creature, slot) => {
    if (creature && creatureMatches(creature, filter)) slots.push(slot);
  });
  return slots;
}

// ── fila ─────────────────────────────────────────────────────────────────────

export function processQueue(state: GameState, events: GameEvent[]): void {
  while (!state.pending && !state.winner && state.queue.length) {
    const job = state.queue.shift()!;
    runJob(state, job, events);
  }
  // a janela de reação só abre depois que todos os efeitos da jogada resolveram
  if (!state.pending && !state.winner && !state.queue.length) {
    offerReaction(state);
  }
}

function runJob(state: GameState, job: Job, events: GameEvent[]): void {
  switch (job.type) {
    case 'attack':
      runAttack(state, job, events);
      return;
    case 'trigger_batch': {
      const valid = job.triggers;
      if (!valid.length) return;
      if (valid.length === 1) {
        runTrigger(state, valid[0]!, events);
        return;
      }
      createPending(state, {
        side: valid[0]!.side,
        type: 'choose_order',
        title: text('pending.chainOrder'),
        options: valid.map((trigger, index) => cardOption(String(index), trigger.sourceCardId)),
        canDecline: false,
        context: { type: 'chain_order', triggers: valid },
      });
      return;
    }
    case 'trigger':
      runTrigger(state, job.trigger, events);
      return;
    case 'on_enter':
      runOnEnter(state, job.side, job.effect, events);
      return;
    case 'on_attach':
      runOnAttach(state, job.side, job.slot, job.attachmentUid, job.effect, events);
      return;
  }
}

// ── ataque com janela de escudo ──────────────────────────────────────────────

export function queueAttack(state: GameState, side: SideId, slot: number): void {
  state.queue.push({ type: 'attack', side, slot });
}

function runAttack(
  state: GameState,
  job: Job & { type: 'attack' },
  events: GameEvent[],
): void {
  const { side, slot } = job;
  const attacker = state.sides[side].field[slot];
  if (!attacker) return;
  const defenderSide = oppositeSide(side);
  const defender = state.sides[defenderSide].field[slot];

  if (defender) {
    // Proteção do Escudeiro: qualquer anexo do defensor com o gatilho, ainda
    // não usado no turno, cujo filtro case com a criatura atacada. A oferta
    // marca o uso mesmo se recusada (paridade com o legado).
    for (let attachmentHolderSlot = 0; attachmentHolderSlot < SLOTS_PER_SIDE; attachmentHolderSlot++) {
      const holder = state.sides[defenderSide].field[attachmentHolderSlot];
      if (!holder) continue;
      for (const attachment of holder.attachments) {
        if (attachment.shieldUsedOnTurn === state.turn) continue;
        const card = cardById(attachment.cardId);
        if (card.type !== 'ability' && card.type !== 'item') continue;
        const ability = (card.triggeredAbilities ?? []).find(
          (h) =>
            h.trigger === 'ally_is_attacked' &&
            h.action.type === 'discard_self_to_prevent_attack',
        );
        if (!ability) continue;
        const filter =
          ability.action.type === 'discard_self_to_prevent_attack'
            ? ability.action.filter
            : undefined;
        if (!creatureMatches(defender, filter)) continue;

        attachment.shieldUsedOnTurn = state.turn;
        createPending(state, {
          side: defenderSide,
          type: 'yes_no',
          title: text('pending.shield', {
            card: cardRef(card.id),
            target: creatureLabel(defender),
          }),
          options: YES_NO_OPTIONS,
          canDecline: false,
          context: { type: 'shield', attackJob: job, attachmentHolderSlot, attachmentUid: attachment.uid },
        });
        return;
      }
    }
  }

  resolveAttackNow(state, side, slot, events);
}

function denyAttackWithShield(
  state: GameState,
  context: PendingContext & { type: 'shield' },
  events: GameEvent[],
): void {
  const defenderSide = oppositeSide(context.attackJob.side);
  const holder = state.sides[defenderSide].field[context.attachmentHolderSlot];
  if (!holder) return;
  const index = holder.attachments.findIndex((attachment) => attachment.uid === context.attachmentUid);
  if (index < 0) return;
  const [attachment] = holder.attachments.splice(index, 1);
  state.sides[defenderSide].discard.push({ uid: attachment!.uid, cardId: attachment!.cardId });
  events.push({
    type: 'ATTACHMENT_DISCARDED',
    side: defenderSide,
    slot: context.attachmentHolderSlot,
    card: { uid: attachment!.uid, cardId: attachment!.cardId },
  });
  events.push({
    type: 'ATTACK_DENIED',
    side: context.attackJob.side,
    slot: context.attackJob.slot,
    attachmentCardId: attachment!.cardId,
  });
}

// ── janela de reação (7s no legado solo) ─────────────────────────────────────

/**
 * Agenda a oferta de reação para o oponente da jogada. A pendência em si só é
 * criada por `oferecerReacao`, quando a fila de efeitos esvaziar — a reação do
 * legado é pós-jogada (a ação já resolveu), não uma interrupção em pilha.
 */
export function scheduleReaction(
  state: GameState,
  against: SideId,
  action: ReactionTrigger,
  category: 'command' | 'ability',
): void {
  state.pendingReaction = { against, action, category };
}

function offerReaction(state: GameState): void {
  const reactionWindow = state.pendingReaction;
  if (!reactionWindow) return;
  state.pendingReaction = null;
  const reactingSide = reactionWindow.against;

  if (reactionWindow.category === 'command') {
    const candidates = playableCommands(state, reactingSide);
    if (!candidates.length) return;
    createPending(state, {
      side: reactingSide,
      type: 'choose_card',
      title: text('pending.reactCommand', { action: text(`reactionTo.${reactionWindow.action}`) }),
      options: candidates.map((inHand) => cardOption(inHand.uid, inHand.cardId)),
      canDecline: true,
      reaction: true,
      context: { type: 'react_command', side: reactingSide },
    });
    return;
  }

  const slots = slotsWithUsableAbility(state, reactingSide);
  if (!slots.length) return;
  createPending(state, {
    side: reactingSide,
    type: 'choose_target',
    title: text('pending.reactAbility', { action: text(`reactionTo.${reactionWindow.action}`) }),
    options: slots.map((slot) => slotOption(state, reactingSide, slot)),
    canDecline: true,
    reaction: true,
    context: { type: 'react_ability', side: reactingSide },
  });
}

/** Que lado o comando mira, quando mira alguém: é o alvo declarado na ação. */
function commandTargetKind(card: Card): 'chosen_enemy' | 'chosen_ally' | null {
  if (card.type !== 'command') return null;
  for (const effect of card.effects ?? []) {
    if ('target' in effect && (effect.target === 'chosen_enemy' || effect.target === 'chosen_ally')) {
      return effect.target;
    }
  }
  return null;
}

/** Comandos da mão que podem resolver agora (alvo disponível quando exigido). */
function playableCommands(state: GameState, side: SideId) {
  return state.sides[side].hand.filter((inHand) => {
    const card = cardById(inHand.cardId);
    if (card.type !== 'command' || !card.effects?.length) return false;
    const target = commandTargetKind(card);
    if (!target) return true;
    const targetSide = target === 'chosen_enemy' ? oppositeSide(side) : side;
    return slotsWithCreature(state, targetSide).length > 0;
  });
}

/**
 * Só entram na oferta habilidades que o motor sabe resolver e cujo custo é
 * pagável — oferecer uma opção fadada a erro travaria a janela.
 */
function abilityUsableInReaction(
  state: GameState,
  side: SideId,
  creature: CreatureInPlay,
): ActivatedAbility | null {
  if (creature.cardId === null) return null;
  const card = cardById(creature.cardId);
  if (card.type !== 'creature') return null;
  for (const ability of card.activatedAbilities ?? []) {
    if (ability.source !== 'field_creature') continue;
    if (
      ability.timing === 'once_per_turn' &&
      creature.usedAbilities[ability.id] === state.turn
    ) {
      continue;
    }
    if (!canPayCost(creature, ability.cost)) continue;
    const action = ability.action;
    if (action.type === 'prevent_attack') return ability;
    if (action.type === 'summon_from_discard') {
      const owner = state.sides[side];
      const hasTarget = owner.discard.some((node) => cardMatches(node.cardId, action.filter));
      const willHaveRoom =
        owner.field.some((c) => c === null) || ability.cost?.type === 'sacrifice_self';
      if (hasTarget && willHaveRoom) return ability;
    }
  }
  return null;
}

function canPayCost(creature: CreatureInPlay, cost: ActivationCost | undefined): boolean {
  if (!cost) return true;
  if (cost.type === 'sacrifice_self') return true;
  if (cost.type === 'destroy_attachment') {
    const includes_ = cost.name_includes.toLowerCase();
    return creature.attachments.some((attachment) =>
      cardById(attachment.cardId).name.toLowerCase().includes(includes_),
    );
  }
  return false;
}

function slotsWithUsableAbility(state: GameState, side: SideId): number[] {
  const slots: number[] = [];
  state.sides[side].field.forEach((creature, slot) => {
    if (creature && abilityUsableInReaction(state, side, creature)) slots.push(slot);
  });
  return slots;
}

// ── gatilhos com escolha ─────────────────────────────────────────────────────

function runTrigger(state: GameState, trigger: PendingTrigger, events: GameEvent[]): void {
  const action = trigger.action;
  const source = cardRef(trigger.sourceCardId);

  switch (action.type) {
    case 'add_marker': {
      // só chega aqui a forma "você pode" (Mímico); marcador automático já foi
      // aplicado por quem coletou o gatilho
      if (!action.optional) return;
      if (!slotsWithCreature(state, trigger.side).length) return;
      createPending(state, {
        side: trigger.side,
        type: 'yes_no',
        title: text('pending.discardTrigger', { card: source }),
        options: YES_NO_OPTIONS,
        canDecline: false,
        context: { type: 'optional_trigger', trigger },
      });
      return;
    }
    // Ceifador: a ficha não é opcional ("crie uma ficha"), entra direto
    case 'summon_token': {
      summonToken(state, trigger.side, action.token, events);
      return;
    }
    case 'summon_from_deck': {
      if (!hasInDeck(state, trigger.side, action.filter)) return;
      if (!state.sides[trigger.side].field.some((slot) => slot === null)) return;
      createPending(state, {
        side: trigger.side,
        type: 'yes_no',
        title: text('pending.summonCopy', { card: source }),
        options: YES_NO_OPTIONS,
        canDecline: false,
        context: { type: 'optional_trigger', trigger },
      });
      return;
    }
    case 'draw_then_discard': {
      if (!state.sides[trigger.side].deck.length) return;
      createPending(state, {
        side: trigger.side,
        type: 'yes_no',
        title: text('pending.drawThenDiscard', {
          card: source,
          draw: action.draw,
          discard: action.discard,
        }),
        options: YES_NO_OPTIONS,
        canDecline: false,
        context: { type: 'optional_trigger', trigger },
      });
      return;
    }
    // Sapomerlim / Sapotristan / Caverna do Guardião: escolha entre as suas
    case 'change_element':
    case 'swap_stats':
    case 'modify_stats': {
      // "você pode trocar ATQ e VIDA…" (Coração do Sapoescudeiro): a carta
      // pergunta antes, e só depois escolhe a criatura
      if (action.type === 'swap_stats' && action.optional) {
        createPending(state, {
          side: trigger.side,
          type: 'yes_no',
          title: text('pending.swapStats', { card: source }),
          options: YES_NO_OPTIONS,
          canDecline: false,
          context: {
            type: 'heart_swap',
            side: trigger.side,
            slot: slotOfCreature(state, trigger.side, trigger.triggeredByUid ?? '') ?? 0,
            attachmentUid: trigger.sourceUid,
            returnToHand: action.return_attachment_to_hand === true,
          },
        });
        return;
      }
      const exclude =
        action.type === 'change_element'
          ? trigger.triggeredByUid
          : undefined;
      const slots = state.sides[trigger.side].field.flatMap((creature, slot) =>
        creature && creatureMatches(creature, action.filter, exclude) ? [slot] : [],
      );
      if (!slots.length) return;
      createPending(state, {
        side: trigger.side,
        type: 'choose_target',
        title: text('pending.chooseYourCreature', { card: source }),
        options: slots.map((slot) => slotOption(state, trigger.side, slot)),
        canDecline: true,
        context: { type: 'trigger_target', trigger },
      });
      return;
    }
    case 'draw': {
      createPending(state, {
        side: trigger.side,
        type: 'yes_no',
        title: text('pending.drawCards', { card: source, count: action.count }),
        options: YES_NO_OPTIONS,
        canDecline: false,
        context: { type: 'optional_trigger', trigger },
      });
      return;
    }
    case 'prevent_attack':
    case 'deal_damage': {
      const enemy = oppositeSide(trigger.side);
      const slots = slotsWithCreature(state, enemy);
      if (!slots.length) return;
      createPending(state, {
        side: trigger.side,
        type: 'choose_target',
        title: text('pending.chooseEnemyCreature', { card: source }),
        options: slots.map((slot) => slotOption(state, enemy, slot)),
        canDecline: true,
        context: { type: 'trigger_target', trigger },
      });
      return;
    }
    default:
      // ações sem implementação no legado ficam para o milestone de paridade
      return;
  }
}

function continueAcceptedTrigger(
  state: GameState,
  trigger: PendingTrigger,
  events: GameEvent[],
): void {
  const action = trigger.action;
  if (action.type === 'draw') {
    drawCards(state, trigger.side, action.count, events);
    return;
  }
  if (action.type === 'summon_from_deck') {
    summonFromDeck(state, trigger.side, action.filter, action.count, events);
    return;
  }
  if (action.type === 'draw_then_discard') {
    drawCards(state, trigger.side, action.draw, events);
    const hand = state.sides[trigger.side].hand;
    if (!hand.length || action.discard <= 0) return;
    createPending(state, {
      side: trigger.side,
      type: 'choose_card',
      title: text('pending.chooseDiscard', { card: cardRef(trigger.sourceCardId) }),
      options: hand.map((inHand) => cardOption(inHand.uid, inHand.cardId)),
      canDecline: false,
      context: { type: 'map_discard', side: trigger.side },
    });
    return;
  }
  if (action.type === 'add_marker') {
    const slots = slotsWithCreature(state, trigger.side);
    if (!slots.length) return;
    createPending(state, {
      side: trigger.side,
      type: 'choose_target',
      title: text('pending.chooseAlly', { card: cardRef(trigger.sourceCardId) }),
      options: slots.map((slot) => slotOption(state, trigger.side, slot)),
      canDecline: true,
      context: { type: 'trigger_target', trigger },
    });
  }
}

function hasInDeck(state: GameState, side: SideId, filter: CardFilter): boolean {
  return state.sides[side].deck.some((node) => cardMatches(node.cardId, filter));
}

/** Lobo das Presas Prateadas: invoca do baralho e re-embaralha o que sobrou. */
function summonFromDeck(
  state: GameState,
  side: SideId,
  filter: CardFilter,
  howMany: number,
  events: GameEvent[],
): void {
  const owner = state.sides[side];
  for (let done = 0; done < howMany; done++) {
    const emptySlot = owner.field.findIndex((c) => c === null);
    if (emptySlot < 0) return;
    const index = owner.deck.findIndex((node) => cardMatches(node.cardId, filter));
    if (index < 0) return;
    const [fromDeck] = owner.deck.splice(index, 1);
    const summoned = newCreatureInPlay(state.turn, fromDeck!.uid, fromDeck!.cardId);
    owner.field[emptySlot] = summoned;
    events.push({ type: 'SUMMONED_FROM_DECK', side, slot: emptySlot, card: fromDeck! });
    heroOnCreatureEnter(state, side, summoned, events);
    queueOnEnter(state, side, emptySlot);
    onOtherCreatureEntered(state, side, summoned, events);
  }
}

function runTriggerOnTarget(
  state: GameState,
  trigger: PendingTrigger,
  targetSide: SideId,
  targetSlot: number,
  events: GameEvent[],
): void {
  const target = state.sides[targetSide].field[targetSlot];
  if (!target) return;
  const action = trigger.action;

  switch (action.type) {
    case 'add_marker':
      applyMarker(target, targetSide, action.stats, action.value ?? 0, events);
      return;
    case 'prevent_attack': {
      target.cannotAttackUntilTurn = Math.max(target.cannotAttackUntilTurn ?? 0, state.turn + 1);
      events.push({
        type: 'PREVENTED_FROM_ATTACKING',
        side: targetSide,
        creatureUid: target.uid,
        untilTurn: state.turn + 1,
      });
      return;
    }
    case 'deal_damage':
      effectDamageToCreature(state, targetSide, targetSlot, action.damage, events);
      return;
    // Sapomerlim: escolhida a criatura, falta o elemento
    case 'change_element':
      createPending(state, {
        side: trigger.side,
        type: 'choose_element',
        title: text('pending.chooseElementUntilEndOfTurn'),
        options: CHOOSABLE_ELEMENTS.map((element) => ({
          id: element,
          label: text(`element.${element}`),
        })),
        canDecline: false,
        context: { type: 'sapomerlim_element', side: targetSide, slot: targetSlot },
      });
      return;
    // Sapotristan: a troca dura enquanto o elemento da escolhida estiver alterado
    case 'swap_stats':
      target.swapStatsWhileElementChanged = true;
      target.drawOnDeathWithElementChanged = trigger.side;
      events.push({
        type: 'STATS_SWAPPED',
        side: targetSide,
        creatureUid: target.uid,
        whileElementChanged: true,
      });
      return;
    // Caverna do Guardião Badur: +1 ATQ até o fim do turno no Urso escolhido
    case 'modify_stats': {
      const attack = action.stats.includes('attack') ? (action.value ?? 0) : 0;
      const defense = action.stats.includes('defense') ? (action.value ?? 0) : 0;
      target.temporaryModifiers.push({ attack, defense, expiresAfterTurn: state.turn });
      events.push({
        type: 'TEMPORARY_MODIFIER',
        side: targetSide,
        creatureUid: target.uid,
        attack,
        defense,
      });
      return;
    }
    default:
      return;
  }
}

/** ordem canônica da escolha de elemento; `activation.ts` a repete na oferta */
export const CHOOSABLE_ELEMENTS: Element[] = [
  'fire',
  'water',
  'earth',
  'wind',
  'neutral',
  'void',
  'arcane',
];

// ── onEnter ──────────────────────────────────────────────────────────────────

export function queueOnEnter(state: GameState, side: SideId, slot: number): void {
  const creature = state.sides[side].field[slot];
  if (!creature || creature.cardId === null) return;
  const card = cardById(creature.cardId);
  if (card.type !== 'creature') return;
  for (const effect of card.onEnter ?? []) {
    state.queue.push({ type: 'on_enter', side, slot, effect });
  }
}

function runOnEnter(
  state: GameState,
  side: SideId,
  effect: Action,
  events: GameEvent[],
): void {
  const owner = state.sides[side];

  switch (effect.type) {
    case 'discard_from_hand_then_search_deck': {
      const candidates = owner.hand.filter((inHand) =>
        cardMatches(inHand.cardId, effect.discard),
      );
      if (!candidates.length) return;
      createPending(state, {
        side,
        type: 'choose_card',
        title: text('pending.discardThenSearch'),
        options: candidates.map((inHand) => cardOption(inHand.uid, inHand.cardId)),
        canDecline: effect.optional === true,
        context: { type: 'atlas_discard', side, search: effect.search },
      });
      return;
    }
    case 'shuffle_discarded_creature_then_debuff': {
      const discardIndex = owner.discard.findIndex((node) => {
        const card = cardById(node.cardId);
        return card.type === 'creature' && cardMatches(node.cardId, effect.discardFilter);
      });
      const enemy = oppositeSide(side);
      const targetSlot = state.sides[enemy].field.findIndex((c) => c !== null);
      if (discardIndex < 0 || targetSlot < 0) return;

      const [shuffledCardNode] = owner.discard.splice(discardIndex, 1);
      owner.deck.push(shuffledCardNode!);
      const result = shuffle(state.rng, owner.deck);
      state.rng = result.rng;
      owner.deck = result.items;
      events.push({ type: 'CARD_SHUFFLED_INTO_DECK', side, card: shuffledCardNode! });

      const shuffledCard = cardById(shuffledCardNode!.cardId);
      const attack = shuffledCard.type === 'creature' ? shuffledCard.attack : 0;
      const target = state.sides[enemy].field[targetSlot]!;
      target.temporaryModifiers.push({
        attack: -attack,
        defense: 0,
        expiresAfterTurn: state.turn,
      });
      events.push({
        type: 'TEMPORARY_MODIFIER',
        side: enemy,
        creatureUid: target.uid,
        attack: -attack,
        defense: 0,
      });
      return;
    }
  }
}

// ── onAttach ─────────────────────────────────────────────────────────────────

export function queueOnAttach(state: GameState, side: SideId, slot: number, attachmentUid: string): void {
  const creature = state.sides[side].field[slot];
  if (!creature) return;
  const attachment = creature.attachments.find((a) => a.uid === attachmentUid);
  if (!attachment) return;
  const card = cardById(attachment.cardId);
  if (card.type !== 'ability' && card.type !== 'item') return;
  for (const effect of card.onAttach ?? []) {
    state.queue.push({ type: 'on_attach', side, slot, attachmentUid, effect });
  }
}

function runOnAttach(
  state: GameState,
  side: SideId,
  slot: number,
  attachmentUid: string,
  effect: Action,
  events: GameEvent[],
): void {
  const creature = state.sides[side].field[slot];
  const attachmentCardId = creature?.attachments.find((a) => a.uid === attachmentUid)?.cardId;

  switch (effect.type) {
    case 'add_marker': {
      const enemy = oppositeSide(side);
      const slots = slotsWithCreature(state, enemy);
      if (!slots.length || attachmentCardId === undefined) return;
      createPending(state, {
        side,
        type: 'choose_target',
        title: text('pending.drowningTarget', { card: cardRef(attachmentCardId) }),
        options: slots.map((s) => slotOption(state, enemy, s)),
        canDecline: true,
        context: {
          type: 'drowning_target',
          side,
          attachmentUid,
          perAttachment: effect.value_per_card?.value ?? 0,
        },
      });
      return;
    }
    case 'summon_token': {
      summonToken(state, side, effect.token, events);
      return;
    }
    case 'delayed_damage': {
      if (!creature) return;
      state.delayedEffects.push({
        side,
        creatureUid: creature.uid,
        resolvesOnTurn: state.turn + 1,
        damage: effect.damage,
      });
      return;
    }
    case 'change_element': {
      if (!creature) return;
      createPending(state, {
        side,
        type: 'choose_element',
        title: text('pending.chooseCreatureElement'),
        options: (effect.choose ?? CHOOSABLE_ELEMENTS).map((element) => ({
          id: element,
          label: text(`element.${element}`),
        })),
        canDecline: false,
        context: { type: 'jar_element', side, slot },
      });
      return;
    }
  }
}

export function summonToken(
  state: GameState,
  side: SideId,
  token: NonNullable<CreatureInPlay['token']>,
  events: GameEvent[],
): boolean {
  const slot = state.sides[side].field.findIndex((c) => c === null);
  if (slot < 0) return false;
  const uid = `f${state.nextUid++}`;
  state.sides[side].field[slot] = {
    uid,
    cardId: null,
    token,
    damage: 0,
    markers: { attack: 0, defense: 0 },
    temporaryModifiers: [],
    attachments: [],
    summonedOnTurn: state.turn,
    canAttackFromTurn: state.turn + 1,
    usedAbilities: {},
  };
  events.push({ type: 'TOKEN_CREATED', side, slot, uid, token });
  return true;
}

// ── alteração de elemento e seus gatilhos ────────────────────────────────────

export function changeElement(
  state: GameState,
  side: SideId,
  slot: number,
  next: Element,
  events: GameEvent[],
  options: { untilEndOfTurn?: boolean } = {},
): void {
  const creature = state.sides[side].field[slot];
  if (!creature) return;
  const previous = creature.changedElement ?? creatureDef(creature).element;
  if (previous === next) return;
  creature.changedElement = next;
  if (options.untilEndOfTurn) creature.changedElementUntilTurn = state.turn;
  else delete creature.changedElementUntilTurn;
  events.push({ type: 'ELEMENT_CHANGED', side, creatureUid: creature.uid, from: previous, to: next });

  // Sapomerlim / Sapotristan: a própria criatura mudou de elemento
  if (creature.cardId !== null) {
    const ownCard = cardById(creature.cardId);
    if (ownCard.type === 'creature') {
      for (const ability of ownCard.triggeredAbilities ?? []) {
        if (ability.trigger !== 'self_element_changed') continue;
        state.queue.push({
          type: 'trigger',
          trigger: {
            side,
            sourceUid: creature.uid,
            sourceCardId: creature.cardId,
            action: ability.action,
            priority: 40,
            triggeredByUid: creature.uid,
          },
        });
      }
    }
  }

  // Dheron: sua criatura (que case com o filtro) mudou de elemento
  for (const source of state.sides[side].field) {
    if (!source || source.cardId === null) continue;
    const card = cardById(source.cardId);
    if (card.type !== 'creature') continue;
    for (const ability of card.triggeredAbilities ?? []) {
      if (ability.trigger !== 'ally_element_changed') continue;
      if (!creatureMatches(creature, ability.filter)) continue;
      if (ability.action.type === 'add_marker') {
        const target = ability.action.target === 'self' ? source : creature;
        applyMarker(target, side, ability.action.stats, ability.action.value ?? 0, events);
      }
    }
  }

  // Coração do Sapoescudeiro: anexos da criatura alterada
  for (const attachment of creature.attachments) {
    const card = cardById(attachment.cardId);
    if (card.type !== 'ability' && card.type !== 'item') continue;
    for (const ability of card.triggeredAbilities ?? []) {
      if (ability.trigger !== 'host_element_changed') continue;
      state.queue.push({
        type: 'trigger',
        trigger: {
          side,
          sourceUid: attachment.uid,
          sourceCardId: attachment.cardId,
          action: ability.action,
          priority: 50,
          triggeredByUid: creature.uid,
        },
      });
    }
  }
}

// ── RESPONDER ────────────────────────────────────────────────────────────────

export function answer(
  state: GameState,
  _lado: SideId,
  optionId: string,
  events: GameEvent[],
): ErrorCode | null {
  const pending = state.pending;
  if (!pending) return 'nothing_pending';

  const declined = optionId === 'decline';
  if (declined && !pending.canDecline) return 'cannot_decline';
  if (!declined && !pending.options.some((option) => option.id === optionId)) {
    return 'invalid_option';
  }

  const context = pending.context;
  state.pending = null;

  switch (context.type) {
    case 'shield': {
      if (optionId === 'yes') {
        denyAttackWithShield(state, context, events);
      } else {
        // pode haver outro escudo disponível; o trabalho re-verifica tudo
        state.queue.unshift(context.attackJob);
      }
      return null;
    }
    case 'chain_order': {
      const index = Number(optionId);
      const escolhido = context.triggers[index];
      if (!escolhido) return 'invalid_option';
      const rest = context.triggers.filter((_, i) => i !== index);
      if (rest.length) {
        state.queue.unshift({ type: 'trigger_batch', triggers: rest });
      }
      runTrigger(state, escolhido, events);
      return null;
    }
    case 'optional_trigger': {
      if (optionId === 'yes') continueAcceptedTrigger(state, context.trigger, events);
      return null;
    }
    case 'trigger_target': {
      if (declined) return null;
      const target = parseTarget(optionId);
      if (!target) return 'invalid_option';
      runTriggerOnTarget(state, context.trigger, target.side, target.slot, events);
      return null;
    }
    case 'atlas_discard': {
      if (declined) return null;
      const owner = state.sides[context.side];
      const index = owner.hand.findIndex((inHand) => inHand.uid === optionId);
      if (index < 0) return 'invalid_option';
      const [discarded] = owner.hand.splice(index, 1);
      owner.discard.push(discarded!);
      events.push({ type: 'CARD_DISCARDED', side: context.side, card: discarded!, reason: 'cost' });
      onCreatureCardEnteredDiscard(state, context.side, discarded!.cardId, discarded!.uid);

      const searchable = owner.deck.filter((node) => cardMatches(node.cardId, context.search));
      if (searchable.length) {
        createPending(state, {
          side: context.side,
          type: 'choose_card',
          title: text('pending.searchToHand'),
          options: searchable.map((node) => cardOption(node.uid, node.cardId)),
          canDecline: true,
          context: { type: 'atlas_search', side: context.side },
        });
      }
      return null;
    }
    case 'atlas_search': {
      if (declined) return null;
      const owner = state.sides[context.side];
      const index = owner.deck.findIndex((node) => node.uid === optionId);
      if (index < 0) return 'invalid_option';
      const [found] = owner.deck.splice(index, 1);
      owner.hand.push(found!);
      events.push({ type: 'CARD_SEARCHED', side: context.side, card: found! });
      return null;
    }
    case 'drowning_target': {
      if (declined) return null;
      const target = parseTarget(optionId);
      if (!target) return 'invalid_option';
      const creature = state.sides[target.side].field[target.slot];
      if (!creature) return null;
      markAttachmentTarget(state, context.side, context.attachmentUid, creature.uid);
      const total = creature.attachments.length * context.perAttachment;
      if (total) {
        applyMarker(creature, target.side, ['defense'], total, events);
        if (currentStats(creature, state.sides[target.side].field).defense <= 0) {
          removeCreatureFromField(state, target.side, target.slot, events, {
            scores: true,
            inBattle: false,
          });
        }
      }
      return null;
    }
    case 'jar_element': {
      changeElement(state, context.side, context.slot, optionId as Element, events);
      return null;
    }
    case 'sapomerlim_element': {
      changeElement(state, context.side, context.slot, optionId as Element, events, {
        untilEndOfTurn: true,
      });
      return null;
    }
    case 'map_discard': {
      const owner = state.sides[context.side];
      const index = owner.hand.findIndex((inHand) => inHand.uid === optionId);
      if (index < 0) return 'invalid_option';
      const [discarded] = owner.hand.splice(index, 1);
      owner.discard.push(discarded!);
      events.push({
        type: 'CARD_DISCARDED',
        side: context.side,
        card: discarded!,
        reason: 'effect',
      });
      onCreatureCardEnteredDiscard(state, context.side, discarded!.cardId, discarded!.uid);
      return null;
    }
    case 'leviathan_target': {
      if (declined) return null;
      const target = parseTarget(optionId);
      if (!target || target.side !== context.side) return 'invalid_option';
      const owner = state.sides[context.side];
      const candidates = owner.hand.filter((inHand) => cardMatches(inHand.cardId, context.filter));
      if (!candidates.length) return null;
      createPending(state, {
        side: context.side,
        type: 'choose_card',
        title: text('pending.summonOverChosen'),
        options: candidates.map((inHand) => cardOption(inHand.uid, inHand.cardId)),
        canDecline: false,
        context: { type: 'leviathan_summon', side: context.side, slot: target.slot },
      });
      return null;
    }
    case 'leviathan_summon': {
      const owner = state.sides[context.side];
      const index = owner.hand.findIndex((inHand) => inHand.uid === optionId);
      if (index < 0) return 'invalid_option';
      // a criatura coberta vai ao descarte sem pontuar (não foi destruída em batalha)
      if (owner.field[context.slot]) {
        removeCreatureFromField(state, context.side, context.slot, events, {
          scores: false,
          inBattle: false,
        });
      }
      const [fromHand] = owner.hand.splice(index, 1);
      const summoned = newCreatureInPlay(state.turn, fromHand!.uid, fromHand!.cardId);
      owner.field[context.slot] = summoned;
      events.push({
        type: 'CREATURE_SUMMONED',
        side: context.side,
        slot: context.slot,
        card: fromHand!,
      });
      heroOnCreatureEnter(state, context.side, summoned, events);
      queueOnEnter(state, context.side, context.slot);
      onOtherCreatureEntered(state, context.side, summoned, events);
      return null;
    }
    case 'oracle_choose': {
      const enemy = oppositeSide(context.side);
      const owner = state.sides[enemy];
      const index = owner.hand.findIndex((inHand) => inHand.uid === optionId);
      if (index < 0) return 'invalid_option';
      const [returned] = owner.hand.splice(index, 1);
      owner.deck.push(returned!);
      const result = shuffle(state.rng, owner.deck);
      state.rng = result.rng;
      owner.deck = result.items;
      events.push({ type: 'CARD_SHUFFLED_INTO_DECK', side: enemy, card: returned! });
      return null;
    }
    case 'heart_swap': {
      if (optionId === 'yes') {
        const targets = slotsWithCreature(state, context.side, { name_includes: 'Contos' });
        if (targets.length) {
          createPending(state, {
            side: context.side,
            type: 'choose_target',
            title: text('pending.heartSwapTarget'),
            options: targets.map((slot) => slotOption(state, context.side, slot)),
            canDecline: true,
            context: { ...context, type: 'heart_swap_target' },
          });
          return null;
        }
      }
      returnAttachmentToHand(state, context, events);
      return null;
    }
    case 'react_command': {
      if (declined) {
        events.push({ type: 'REACTION_DECLINED', side: context.side });
        return null;
      }
      const owner = state.sides[context.side];
      const inHand = owner.hand.find((card) => card.uid === optionId);
      if (!inHand) return 'invalid_option';
      const card = cardById(inHand.cardId);
      const target = commandTargetKind(card);
      if (!target) return playCommand(state, context.side, inHand.uid, undefined, events);
      const targetSide = target === 'chosen_enemy' ? oppositeSide(context.side) : context.side;
      const slots = slotsWithCreature(state, targetSide);
      if (!slots.length) return null; // o alvo sumiu; a carta fica na mão
      createPending(state, {
        side: context.side,
        type: 'choose_target',
        title: text('pending.commandTarget', { card: cardRef(card.id) }),
        options: slots.map((slot) => slotOption(state, targetSide, slot)),
        canDecline: true,
        reaction: true,
        context: {
          type: 'react_command_target',
          side: context.side,
          cardUid: inHand.uid,
          targetSide,
        },
      });
      return null;
    }
    case 'react_command_target': {
      if (declined) {
        events.push({ type: 'REACTION_DECLINED', side: context.side });
        return null;
      }
      const target = parseTarget(optionId);
      if (!target || target.side !== context.targetSide) return 'invalid_option';
      return playCommand(state, context.side, context.cardUid, target, events);
    }
    case 'react_ability': {
      if (declined) {
        events.push({ type: 'REACTION_DECLINED', side: context.side });
        return null;
      }
      const target = parseTarget(optionId);
      if (!target || target.side !== context.side) return 'invalid_option';
      const creature = state.sides[context.side].field[target.slot];
      if (!creature) return null;
      const ability = abilityUsableInReaction(state, context.side, creature);
      if (!ability) return null;
      return activateAbility(
        state,
        context.side,
        creature.uid,
        ability.id,
        undefined,
        events,
        { inReaction: true },
      );
    }
    case 'heart_swap_target': {
      if (!declined) {
        const target = parseTarget(optionId);
        if (!target) return 'invalid_option';
        const creature = state.sides[target.side].field[target.slot];
        if (creature) {
          const stats = currentStats(creature, state.sides[target.side].field);
          creature.temporaryModifiers.push({
            attack: stats.defense - stats.attack,
            defense: stats.attack - stats.defense,
            expiresAfterTurn: state.turn,
          });
          events.push({
            type: 'TEMPORARY_MODIFIER',
            side: target.side,
            creatureUid: creature.uid,
            attack: stats.defense - stats.attack,
            defense: stats.attack - stats.defense,
          });
        }
      }
      returnAttachmentToHand(state, context, events);
      return null;
    }
  }
}

function returnAttachmentToHand(
  state: GameState,
  context: { side: SideId; slot: number; attachmentUid: string; returnToHand: boolean },
  events: GameEvent[],
): void {
  if (!context.returnToHand) return;
  const creature = state.sides[context.side].field[context.slot];
  if (!creature) return;
  const index = creature.attachments.findIndex((attachment) => attachment.uid === context.attachmentUid);
  if (index < 0) return;
  const [attachment] = creature.attachments.splice(index, 1);
  state.sides[context.side].hand.push({ uid: attachment!.uid, cardId: attachment!.cardId });
  events.push({
    type: 'ATTACHMENT_RETURNED_TO_HAND',
    side: context.side,
    slot: context.slot,
    card: { uid: attachment!.uid, cardId: attachment!.cardId },
  });
  // estouro da mão segue a regra normal
  while (state.sides[context.side].hand.length > MAX_HAND) {
    const roll = randomInt(state.rng, 0, state.sides[context.side].hand.length - 1);
    state.rng = roll.rng;
    const [discarded] = state.sides[context.side].hand.splice(roll.value, 1);
    if (!discarded) break;
    state.sides[context.side].discard.push(discarded);
    events.push({ type: 'HAND_LIMIT_DISCARD', side: context.side, card: discarded });
  }
}

/** Afogamento: guarda no anexo qual criatura inimiga ele mirou. */
function markAttachmentTarget(
  state: GameState,
  side: SideId,
  attachmentUid: string,
  targetUid: string,
): void {
  for (const holder of state.sides[side].field) {
    const attachment = holder?.attachments.find((a) => a.uid === attachmentUid);
    if (attachment) {
      attachment.chosenTargetUid = targetUid;
      return;
    }
  }
}

function parseTarget(optionId: string): { side: SideId; slot: number } | null {
  const [side, slotText] = optionId.split(':');
  const slot = Number(slotText);
  if ((side !== 'a' && side !== 'b') || !Number.isInteger(slot)) return null;
  return { side, slot };
}

function slotOfCreature(state: GameState, side: SideId, uid: string): number | null {
  const slot = state.sides[side].field.findIndex((c) => c?.uid === uid);
  return slot >= 0 ? slot : null;
}

// ── comandos (cartas de comando) ─────────────────────────────────────────────

export function playCommand(
  state: GameState,
  side: SideId,
  cardUid: string,
  target: { side: SideId; slot: number } | undefined,
  events: GameEvent[],
): ErrorCode | null {
  const owner = state.sides[side];
  const index = owner.hand.findIndex((inHand) => inHand.uid === cardUid);
  if (index < 0) return 'card_not_in_hand';
  const zoneCard = owner.hand[index]!;
  const card = cardById(zoneCard.cardId);
  if (card.type !== 'command') return 'not_a_command';
  /* importada do Figma e ainda sem comportamento modelado: não sai da mão */
  if (!card.effects?.length) return 'effect_not_implemented';

  // valida alvo antes de mover a carta
  for (const effect of card.effects) {
    const needsTarget =
      'target' in effect && (effect.target === 'chosen_enemy' || effect.target === 'chosen_ally');
    if (!needsTarget) continue;
    const expectedSide = effect.target === 'chosen_enemy' ? oppositeSide(side) : side;
    if (!target || target.side !== expectedSide) return 'command_needs_target';
    if (!state.sides[target.side].field[target.slot]) return 'target_slot_empty';
  }

  owner.hand.splice(index, 1);
  events.push({ type: 'COMMAND_PLAYED', side, card: zoneCard });

  for (const effect of card.effects) {
    switch (effect.type) {
      case 'prevent_attack': {
        const creature = state.sides[target!.side].field[target!.slot];
        if (!creature) break;
        creature.cannotAttackUntilTurn = Math.max(creature.cannotAttackUntilTurn ?? 0, state.turn);
        events.push({
          type: 'PREVENTED_FROM_ATTACKING',
          side: target!.side,
          creatureUid: creature.uid,
          untilTurn: state.turn,
        });
        break;
      }
      case 'prevent_being_targeted': {
        const creature = state.sides[target!.side].field[target!.slot];
        if (!creature) break;
        creature.cannotBeTargetedUntilTurn = Math.max(creature.cannotBeTargetedUntilTurn ?? 0, state.turn);
        events.push({
          type: 'PROTECTED_FROM_ATTACKS',
          side: target!.side,
          creatureUid: creature.uid,
          untilTurn: state.turn,
        });
        break;
      }
      case 'discard_hand_then_draw': {
        const discardedCards = owner.hand.splice(0, owner.hand.length);
        for (const discarded of discardedCards) {
          owner.discard.push(discarded);
          events.push({ type: 'CARD_DISCARDED', side, card: discarded, reason: 'effect' });
          onCreatureCardEnteredDiscard(state, side, discarded.cardId, discarded.uid);
        }
        const canDraw = Math.min(
          discardedCards.length,
          owner.deck.length,
          MAX_HAND - owner.hand.length,
        );
        drawCards(state, side, canDraw, events);
        break;
      }
      case 'modify_stats': {
        const creature = state.sides[target!.side].field[target!.slot];
        if (!creature) break;
        let value = 0;
        if (effect.value_per_card?.zone === 'your_discard') {
          const includes_ = effect.value_per_card.name_includes;
          const howMany = owner.discard.filter(
            (node) => !includes_ || cardById(node.cardId).name.includes(includes_),
          ).length;
          value = howMany * effect.value_per_card.value;
        }
        if (!value) break;
        const attack = effect.stats.includes('attack') ? value : 0;
        const defense = effect.stats.includes('defense') ? value : 0;
        creature.temporaryModifiers.push({ attack, defense, expiresAfterTurn: state.turn });
        events.push({
          type: 'TEMPORARY_MODIFIER',
          side: target!.side,
          creatureUid: creature.uid,
          attack,
          defense,
        });
        break;
      }
      case 'sacrifice_then_summon_from_deck': {
        const creature = state.sides[target!.side].field[target!.slot];
        if (!creature) break;
        events.push({ type: 'CREATURE_SACRIFICED', side, slot: target!.slot, uid: creature.uid });
        removeCreatureFromField(state, side, target!.slot, events, {
          scores: false,
          inBattle: false,
        });
        let summonedCount = 0;
        for (let i = owner.deck.length - 1; i >= 0 && summonedCount < effect.summon.count; i--) {
          const node = owner.deck[i]!;
          const candidate = cardById(node.cardId);
          if (candidate.type !== 'creature') continue;
          if (effect.summon.race && candidate.race !== effect.summon.race) continue;
          if (effect.summon.max_attack != null && candidate.attack > effect.summon.max_attack) continue;
          const emptySlot = owner.field.findIndex((c) => c === null);
          if (emptySlot < 0) break;
          owner.deck.splice(i, 1);
          const summoned = newCreatureInPlay(state.turn, node.uid, node.cardId, {
            canAttackThisTurn: effect.summon.can_attack_this_turn !== false,
          });
          owner.field[emptySlot] = summoned;
          events.push({ type: 'SUMMONED_FROM_DECK', side, slot: emptySlot, card: node });
          heroOnCreatureEnter(state, side, summoned, events);
          queueOnEnter(state, side, emptySlot);
          onOtherCreatureEntered(state, side, summoned, events);
          summonedCount++;
        }
        break;
      }
      case 'reveal_opponent_hand_then_shuffle_one': {
        const enemy = state.sides[oppositeSide(side)];
        if (!enemy.hand.length) break;
        const revealedUids: string[] = [];
        const indexes = new Set<number>();
        while (revealedUids.length < Math.min(effect.reveal, enemy.hand.length)) {
          const roll = randomInt(state.rng, 0, enemy.hand.length - 1);
          state.rng = roll.rng;
          if (indexes.has(roll.value)) continue;
          indexes.add(roll.value);
          const revealed = enemy.hand[roll.value]!;
          revealedUids.push(revealed.uid);
          events.push({ type: 'CARD_REVEALED', side: oppositeSide(side), card: revealed });
        }
        createPending(state, {
          side,
          type: 'choose_card',
          title: text('pending.oracleChoose'),
          options: revealedUids.map((uid) => {
            const inHand = enemy.hand.find((c) => c.uid === uid)!;
            return cardOption(uid, inHand.cardId);
          }),
          canDecline: false,
          context: { type: 'oracle_choose', side, revealedUids },
        });
        break;
      }
      case 'force_attack':
        // Sob a regra de ataque por coluna o alvo é sempre a coluna em frente;
        // forçar alvo não tem efeito (paridade com o legado). Ver decisions.md.
        break;
    }
  }

  owner.discard.push(zoneCard);
  return null;
}

// ── habilidades ativadas ─────────────────────────────────────────────────────

export function activateAbility(
  state: GameState,
  side: SideId,
  sourceUid: string,
  abilityId: string,
  element: Element | undefined,
  events: GameEvent[],
  options: { inReaction?: boolean } = {},
): ErrorCode | null {
  const owner = state.sides[side];

  // origem: criatura em campo
  for (let slot = 0; slot < owner.field.length; slot++) {
    const creature = owner.field[slot];
    if (!creature || creature.uid !== sourceUid || creature.cardId === null) continue;
    const card = cardById(creature.cardId);
    if (card.type !== 'creature') continue;
    const ability = (card.activatedAbilities ?? []).find((h) => h.id === abilityId);
    if (!ability) return 'unknown_ability';
    if (ability.condition?.active_player === 'opponent' && !options.inReaction) {
      return 'reaction_only_ability';
    }
    if (ability.timing === 'once_per_turn' && creature.usedAbilities[abilityId] === state.turn) {
      return 'ability_already_used';
    }

    if (ability.action.type === 'summon_from_discard') {
      const filter = ability.action.filter;
      const index = owner.discard.findIndex((node) => cardMatches(node.cardId, filter));
      const emptySlot = owner.field.findIndex((c, i) => c === null && i !== slot);
      const willHaveRoom = emptySlot >= 0 || ability.cost?.type === 'sacrifice_self';
      if (index < 0 || !willHaveRoom) return 'no_discard_target';
    }

    if (!payCost(state, side, slot, ability.cost, events)) {
      return 'cost_not_paid';
    }
    events.push({ type: 'ABILITY_ACTIVATED', side, sourceUid, abilityId });

    switch (ability.action.type) {
      case 'prevent_attack': {
        const stillOnField = owner.field[slot];
        if (stillOnField) {
          stillOnField.cannotAttackUntilTurn = state.turn + 1;
          stillOnField.usedAbilities[abilityId] = state.turn;
        }
        return null;
      }
      // Mamuthe Ancestral: mói 2 e cresce com a variedade de elementos do descarte
      case 'mill_then_gain_health_per_element': {
        const stillOnField = owner.field[slot];
        if (!stillOnField) return null;
        stillOnField.usedAbilities[abilityId] = state.turn;
        millThenGainHealth(
          state,
          side,
          stillOnField,
          ability.action.mill,
          ability.action.value,
          events,
        );
        return null;
      }
      case 'summon_from_discard': {
        const filter = ability.action.filter;
        const index = owner.discard.findIndex((node) => cardMatches(node.cardId, filter));
        if (index < 0) return null;
        const emptySlot = owner.field.findIndex((c) => c === null);
        if (emptySlot < 0) return null;
        const [fromDiscard] = owner.discard.splice(index, 1);
        const summoned = newCreatureInPlay(state.turn, fromDiscard!.uid, fromDiscard!.cardId);
        owner.field[emptySlot] = summoned;
        events.push({ type: 'SUMMONED_FROM_DISCARD', side, slot: emptySlot, card: fromDiscard! });
        heroOnCreatureEnter(state, side, summoned, events);
        queueOnEnter(state, side, emptySlot);
        onOtherCreatureEntered(state, side, summoned, events);
        return null;
      }
      default:
        return 'ability_pending_design';
    }
  }

  // origem: anexo (Sapocalibur — só itens têm habilidades ativadas)
  for (let slot = 0; slot < owner.field.length; slot++) {
    const creature = owner.field[slot];
    if (!creature) continue;
    const attachment = creature.attachments.find((a) => a.uid === sourceUid);
    if (!attachment) continue;
    const card = cardById(attachment.cardId);
    if (card.type !== 'item') continue;
    const ability = (card.activatedAbilities ?? []).find((h) => h.id === abilityId);
    if (!ability) return 'unknown_ability';
    if (
      ability.condition?.attached_creature_race &&
      creatureDef(creature).race !== ability.condition.attached_creature_race
    ) {
      return 'attached_race_condition';
    }
    const used = (attachment.usedAbilities ??= {});
    if (ability.timing === 'once_per_turn' && used[abilityId] === state.turn) {
      return 'ability_already_used';
    }
    if (ability.action.type !== 'change_element') {
      return 'ability_pending_design';
    }
    if (!element || !(ability.action.choose ?? CHOOSABLE_ELEMENTS).includes(element)) {
      return 'choose_valid_element';
    }
    used[abilityId] = state.turn;
    events.push({ type: 'ABILITY_ACTIVATED', side, sourceUid, abilityId });
    changeElement(state, side, slot, element, events);
    return null;
  }

  // origem: carta na mão (Leviathan de Esdras — invocação especial)
  const handIndex = owner.hand.findIndex((inHand) => inHand.uid === sourceUid);
  if (handIndex >= 0) {
    const inHand = owner.hand[handIndex]!;
    const card = cardById(inHand.cardId);
    if (card.type !== 'creature') return 'no_hand_ability';
    const ability = (card.activatedAbilities ?? []).find(
      (h) => h.id === abilityId && h.source === 'hand',
    );
    if (!ability) return 'unknown_ability';
    if (ability.action.type !== 'special_summon_over_ally') {
      return 'ability_pending_design';
    }
    const filter = ability.action.filter;
    const targets = slotsWithCreature(state, side);
    const hasSummonable = owner.hand.some(
      (other, i) => i !== handIndex && cardMatches(other.cardId, filter),
    );
    if (!targets.length || !hasSummonable) {
      return 'needs_creature_and_card';
    }

    // custo: descartar esta carta da mão
    owner.hand.splice(handIndex, 1);
    owner.discard.push(inHand);
    events.push({ type: 'CARD_DISCARDED', side, card: inHand, reason: 'cost' });
    onCreatureCardEnteredDiscard(state, side, inHand.cardId, inHand.uid);
    events.push({ type: 'ABILITY_ACTIVATED', side, sourceUid, abilityId });

    createPending(state, {
      side,
      type: 'choose_target',
      title: text('pending.coveredCreature'),
      options: targets.map((slot) => slotOption(state, side, slot)),
      canDecline: false,
      context: { type: 'leviathan_target', side, filter },
    });
    return null;
  }

  return 'ability_source_not_found';
}

/** Mamuthe Ancestral: mói do topo e ganha +VIDA por elemento distinto no descarte. */
function millThenGainHealth(
  state: GameState,
  side: SideId,
  creature: CreatureInPlay,
  mill: number,
  perElement: number,
  events: GameEvent[],
): void {
  const owner = state.sides[side];
  const howMany = Math.min(mill, owner.deck.length);
  for (let i = 0; i < howMany; i++) {
    const milled = owner.deck.shift()!;
    owner.discard.push(milled);
    events.push({ type: 'CARD_MILLED', side, card: milled });
    onCreatureCardEnteredDiscard(state, side, milled.cardId, milled.uid);
  }
  const elements = new Set(owner.discard.map((card) => cardById(card.cardId).element));
  applyMarker(creature, side, ['defense'], elements.size * perElement, events);
}

function payCost(
  state: GameState,
  side: SideId,
  slot: number,
  cost: { type: string; name_includes?: string } | undefined,
  events: GameEvent[],
): boolean {
  if (!cost) return true;
  const owner = state.sides[side];
  const creature = owner.field[slot];
  if (!creature) return false;

  if (cost.type === 'destroy_attachment') {
    const includes_ = (cost.name_includes ?? '').toLowerCase();
    const index = creature.attachments.findIndex((attachment) =>
      cardById(attachment.cardId).name.toLowerCase().includes(includes_),
    );
    if (index < 0) return false;
    const [attachment] = creature.attachments.splice(index, 1);
    owner.discard.push({ uid: attachment!.uid, cardId: attachment!.cardId });
    events.push({
      type: 'ATTACHMENT_DISCARDED',
      side,
      slot,
      card: { uid: attachment!.uid, cardId: attachment!.cardId },
    });
    onAttachmentDiscarded(state, side, attachment!.uid, attachment!.cardId, state.phase !== 'battle');
    return true;
  }

  if (cost.type === 'sacrifice_self') {
    events.push({ type: 'CREATURE_SACRIFICED', side, slot, uid: creature.uid });
    removeCreatureFromField(state, side, slot, events, { scores: false, inBattle: false });
    return true;
  }

  return false;
}

// ── fim de turno ─────────────────────────────────────────────────────────────

export function resolveEndOfTurn(state: GameState, events: GameEvent[]): void {
  const side = state.activeSide;
  const owner = state.sides[side];

  // Guardião Enlouquecido: destrói a anexada que não atacou
  for (let slot = 0; slot < owner.field.length; slot++) {
    const creature = owner.field[slot];
    if (!creature || creature.attackedOnTurn === state.turn) continue;
    const doomed = creature.attachments.some((attachment) => {
      const card = cardById(attachment.cardId);
      if (card.type !== 'ability' && card.type !== 'item') return false;
      return (card.triggeredAbilities ?? []).some(
        (h) =>
          h.trigger === 'host_did_not_attack_this_turn' &&
          h.action.type === 'destroy',
      );
    });
    if (doomed) {
      removeCreatureFromField(state, side, slot, events, { scores: false, inBattle: false });
    }
  }

  // Manopla do Poder: dano adiado
  const due = state.delayedEffects.filter((e) => e.resolvesOnTurn <= state.turn);
  state.delayedEffects = state.delayedEffects.filter((e) => e.resolvesOnTurn > state.turn);
  for (const delayed of due) {
    const slot = state.sides[delayed.side].field.findIndex((c) => c?.uid === delayed.creatureUid);
    if (slot < 0) continue;
    effectDamageToCreature(state, delayed.side, slot, delayed.damage, events);
  }
}

export { canBeAttackTarget };
