import { cardById } from '../data/cards.ts';
import type { Action, StatName, TriggerType } from '../data/types.ts';
import { cardMatches, creatureMatches, hasKeyword } from './cardsInPlay.ts';
import type { GameEvent } from './events.ts';
import type {
  AttachmentInPlay,
  CreatureInPlay,
  GameState,
  PendingTrigger,
  SideId,
} from './state.ts';
import { currentStats } from './stats.ts';
import { drawCards } from './zones.ts';

/**
 * Coleta e disparos imediatos de gatilhos. Ações que exigem escolha viram
 * trabalhos na fila (resolvidos em efeitos.ts); ações automáticas (marcadores,
 * cenário, heróis) aplicam aqui mesmo.
 */

export function applyMarker(
  creature: CreatureInPlay,
  side: SideId,
  stats: StatName[],
  value: number,
  events: GameEvent[],
): void {
  if (!value) return;
  const attack = stats.includes('attack') ? value : 0;
  const defense = stats.includes('defense') ? value : 0;
  creature.markers.attack += attack;
  creature.markers.defense += defense;
  events.push({ type: 'MARKER_ADDED', side, creatureUid: creature.uid, attack, defense });
}

function triggeredAbilitiesOf(creature: CreatureInPlay) {
  if (creature.cardId === null) return [];
  const card = cardById(creature.cardId);
  if (card.type !== 'creature') return [];
  return card.triggeredAbilities ?? [];
}

/** Lobo do Uivo: outra criatura (que case com o filtro) entrou no seu campo. */
export function onOtherCreatureEntered(
  state: GameState,
  side: SideId,
  entrou: CreatureInPlay,
  events: GameEvent[],
): void {
  for (const source of state.sides[side].field) {
    if (!source || source.uid === entrou.uid) continue;
    for (const ability of triggeredAbilitiesOf(source)) {
      if (ability.trigger !== 'ally_enters') continue;
      if (!creatureMatches(entrou, ability.filter)) continue;
      if (ability.action.type === 'add_marker') {
        const target = ability.action.target === 'self' ? source : entrou;
        applyMarker(target, side, ability.action.stats, ability.action.value ?? 0, events);
      }
    }
  }
}

/**
 * Uma ação de descarte só entra na corrente se o motor conseguir resolvê-la
 * AGORA — sem alvo disponível ela viraria uma pergunta sem resposta possível.
 */
function discardActionCanResolve(
  state: GameState,
  side: SideId,
  action: Action,
): boolean {
  const owner = state.sides[side];
  switch (action.type) {
    case 'add_marker':
      return owner.field.some((slot) => slot !== null);
    case 'summon_token':
      return owner.field.some((slot) => slot === null);
    case 'summon_from_deck':
      return (
        owner.field.some((slot) => slot === null) &&
        owner.deck.some((node) => cardMatches(node.cardId, action.filter))
      );
    case 'prevent_attack':
      return state.sides[side === 'a' ? 'b' : 'a'].field.some((slot) => slot !== null);
    default:
      return false;
  }
}

/** Descartes da mesma leva entram no mesmo lote (o buffer do legado agrupava
 * tudo do mesmo tick), e empate de prioridade vira escolha de ordem. */
function enqueueBatch(state: GameState, batch: PendingTrigger[]): void {
  if (!batch.length) return;
  const tail = state.queue[state.queue.length - 1];
  if (tail?.type === 'trigger_batch') {
    tail.triggers.push(...batch);
    return;
  }
  state.queue.push({ type: 'trigger_batch', triggers: batch });
}

/**
 * Uma carta de criatura chegou ao descarte do dono: corrente opcional do
 * `sent_to_your_discard` (Mímico, vale vindo de qualquer zona) e, quando ela
 * veio do CAMPO, também do `sent_from_field_to_your_discard` (Lobo das Presas
 * Prateadas, Poltergeist, Ceifador).
 */
export function onCreatureCardEnteredDiscard(
  state: GameState,
  side: SideId,
  cardId: number,
  uid: string,
  doCampo = false,
): void {
  const card = cardById(cardId);
  if (card.type !== 'creature') return;

  const batch: PendingTrigger[] = [];
  for (const ability of card.triggeredAbilities ?? []) {
    const matches =
      ability.trigger === 'self_sent_to_discard' ||
      (doCampo && ability.trigger === 'self_sent_to_discard_from_field');
    if (!matches) continue;
    if (!discardActionCanResolve(state, side, ability.action)) continue;
    batch.push({
      side,
      sourceUid: uid,
      sourceCardId: cardId,
      action: ability.action,
      priority: 20,
    });
  }
  enqueueBatch(state, batch);
}

