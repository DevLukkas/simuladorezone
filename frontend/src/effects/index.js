import { applyChangeElement } from './changeElement.js'
import { applyCreatureFieldEffects } from './creatureEffects.js'
import { applyDelayedEffect } from './delayedEffect.js'
import { applyModifyStat } from './modifyStat.js'
import { applySummonToken } from './summonToken.js'


const EFFECT_HANDLERS = {
  modify_stat: applyModifyStat,
}

const ABILITY_HANDLERS = {
  change_element: applyChangeElement,
}

const TRIGGER_HANDLERS = {
  delayed_effect: applyDelayedEffect,
  summon_token: applySummonToken,
}

export function createCreatureInstance(card) {
  return {
    ...card,
    instanceId: card.instanceId ?? `${card.id}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    element: card.element ?? card.elemento ?? 'neutro',
    rarity: card.rarity ?? card.raridade,
    baseStats: {
      attack: card.attack ?? 0,
      defense: card.defense ?? 0,
    },
    currentStats: {
      attack: card.attack ?? 0,
      defense: card.defense ?? 0,
    },
    damageTaken: card.damageTaken ?? 0,
    attachedCards: [],
    tempModifiers: card.tempModifiers ?? [],
  }
}

export function recalculateCreatureStats(creature, attachedCards = [], gameContext = {}) {
  if (!creature?.baseStats) return creature

  creature.currentStats = {
    attack: creature.baseStats.attack,
    defense: creature.baseStats.defense,
  }
  creature.attachedCards = attachedCards

  for (const card of attachedCards) {
    for (const effect of card.effects ?? []) {
      const handler = EFFECT_HANDLERS[effect.type]
      if (handler) handler(effect, { ...gameContext, creature, source: card })
    }
  }

  applyCreatureFieldEffects(creature, gameContext)

  for (const modifier of creature.permanentModifiers ?? []) {
    if (modifier.attack) creature.currentStats.attack += modifier.attack
    if (modifier.defense) creature.currentStats.defense += modifier.defense
  }

  for (const modifier of creature.tempModifiers ?? []) {
    if (modifier.attack) creature.currentStats.attack += modifier.attack
    if (modifier.defense) creature.currentStats.defense += modifier.defense
  }

  creature.currentStats.defense -= creature.damageTaken ?? 0

  return creature
}

export function canActivateAbility(ability, context = {}) {
  if (!ability || !matchesCondition(ability.condition, context)) return false
  if (ability.timing === 'once_per_turn') {
    const usedTurn = context.sourceState?.usedAbilities?.[ability.id]
    if (usedTurn === context.turn) return false
  }
  return true
}

export function activateAbility(ability, context = {}) {
  if (!canActivateAbility(ability, context)) return false

  const handler = ABILITY_HANDLERS[ability.action?.type]
  if (!handler) return false

  const applied = handler(ability, context)
  if (applied && ability.timing === 'once_per_turn') {
    context.sourceState.usedAbilities = context.sourceState.usedAbilities ?? {}
    context.sourceState.usedAbilities[ability.id] = context.turn
  }
  return applied
}

export function resolveTriggerEffects(effects = [], context = {}) {
  const results = []

  for (const effect of effects) {
    const handler = TRIGGER_HANDLERS[effect.type]
    if (!handler) continue

    const result = handler(effect, context)
    if (result) results.push(result)
  }

  return results
}

function matchesCondition(condition, context) {
  if (!condition) return true

  const creature = context.creature
  if (condition.attached_creature_race && creature?.raca !== condition.attached_creature_race) return false
  if (condition.attached_creature_element && creature?.element !== condition.attached_creature_element) return false
  return true
}
