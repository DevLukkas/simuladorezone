export function applyCreatureFieldEffects(creature, context = {}) {
  for (const slot of context.yourField ?? []) {
    const source = slot.card
    if (!source) continue

    for (const effect of source.effects ?? []) {
      if (effect.type !== 'aura_modify_stat') continue
      if (!matchesCreatureRule(creature, effect.filter ?? {}, source)) continue

      const stats = Array.isArray(effect.stats) ? effect.stats : [effect.stat]
      for (const stat of stats) {
        if (!['attack', 'defense'].includes(stat)) continue
        creature.currentStats[stat] += Number(effect.value) || 0
      }
    }
  }
}

export function matchesCreatureRule(creature, rule = {}, source = null) {
  if (!creature) return false
  const name = String(creature.name ?? creature.nome ?? '').toLowerCase()
  if (rule.exclude_self && source && creature.instanceId === source.instanceId) return false
  if (rule.race && (creature.race ?? creature.raca) !== rule.race) return false
  if (rule.element && (creature.element ?? creature.elemento) !== rule.element) return false
  if (rule.name && name !== String(rule.name).toLowerCase()) return false
  if (rule.name_includes && !name.includes(String(rule.name_includes).toLowerCase())) return false
  return true
}
