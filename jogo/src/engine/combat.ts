import { cardById } from '../data/cards.ts';
import {
  creatureMatches,
  creatureDef,
  pointsForRarity,
  hasKeyword,
} from './cardsInPlay.ts';
import type { GameEvent } from './events.ts';
import {
  DIRECT_DAMAGE_PER_POINT,
  POINTS_TO_WIN,
  oppositeSide,
  type AttachmentInPlay,
  type CreatureInPlay,
  type GameState,
  type SideId,
} from './state.ts';
import {
  onAttachmentDiscarded,
  onPlayerDamageDealt,
  onCreatureAttacks,
  onCreatureLeftFieldToDiscard,
  onCreatureAttacked,
  scenarioOnBattleDestroy,
} from './triggers.ts';
import { currentStats } from './stats.ts';
import { drawCards } from './zones.ts';

/**
 * Redução de dano de combate (Badur, Resistência): fontes no campo do dono do
 * alvo com `reduce_combat_damage_taken` cujo filtro casa com o alvo, mais os
 * anexos do próprio alvo. Porta de `_combatDamageAfterReduction`.
 *
 * `once_per_turn` (Resistência) marca o anexo: só a primeira leva de dano do
 * turno é reduzida. Por isso a função precisa do turno e escreve no anexo —
 * chame-a UMA vez por instância de dano.
 */
export function damageAfterReduction(
  target: CreatureInPlay,
  ownerField: readonly (CreatureInPlay | null)[],
  baseDamage: number,
  turn: number,
): number {
  let damage = Math.max(0, baseDamage);
  if (damage <= 0) return damage;

  for (const source of ownerField) {
    if (!source || source.cardId === null) continue;
    const card = cardById(source.cardId);
    if (card.type !== 'creature') continue;
    for (const effect of card.effects ?? []) {
      if (effect.type !== 'reduce_combat_damage_taken') continue;
      if (effect.exclude_source && source.uid === target.uid) continue;
      if (!creatureMatches(target, effect.filter)) continue;
      damage = Math.max(0, damage - effect.value);
    }
  }

  for (const attachment of target.attachments) {
    const card = cardById(attachment.cardId);
    if (card.type !== 'ability' && card.type !== 'item') continue;
    for (const effect of card.effects ?? []) {
      if (effect.type !== 'reduce_combat_damage_taken') continue;
      if (effect.once_per_turn) {
        if (attachment.reductionUsedOnTurn === turn) continue;
        attachment.reductionUsedOnTurn = turn;
      }
      damage = Math.max(0, damage - effect.value);
    }
  }

  return damage;
}

/**
 * MARCIAL ("ataca primeiro"): quem tem a palavra bate antes, e se o golpe matar
 * a criatura oposta ela não revida. Com a palavra dos dois lados ninguém
 * antecipa e o dano volta a ser simultâneo (a regra padrão do manual).
 *
 * Vale nos dois papéis — atacando e defendendo: num motor de dano simultâneo é
 * a defesa que dá sentido a "não sofre dano" (decisão nº 13).
 */
function whoStrikesFirst(
  attacker: CreatureInPlay,
  defender: CreatureInPlay,
): 'atacante' | 'defensor' | null {
  const onAttacker = hasKeyword(attacker, 'martial');
  const onDefender = hasKeyword(defender, 'martial');
  if (onAttacker === onDefender) return null;
  return onAttacker ? 'atacante' : 'defensor';
}

/**
 * Aplica um golpe de batalha e devolve o dano que passou. Chame UMA vez por
 * golpe: `danoAposReducao` gasta a redução 1x-por-turno do alvo (Resistência),
 * e com MARCIAL o golpe pode nem acontecer.
 */
function strike(
  target: CreatureInPlay,
  targetField: readonly (CreatureInPlay | null)[],
  attack: number,
  turn: number,
): number {
  const damage = damageAfterReduction(target, targetField, attack, turn);
  target.damage += damage;
  return damage;
}

function isAlive(
  creature: CreatureInPlay,
  field: readonly (CreatureInPlay | null)[],
): boolean {
  return currentStats(creature, field).defense > 0;
}

