export function canUseMainAction({ activePlayer, currentPhase, gameOver, turnActions }, type) {
  if (activePlayer !== 'my' || currentPhase !== 'main' || gameOver) return false
  if (type === 'summon') return !turnActions.summoned
  if (type === 'attach') return !turnActions.attached
  if (type === 'scenario') return true
  return true
}

export function canCreatureAttack({ activePlayer, currentPhase, gameOver, turnNumber, actor = 'my' }, creature) {
  if (activePlayer !== actor || currentPhase !== 'battle' || gameOver) return false
  if (!creature) return false
  if (creature.hasAttackedTurn === turnNumber) return false
  if ((creature.canAttackFromTurn ?? 1) > turnNumber) return false
  if ((creature.cannotAttackUntilTurn ?? 0) >= turnNumber) return false
  return true
}

export function canNormalSummon(card) {
  return card?.summonRule?.normal !== false
}

export function pointsForRarity(card) {
  const rarity = card?.raridade ?? card?.rarity
  if (['lendaria', 'lendario', 'legendary'].includes(rarity)) return 2
  if (['rara', 'raro', 'rare'].includes(rarity)) return 1
  return 0
}
