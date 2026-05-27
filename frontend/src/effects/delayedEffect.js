export function applyDelayedEffect(effect) {
  if (!effect.trigger || !effect.effect) return null

  return {
    type: 'delayed_effect',
    trigger: effect.trigger,
    target: effect.target ?? 'attached_creature',
    effect: effect.effect,
  }
}
