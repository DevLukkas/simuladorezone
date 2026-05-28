export function matchesCardRule(card, rule = {}) {
  if (!card) return false
  const name = String(card.name ?? card.nome ?? '').toLowerCase()
  if (rule.name && name !== String(rule.name).toLowerCase()) return false
  if (rule.name_includes && !name.includes(String(rule.name_includes).toLowerCase())) return false
  if (rule.race && card.raca !== rule.race) return false
  if (rule.element && (card.element ?? card.elemento) !== rule.element) return false
  if (rule.card_type && card.card_type !== rule.card_type) return false
  return true
}

export function attachmentTargets(card, slots) {
  const attachmentType = normalizeType(card?.card_type ?? card?.tipo)
  if (!['item', 'habilidade'].includes(attachmentType)) return []

  return slots.filter(slot => {
    if (!slot.card || normalizeType(slot.card.card_type ?? slot.card.tipo) !== 'criatura') return false
    if (attachmentType === 'item') return true
    return elementsAreCompatible(card.element ?? card.elemento, slot.card.element ?? slot.card.elemento)
  })
}

export function elementsAreCompatible(attachmentElement, creatureElement) {
  if (!attachmentElement || !creatureElement) return false
  if (attachmentElement === creatureElement) return true
  return ['neutro', 'vazio'].includes(attachmentElement)
    && ['neutro', 'vazio'].includes(creatureElement)
}

function normalizeType(type) {
  return String(type ?? '').toLowerCase()
}

export function commandTargetSlots(effect, mySlots, oppSlots) {
  const slots = effect.target === 'enemy_creature' ? oppSlots : mySlots
  return slots.filter(slot => slot.card)
}

export function effectNeedsCreatureTarget(effect) {
  return ['enemy_creature', 'your_creature'].includes(effect?.target)
}
