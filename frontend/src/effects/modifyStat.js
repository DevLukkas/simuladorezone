export function applyModifyStat(effect, context) {
  const creature = context.creature
  if (!creature?.currentStats) return

  const stat = effect.stat
  if (!['attack', 'defense'].includes(stat)) return
  if (effect.condition && !matchesEffectCondition(effect.condition, context)) return

  let value = Number(effect.value) || 0
  for (const conditional of effect.conditionals ?? []) {
    if (matchesCondition(conditional.if, creature)) {
      value = Number(conditional.value) || 0
    }
  }
  value += valueFromCardCount(effect.value_per_card, context)

  creature.currentStats[stat] += value
}

function matchesEffectCondition(condition, context) {
  if (!condition) return true

  if (condition.zone === 'your_field' && condition.count_same_element) {
    const creature = context.creature
    const needed = Number(condition.count_same_element) || 0
    const count = (context.yourField ?? []).filter(slot => (
      slot.card?.card_type === 'criatura' && slot.card.element === creature?.element
    )).length

    if (count < needed) return false
  }

  return true
}

function valueFromCardCount(rule, context) {
  if (!rule) return 0

  const perCard = Number(rule.value) || 0
  if (!perCard) return 0

  const cards = cardsFromZone(rule.zone, context)
  const count = cards.filter(card => matchesCardRule(card, rule, context)).length
  return count * perCard
}

function cardsFromZone(zone, context) {
  switch (zone) {
    case 'your_field':
      return (context.yourField ?? []).flatMap(slot => {
        const cards = []
        if (slot.card) cards.push(slot.card)
        for (const attachment of slot.attachments ?? []) {
          if (attachment.card) cards.push(attachment.card)
        }
        return cards
      })
    case 'attached_cards':
      return context.creature?.attachedCards ?? []
    default:
      return []
  }
}

function matchesCardRule(card, rule, context) {
  if (!card) return false
  if (rule.exclude_self && card.id === context.source?.id) return false
  if (rule.name_includes && !String(card.name ?? card.nome ?? '').includes(rule.name_includes)) return false
  if (rule.card_type && card.card_type !== rule.card_type) return false
  if (rule.race && card.raca !== rule.race) return false
  if (rule.element && card.element !== rule.element) return false
  return true
}

function matchesCondition(condition, creature) {
  if (!condition) return false
  if (condition.element && condition.element !== creature.element) return false
  if (condition.race && condition.race !== creature.raca) return false
  return true
}