/**
 * VORPAL: destruiu a criatura inimiga em batalha → o ATQ IMPRESSO desta criatura
 * (não o modificado por anexos, auras ou marcadores) vira dano direto adicional
 * no dono dela. Roda mesmo se a portadora tiver caído no mesmo golpe, como o
 * excedente de `atropelar`.
 */
function applyVorpalDamage(
  state: GameState,
  side: SideId,
  creature: CreatureInPlay,
  attachmentsBeforeBattle: readonly AttachmentInPlay[],
  events: GameEvent[],
): void {
  if (!hasKeyword(creature, 'vorpal')) return;
  const printedAttack = creatureDef(creature).attack;
  if (printedAttack <= 0) return;
  dealDirectDamage(state, oppositeSide(side), printedAttack, creature.uid, events);
  onPlayerDamageDealt(state, side, attachmentsBeforeBattle);
}

/**
 * Corpo Translúcido + "não pode ser alvo": porta de `_canBeAttackTarget`.
 * O bloqueio compara a DEFESA ATUAL do atacante com o mínimo do efeito.
 * Recebe só o turno (não o estado) para servir também à visão do cliente.
 */
export function canBeAttackTarget(
  turn: number,
  target: CreatureInPlay,
  attacker: CreatureInPlay,
  attackerField: readonly (CreatureInPlay | null)[],
): boolean {
  if ((target.cannotBeTargetedUntilTurn ?? 0) >= turn) return false;
  const attackerHealth = currentStats(attacker, attackerField).defense;
  return !target.attachments.some((attachment) => {
    const card = cardById(attachment.cardId);
    if (card.type !== 'ability' && card.type !== 'item') return false;
    return (card.effects ?? []).some(
      (effect) =>
        effect.type === 'cannot_be_attacked_by_creatures_with_min_defense' &&
        attackerHealth >= effect.min_defense,
    );
  });
}

/** Soma pontos (teto 3) e encerra a partida ao alcançar o teto. */
export function addPoints(
  state: GameState,
  side: SideId,
  gained: number,
  events: GameEvent[],
): void {
  if (gained <= 0 || state.winner) return;
  const owner = state.sides[side];
  owner.points = Math.min(POINTS_TO_WIN, owner.points + gained);
  events.push({ type: 'SCORED', side, gained, total: owner.points });
  if (owner.points >= POINTS_TO_WIN) {
    state.winner = side;
    state.endReason = 'points';
    state.pending = null;
    state.queue = [];
    events.push({ type: 'GAME_OVER', winner: side, reason: 'points' });
  }
}

/** Dano direto acumula; a cada 5, o agressor pontua e o excedente permanece. */
export function dealDirectDamage(
  state: GameState,
  sufferer: SideId,
  value: number,
  sourceUid: string,
  events: GameEvent[],
): void {
  if (value <= 0 || state.winner) return;
  const owner = state.sides[sufferer];
  owner.directDamage += value;
  events.push({ type: 'DIRECT_DAMAGE', sufferer, value, sourceUid });
  while (owner.directDamage >= DIRECT_DAMAGE_PER_POINT && !state.winner) {
    owner.directDamage -= DIRECT_DAMAGE_PER_POINT;
    addPoints(state, oppositeSide(sufferer), 1, events);
  }
}

export interface RemovalOptions {
  /** destruição pontua por raridade; sacrifício/efeito de descarte, não */
  scores: boolean;
  inBattle: boolean;
  /** criatura que causou a destruição (gatilho de vingança do Pirata Afogado) */
  destroyer?: { side: SideId; slot: number };
}

/**
 * Remove uma criatura do campo para o descarte do dono (ou dissolve a ficha),
 * com anexos, pontos, gatilhos de morte/descarte e cenário. Núcleo comum de
 * `_destroyCreatureInBattle` e `_sendFieldCreatureToDiscard` do legado.
 */
