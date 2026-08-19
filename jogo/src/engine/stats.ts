import { cardById } from '../data/cards.ts';
import type { PerCardCount, ContinuousEffect, CardFilter } from '../data/types.ts';
import { creatureMatches, creatureDef, currentElement } from './cardsInPlay.ts';
import type { CreatureInPlay } from './state.ts';

export interface Stats {
  attack: number;
  defense: number;
}

/**
 * Porta de `recalculateCreatureStats` do legado, como função pura:
 * base + modify_stat dos anexos + auras do próprio campo + marcadores
 * + modificadores temporários − dano sofrido. `defense` é a vida atual.
 */
export function currentStats(
  creature: CreatureInPlay,
  sideField: readonly (CreatureInPlay | null)[],
): Stats {
  const def = creatureDef(creature);
  const stats: Stats = { attack: def.attack, defense: def.health };

  for (const attachment of creature.attachments) {
    const card = cardById(attachment.cardId);
    if (card.type !== 'ability' && card.type !== 'item') continue;
    for (const effect of card.effects ?? []) {
      applyModifyStat(effect, stats, creature, sideField, card.id);
    }
  }

  for (const source of sideField) {
    if (!source || source.cardId === null) continue;
    const sourceCard = cardById(source.cardId);
    if (sourceCard.type !== 'creature') continue;
    for (const effect of sourceCard.effects ?? []) {
      if (effect.type !== 'aura_modify_stat') continue;
      if (effect.exclude_source && source.uid === creature.uid) continue;
      if (!creatureMatches(creature, effect.filter)) continue;
      for (const stat of effect.stats) {
        stats[stat] += effect.value;
      }
    }
  }

  stats.attack += creature.markers.attack;
  stats.defense += creature.markers.defense;
  for (const mod of creature.temporaryModifiers) {
    stats.attack += mod.attack;
    stats.defense += mod.defense;
  }

  // Sapotristan: a troca vale enquanto o elemento da criatura estiver alterado
  if (creature.swapStatsWhileElementChanged && creature.changedElement) {
    const attack = stats.attack;
    stats.attack = stats.defense;
    stats.defense = attack;
  }

  stats.defense -= creature.damage;
  return stats;
}

function applyModifyStat(
  effect: ContinuousEffect,
  stats: Stats,
  creature: CreatureInPlay,
  sideField: readonly (CreatureInPlay | null)[],
  sourceCardId: number,
): void {
  if (effect.type !== 'modify_stat') return;
  if (effect.condition && !fieldConditionHolds(effect.condition, creature, sideField)) return;

  let value = effect.value ?? 0;
  for (const conditional of effect.conditionals ?? []) {
    if (creatureMatches(creature, conditional.if)) value = conditional.value;
  }
  value += valuePerCardCount(effect.value_per_card, sideField, sourceCardId, creature);

  stats[effect.stat] += value;
}

function fieldConditionHolds(
  condition: { zone: 'your_field'; count_same_element: number },
  creature: CreatureInPlay,
  sideField: readonly (CreatureInPlay | null)[],
): boolean {
  const element = currentElement(creature);
  const howMany = sideField.filter(
    (other) => other !== null && currentElement(other) === element,
  ).length;
  return howMany >= condition.count_same_element;
}

/**
 * "+X por carta": conta cartas na zona indicada. Em `your_field` valem tanto
 * as criaturas quanto os anexos delas (paridade com `cardsFromZone` do legado,
 * inclusive o `exclude_self` por id de catálogo — todas as cópias da carta
 * fonte ficam de fora, não só a própria); `exclude_holder` tira da conta a
 * criatura que carrega o anexo ("cada OUTRO Espectro", Esfera da Aura).
 * Em `target_attachments` conta os anexos da própria criatura (Afogamento).
 */
function valuePerCardCount(
  rule: PerCardCount | undefined,
  sideField: readonly (CreatureInPlay | null)[],
  sourceCardId: number,
  holder: CreatureInPlay,
): number {
  if (!rule || !rule.value) return 0;
  if (rule.zone === 'target_attachments') return holder.attachments.length * rule.value;
  if (rule.zone !== 'your_field') return 0;

  let howMany = 0;
  for (const other of sideField) {
    if (!other) continue;
    if (rule.exclude_holder && other.uid === holder.uid) continue;
    if (fieldCardMatches(other, rule, sourceCardId)) howMany++;
    for (const attachment of other.attachments) {
      if (attachmentMatches(attachment.cardId, rule, sourceCardId)) howMany++;
    }
  }
  return howMany * rule.value;
}

function fieldCardMatches(
  creature: CreatureInPlay,
  rule: PerCardCount,
  sourceCardId: number,
): boolean {
  if (rule.exclude_self && creature.cardId === sourceCardId) return false;
  const filter: CardFilter = {};
  if (rule.race) filter.race = rule.race;
  if (rule.name_includes) filter.name_includes = rule.name_includes;
  return creatureMatches(creature, filter);
}

function attachmentMatches(cardId: number, rule: PerCardCount, sourceCardId: number): boolean {
  if (rule.card_type === 'creature') return false;
  if (rule.exclude_self && cardId === sourceCardId) return false;
  const card = cardById(cardId);
  if (rule.race) return false;
  if (
    rule.name_includes &&
    !card.name.toLowerCase().includes(rule.name_includes.toLowerCase())
  ) {
    return false;
  }
  return true;
}