/**
 * Uma criatura real saiu do CAMPO para o descarte: marcadores imediatos de
 * quem ficou (Badur, o Urso Guardião) + a corrente da própria carta.
 */
export function onCreatureLeftFieldToDiscard(
  state: GameState,
  side: SideId,
  discarded: CreatureInPlay,
  events: GameEvent[],
): void {
  for (const source of state.sides[side].field) {
    if (!source || source.uid === discarded.uid) continue;
    for (const ability of triggeredAbilitiesOf(source)) {
      if (ability.trigger !== 'ally_sent_to_discard') continue;
      if (!creatureMatches(discarded, ability.filter)) continue;
      if (ability.action.type === 'add_marker' && ability.action.target === 'self') {
        applyMarker(source, side, ability.action.stats, ability.action.value ?? 0, events);
      }
    }
  }
  scenarioOnCreatureDiscarded(state, side, discarded);
  if (discarded.cardId !== null) {
    onCreatureCardEnteredDiscard(state, side, discarded.cardId, discarded.uid, true);
  }
}

/** Caverna do Guardião Badur: Besta sua foi ao descarte → buff opcional no Urso. */
function scenarioOnCreatureDiscarded(
  state: GameState,
  side: SideId,
  discarded: CreatureInPlay,
): void {
  const owner = state.sides[side];
  if (!owner.scenario) return;
  const card = cardById(owner.scenario.cardId);
  if (card.type !== 'scenario') return;

  const batch: PendingTrigger[] = [];
  for (const effect of card.effects) {
    if (effect.type !== 'on_ally_sent_to_discard_buff_ally') continue;
    if (!creatureMatches(discarded, effect.when)) continue;
    const hasTarget = owner.field.some(
      (creature) =>
        creature !== null &&
        creature.uid !== discarded.uid &&
        creatureMatches(creature, effect.target),
    );
    if (!hasTarget) continue;
    batch.push({
      side,
      sourceUid: owner.scenario.uid,
      sourceCardId: card.id,
      action: {
        type: 'modify_stats',
        target: 'chosen_ally',
        duration: 'until_end_of_turn',
        filter: effect.target,
        stats: effect.stats,
        value: effect.value,
      },
      priority: 20,
    });
  }
  enqueueBatch(state, batch);
}

/** Reflexos de Morte: gatilhos `attached_creature_is_attacked` do defensor. */
export function onCreatureAttacked(
  state: GameState,
  side: SideId,
  attachments: readonly AttachmentInPlay[],
): void {
  enqueueAttachmentTriggers(state, side, attachments, 'host_is_attacked');
}

/** Mapa do Tesouro: gatilhos `attached_creature_deals_player_damage`. */
export function onPlayerDamageDealt(
  state: GameState,
  side: SideId,
  attachments: readonly AttachmentInPlay[],
): void {
  enqueueAttachmentTriggers(state, side, attachments, 'host_deals_player_damage');
}

function enqueueAttachmentTriggers(
  state: GameState,
  side: SideId,
  attachments: readonly AttachmentInPlay[],
  trigger: TriggerType,
): void {
  for (const attachment of attachments) {
    const card = cardById(attachment.cardId);
    if (card.type !== 'ability' && card.type !== 'item') continue;
    for (const ability of card.triggeredAbilities ?? []) {
      if (ability.trigger !== trigger) continue;
      state.queue.push({
        type: 'trigger',
        trigger: {
          side,
          sourceUid: attachment.uid,
          sourceCardId: attachment.cardId,
          action: ability.action,
          priority: 50,
        },
      });
    }
  }
}

/** Posse de Objetos Inanimados: anexo saiu do campo para o descarte fora da batalha. */
export function onAttachmentDiscarded(
  state: GameState,
  side: SideId,
  attachmentUid: string,
  attachmentCardId: number,
  outsideBattle: boolean,
): void {
  if (!outsideBattle) return;
  const card = cardById(attachmentCardId);
  if (card.type !== 'ability' && card.type !== 'item') return;
  for (const ability of card.triggeredAbilities ?? []) {
    if (ability.trigger !== 'self_sent_to_discard_outside_battle') continue;
    state.queue.push({
      type: 'trigger',
      trigger: {
        side,
        sourceUid: attachmentUid,
        sourceCardId: attachmentCardId,
        action: ability.action,
        priority: 50,
      },
    });
  }
}

