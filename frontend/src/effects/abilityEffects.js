export function abilityEffectNeedsTarget(effect) {
  return effect?.target === 'enemy_creature' || effect?.target === 'your_creature'
}

export function applyTargetedAbilityEffect(effect, context = {}) {
  const target = context.targetSlot?.card
  if (!target) return false

  switch (effect.type) {
    case 'choose_creature_then_modify_stat':
      return applyTargetedStatModifier(effect, context)
    default:
      return false
  }
}

function applyTargetedStatModifier(effect, context) {
  const target = context.targetSlot.card
  ensureCreatureStats(target)

  const stat = effect.stat
  if (!['attack', 'defense'].includes(stat)) return false

  const value = Number(effect.value) || 0
  const countValue = valueFromTargetRule(effect.value_per_card, context)
  const total = value + countValue
  if (!total) return false

  target.permanentModifiers = target.permanentModifiers ?? []
  target.permanentModifiers.push({ [stat]: total })
  target.currentStats[stat] += total
  return true
}

function valueFromTargetRule(rule, context) {
  if (!rule) return 0

  const perCard = Number(rule.value) || 0
  if (!perCard) return 0

  if (rule.zone === 'target_attachments') {
    return (context.targetSlot?.attachments?.length ?? 0) * perCard
  }

  return 0
}

function ensureCreatureStats(creature) {
  if (!creature.baseStats) {
    creature.baseStats = {
      attack: creature.attack ?? 0,
      defense: creature.defense ?? 0,
    }
  }

  if (!creature.currentStats) {
    creature.currentStats = {
      attack: creature.baseStats.attack,
      defense: creature.baseStats.defense,
    }
  }
}
