export function removeCardFromArray(cards, predicate) {
  const index = cards.findIndex(predicate)
  if (index === -1) return null
  return cards.splice(index, 1)[0]
}

export function pushRealCardToDiscard(discard, card) {
  if (!card || card.isToken) return false
  discard.push(card)
  return true
}

export function randomDiscard(hand, discard, randInt) {
  if (!hand.length) return null
  const index = randInt(0, hand.length - 1)
  const [card] = hand.splice(index, 1)
  if (card) discard.push(card)
  return card ?? null
}