export function removeCreatureFromField(
  state: GameState,
  side: SideId,
  slot: number,
  events: GameEvent[],
  options: RemovalOptions,
): void {
  const owner = state.sides[side];
  const creature = owner.field[slot];
  if (!creature) return;

  const def = creatureDef(creature);
  if (options.scores) {
    addPoints(state, oppositeSide(side), pointsForRarity(def.rarity), events);
  }

  // vingança (destroyed_by_creature) antes da remoção, como no legado
  if (options.destroyer && creature.cardId !== null) {
    const card = cardById(creature.cardId);
    if (card.type === 'creature') {
      for (const ability of card.triggeredAbilities ?? []) {
        if (ability.trigger !== 'self_destroyed_by_creature') continue;
        if (ability.action.type !== 'deal_damage') continue;
        effectDamageToCreature(
          state,
          options.destroyer.side,
          options.destroyer.slot,
          ability.action.damage,
          events,
        );
      }
    }
  }

  const isToken = creature.cardId === null;
  if (!isToken) {
    owner.discard.push({ uid: creature.uid, cardId: creature.cardId! });
  }
  for (const attachment of creature.attachments) {
    owner.discard.push({ uid: attachment.uid, cardId: attachment.cardId });
    events.push({
      type: 'ATTACHMENT_DISCARDED',
      side,
      slot,
      card: { uid: attachment.uid, cardId: attachment.cardId },
    });
    onAttachmentDiscarded(state, side, attachment.uid, attachment.cardId, !options.inBattle);
  }
  owner.field[slot] = null;
  events.push({
    type: 'CREATURE_DESTROYED',
    side,
    slot,
    uid: creature.uid,
    inBattle: options.inBattle,
    toDiscard: !isToken,
  });

  // Sapotristan: quem carregava a troca compra 1 se morrer com elemento alterado
  if (creature.drawOnDeathWithElementChanged && creature.changedElement) {
    drawCards(state, creature.drawOnDeathWithElementChanged, 1, events);
  }
  // Afogamento: o anexo que escolheu esta criatura como alvo cai junto
  discardAttachmentsAimingAt(state, creature.uid, events);

  if (!isToken) {
    onCreatureLeftFieldToDiscard(state, side, creature, events);
    if (options.inBattle && options.scores) {
      scenarioOnBattleDestroy(state, side, events);
    }
  }
}

/** `chosen_enemy_creature_dies` + `destroy_self` (Afogamento), nos dois lados. */
function discardAttachmentsAimingAt(
  state: GameState,
  targetUid: string,
  events: GameEvent[],
): void {
  for (const side of ['a', 'b'] as const) {
    state.sides[side].field.forEach((holder, slot) => {
      if (!holder) return;
      for (let i = holder.attachments.length - 1; i >= 0; i--) {
        const attachment = holder.attachments[i]!;
        if (attachment.chosenTargetUid !== targetUid) continue;
        const card = cardById(attachment.cardId);
        if (card.type !== 'ability' && card.type !== 'item') continue;
        const falls = (card.triggeredAbilities ?? []).some(
          (h) => h.trigger === 'chosen_creature_dies' && h.action.type === 'destroy',
        );
        if (!falls) continue;
        holder.attachments.splice(i, 1);
        state.sides[side].discard.push({ uid: attachment.uid, cardId: attachment.cardId });
        events.push({
          type: 'ATTACHMENT_DISCARDED',
          side,
          slot,
          card: { uid: attachment.uid, cardId: attachment.cardId },
        });
        onAttachmentDiscarded(state, side, attachment.uid, attachment.cardId, state.phase !== 'battle');
      }
    });
  }
}

/** Dano de efeito (vingança, Manopla): destrói com pontos se a vida zerar. */
export function effectDamageToCreature(
  state: GameState,
  side: SideId,
  slot: number,
  value: number,
  events: GameEvent[],
): void {
  const creature = state.sides[side].field[slot];
  if (!creature || value <= 0) return;
  creature.damage += value;
  events.push({ type: 'CREATURE_DAMAGED', side, creatureUid: creature.uid, value });
  if (currentStats(creature, state.sides[side].field).defense <= 0) {
    removeCreatureFromField(state, side, slot, events, { scores: true, inBattle: true });
  }
}

