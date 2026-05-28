import { randomDiscard } from './zoneActions.js'

export function aiDiscardRandom(state, count = 1, randInt = randomInt) {
  const discarded = []
  for (let i = 0; i < count; i++) {
    const card = randomDiscard(state.hand, state.discard, randInt)
    if (!card) break
    discarded.push(card)
  }
  return discarded
}

export function aiChooseFirstSlot(slots = []) {
  return slots.find(slot => slot.card) ?? null
}

export function aiChooseFirstEmptySlot(slots = []) {
  return slots.find(slot => !slot.card) ?? null
}

export function aiChooseFirstCard(cards = []) {
  return cards[0] ?? null
}

export function aiShouldAcceptOptional() {
  return false
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
