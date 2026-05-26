export function applyChangeElement(ability, context) {
  const creature = context.creature
  const element = context.choice?.element

  if (!creature || !element) return false
  if (ability.action?.choose && !ability.action.choose.includes(element)) return false

  creature.element = element
  return true
}