/**
 * Resolve o ataque já autorizado (escudo do defensor consultado antes, em
 * efeitos.ts). Porta de `_resolveCreatureBattle`/`_resolveDirectAttack`.
 */
export function resolveAttackNow(
  state: GameState,
  side: SideId,
  slot: number,
  events: GameEvent[],
): void {
  const attackerSide = state.sides[side];
  const defenderSide = state.sides[oppositeSide(side)];
  const attacker = attackerSide.field[slot];
  if (!attacker) return;

  const defender = defenderSide.field[slot];
  const attackerStats = currentStats(attacker, attackerSide.field);
  const attackerAttachments = [...attacker.attachments];

  if (!defender) {
    attacker.attackedOnTurn = state.turn;
    onCreatureAttacks(state, side, attacker, events);
    if (attackerStats.attack > 0) {
      dealDirectDamage(state, oppositeSide(side), attackerStats.attack, attacker.uid, events);
      onPlayerDamageDealt(state, side, attackerAttachments);
    }
    return;
  }

  // Reflexos de Morte dispara por ter sido atacada, antes de saber quem morre
  const defenderAttachments = [...defender.attachments];

  const defenderStats = currentStats(defender, defenderSide.field);
  const defenderHealthBefore = defenderStats.defense;

  attacker.attackedOnTurn = state.turn;
  const attackerTramples = hasKeyword(attacker, 'trample');

  // ordem dos golpes: simultânea, salvo MARCIAL de um dos lados
  const firstStrike = whoStrikesFirst(attacker, defender);
  let damageToDefender = 0;
  let damageToAttacker = 0;
  if (firstStrike === 'defensor') {
    damageToAttacker = strike(attacker, attackerSide.field, defenderStats.attack, state.turn);
    if (isAlive(attacker, attackerSide.field)) {
      damageToDefender = strike(defender, defenderSide.field, attackerStats.attack, state.turn);
    }
  } else {
    damageToDefender = strike(defender, defenderSide.field, attackerStats.attack, state.turn);
    if (firstStrike !== 'atacante' || isAlive(defender, defenderSide.field)) {
      damageToAttacker = strike(attacker, attackerSide.field, defenderStats.attack, state.turn);
    }
  }

  events.push({
    type: 'BATTLE',
    attacker: { side, slot, uid: attacker.uid },
    defender: { side: oppositeSide(side), slot, uid: defender.uid },
    damageToDefender,
    damageToAttacker,
  });

  // paridade com o legado: o atacante é verificado (e destruído) primeiro
  const attackerDestroyed = !isAlive(attacker, attackerSide.field);
  if (attackerDestroyed) {
    removeCreatureFromField(state, side, slot, events, {
      scores: true,
      inBattle: true,
      destroyer: { side: oppositeSide(side), slot },
    });
  }
  const defenderDestroyed =
    !!defenderSide.field[slot] && !isAlive(defenderSide.field[slot]!, defenderSide.field);
  if (defenderDestroyed) {
    removeCreatureFromField(state, oppositeSide(side), slot, events, {
      scores: true,
      inBattle: true,
      destroyer: { side, slot },
    });
  }

  // gatilhos de ataque dos anexos, com a lista pré-batalha (legado)
  const attackerStillThere = attackerSide.field[slot];
  onCreatureAttacks(
    state,
    side,
    attackerStillThere ?? { ...attacker, attachments: attackerAttachments },
    events,
  );
  onCreatureAttacked(state, oppositeSide(side), defenderAttachments);

  if (attackerTramples) {
    const overflow = Math.max(0, damageToDefender - defenderHealthBefore);
    if (overflow > 0) {
      dealDirectDamage(state, oppositeSide(side), overflow, attacker.uid, events);
      onPlayerDamageDealt(state, side, attackerAttachments);
    }
  }

  // VORPAL de cada lado, para quem derrubou a criatura oposta nesta batalha
  if (defenderDestroyed) {
    applyVorpalDamage(state, side, attacker, attackerAttachments, events);
  }
  if (attackerDestroyed) {
    applyVorpalDamage(state, oppositeSide(side), defender, defenderAttachments, events);
  }
}