/** Gatilhos `attached_creature_attacks` dos anexos do atacante. */
export function onCreatureAttacks(
  state: GameState,
  side: SideId,
  attacker: CreatureInPlay,
  events: GameEvent[],
): void {
  for (const attachment of attacker.attachments) {
    const card = cardById(attachment.cardId);
    if (card.type !== 'ability' && card.type !== 'item') continue;
    for (const ability of card.triggeredAbilities ?? []) {
      if (ability.trigger !== 'host_attacks') continue;
      const action = ability.action;
      if (action.type === 'modify_stats') {
        // Guardião Enlouquecido: buff automático nas OUTRAS aliadas que casam
        for (const ally of state.sides[side].field) {
          if (!ally || !creatureMatches(ally, action.filter)) continue;
          if (action.exclude_source && ally.uid === attacker.uid) continue;
          const attack = action.stats.includes('attack') ? (action.value ?? 0) : 0;
          const defense = action.stats.includes('defense') ? (action.value ?? 0) : 0;
          ally.temporaryModifiers.push({ attack, defense, expiresAfterTurn: state.turn });
          events.push({
            type: 'TEMPORARY_MODIFIER',
            side,
            creatureUid: ally.uid,
            attack,
            defense,
          });
        }
      } else {
        state.queue.push({
          type: 'trigger',
          trigger: {
            side,
            sourceUid: attachment.uid,
            sourceCardId: attachment.cardId,
            action,
            priority: 50,
          },
        });
      }
    }
  }
}

/** Caverna do Guardião Badur: 1ª criatura inimiga destruída em batalha no turno. */
export function scenarioOnBattleDestroy(
  state: GameState,
  destroyedSide: SideId,
  events: GameEvent[],
): void {
  const ownerSide: SideId = destroyedSide === 'a' ? 'b' : 'a';
  const owner = state.sides[ownerSide];
  if (!owner.scenario) return;
  const card = cardById(owner.scenario.cardId);
  if (card.type !== 'scenario') return;

  for (const effect of card.effects) {
    if (effect.type !== 'on_enemy_destroyed_in_battle_draw') continue;
    if (
      effect.requiresYourCreature &&
      !owner.field.some(
        (creature) => creature !== null && creatureMatches(creature, effect.requiresYourCreature),
      )
    ) {
      continue;
    }
    const key = `${card.id}:${effect.type}`;
    if (effect.oncePerTurn && owner.scenarioFlags[key]) continue;
    owner.scenarioFlags[key] = true;
    events.push({ type: 'SCENARIO_TRIGGERED', side: ownerSide, cardId: card.id });
    drawCards(state, ownerSide, Math.max(1, effect.value), events);
  }
}

/** Herói Badur (Pele de Pedra): +1 de vida máxima a criatura Terra ao entrar. */
export function heroOnCreatureEnter(
  state: GameState,
  side: SideId,
  creature: CreatureInPlay,
  events: GameEvent[],
): void {
  const owner = state.sides[side];
  if (owner.hero !== 'badur') return;
  if (creature.stoneSkinApplied) return;
  const card = creature.cardId === null ? null : cardById(creature.cardId);
  const element = creature.changedElement ?? (card?.type === 'creature' ? card.element : creature.token?.element);
  if (element !== 'earth') return;
  creature.stoneSkinApplied = true;
  events.push({ type: 'HERO_ACTIVATED', side, hero: 'badur' });
  applyMarker(creature, side, ['defense'], 1, events);
}

/**
 * REGENERAR: no início do turno do dono, cada criatura dele com a palavra
 * recupera 1 de vida. Só cura o que está ferido — a palavra não passa da vida
 * impressa. Resolve antes do herói (decisão nº 13).
 */
export function regenerateOnTurnStart(
  state: GameState,
  side: SideId,
  events: GameEvent[],
): void {
  for (const creature of state.sides[side].field) {
    if (!creature || creature.damage <= 0) continue;
    if (!hasKeyword(creature, 'regenerate')) continue;
    creature.damage -= 1;
    events.push({ type: 'CREATURE_HEALED', side, creatureUid: creature.uid, value: 1 });
  }
}

/** Herói Ispisher (Maré Restauradora): cura 1 da aliada ferida com menos vida. */
export function heroOnTurnStart(state: GameState, side: SideId, events: GameEvent[]): void {
  const owner = state.sides[side];
  if (owner.hero !== 'ispisher') return;

  let target: CreatureInPlay | null = null;
  let lowestHealth = Infinity;
  for (const creature of owner.field) {
    if (!creature || creature.damage <= 0) continue;
    const health = currentStats(creature, owner.field).defense;
    if (health > 0 && health < lowestHealth) {
      lowestHealth = health;
      target = creature;
    }
  }
  if (!target) return;
  target.damage = Math.max(0, target.damage - 1);
  events.push({ type: 'HERO_ACTIVATED', side, hero: 'ispisher' });
  events.push({ type: 'CREATURE_HEALED', side, creatureUid: target.uid, value: 1 });
}
